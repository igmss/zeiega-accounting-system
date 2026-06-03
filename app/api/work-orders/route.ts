import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order-service";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service";
import { getServiceClient, TABLES } from "@/lib/supabase";
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers";

// GET /api/work-orders - Get all work orders with design information
export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const workOrders = await WorkOrderService.getAllWorkOrdersWithDesigns();
    return NextResponse.json({ success: true, data: workOrders, count: workOrders.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch work orders" }, { status: 500 });
  }
}

// POST /api/work-orders - Create a new work order with design integration
export async function POST(request: NextRequest) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const workOrderData = await request.json();

    if (workOrderData.items && workOrderData.items.length > 0) {
      const result = await OrderItemDesignService.createWorkOrderWithAutoCosts(
        workOrderData.sales_order_id, workOrderData.items, workOrderData
      );
      if (result.success) return NextResponse.json({ success: true, workOrderId: result.workOrderId, totalEstimatedCost: result.totalEstimatedCost, itemCosts: result.itemCosts });
    }

    if (workOrderData.design_id) {
      const result = await WorkOrderService.createWorkOrderWithDesign(
        workOrderData.sales_order_id, workOrderData.design_id, workOrderData.quantity || 1, workOrderData
      );
      if (result.success) return NextResponse.json({ success: true, workOrderId: result.workOrderId, estimatedCost: result.estimatedCost });
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const result = await WorkOrderService.createBasicWorkOrder(workOrderData);
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, workOrderId: result.workOrderId, message: "Basic work order created - manual cost entry required" });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to create work order" }, { status: 500 });
  }
}

// PUT /api/work-orders - Update work order + auto-issue materials on in_progress
export async function PUT(request: Request) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { id, ...workOrderData } = await request.json()

    const result = await WorkOrderService.updateWorkOrder(id, workOrderData)
    if (!result.success) return NextResponse.json({ error: result.error || "Failed to update work order" }, { status: 400 })

    if (workOrderData.status === "in_progress" || workOrderData.status === "producing") {
      try {
        const serviceDb = getServiceClient()
        const { data: wo } = await serviceDb.from(TABLES.WORK_ORDERS).select("*").eq("id", id).maybeSingle()

        console.log(`[DEBUG:PUT:START] WO ${id} — status=${workOrderData.status}`)
        console.log(`[DEBUG:PUT:WO] design_id=${wo?.design_id}, items=${JSON.stringify(wo?.items)}, quantity=${wo?.quantity}`)
        console.log(`[DEBUG:PUT:WO] materials_issued=${JSON.stringify(wo?.materials_issued)}, raw_materials_used=${JSON.stringify(wo?.raw_materials_used)}`)
        console.log(`[DEBUG:PUT:WO] total_cost=${wo?.total_cost}, labor_cost=${wo?.labor_cost}, overhead_cost=${wo?.overhead_cost}`)

        if (!wo) {
          console.log(`[DEBUG:PUT:WO] WO not found in DB`)
          return NextResponse.json({ id, status: workOrderData.status, success: true })
        }

        const alreadyIssued = Array.isArray(wo.materials_issued) && wo.materials_issued.length > 0
        if (alreadyIssued) {
          console.log(`[DEBUG:PUT:GUARD] materials_issued already has ${wo.materials_issued.length} entries, skipping`)
          return NextResponse.json({ id, status: workOrderData.status, success: true, message: "Materials already issued" })
        }

        let materialsToIssue: any[] = []

        if (wo.design_id) {
          const { data: design, error: designErr } = await serviceDb.from(TABLES.DESIGNS).select("id,materials").eq("id", wo.design_id).maybeSingle()
          console.log(`[DEBUG:PUT:DESIGN] lookup for ${wo.design_id}: found=${!!design}, error=${designErr?.message || 'none'}`)
          if (design?.materials) {
            const mats = Array.isArray(design.materials) ? design.materials : []
            console.log(`[DEBUG:PUT:DESIGN] materials count=${mats.length}, raw=${JSON.stringify(mats).substring(0, 300)}`)
            const orderQty = wo.items?.[0]?.quantity || wo.items?.[0]?.qty || wo.quantity || 1
            console.log(`[DEBUG:PUT:QTY] orderQty=${orderQty} (items[0].quantity=${wo.items?.[0]?.quantity}, items[0].qty=${wo.items?.[0]?.qty}, wo.quantity=${wo.quantity})`)
            materialsToIssue = mats.map((m: any) => ({
              materialId: m.inventoryItemId || m.itemId || m.id,
              quantity: (m.quantityPerUnit || m.quantityRequired || 0) * orderQty,
            })).filter((m: any) => m.materialId && m.quantity > 0)
            console.log(`[DEBUG:PUT:DESIGN] resolved materialsToIssue=${materialsToIssue.length} items: ${JSON.stringify(materialsToIssue)}`)
            if (materialsToIssue.length === 0 && mats.length > 0) {
              console.warn(`[DEBUG:PUT:DESIGN] ${mats.length} materials but all filtered — check quantityPerUnit/quantityRequired > 0 and inventoryItemId is set`)
            }
          } else {
            console.log(`[DEBUG:PUT:DESIGN] design ${wo.design_id} exists but has no materials array`)
          }
        } else {
          console.log(`[DEBUG:PUT:DESIGN] WO has no design_id`)
        }

        if (materialsToIssue.length === 0 && wo.raw_materials_used) {
          const rawUsed = Array.isArray(wo.raw_materials_used) ? wo.raw_materials_used : []
          console.log(`[DEBUG:PUT:RAW] raw_materials_used has ${rawUsed.length} entries: ${JSON.stringify(rawUsed)}`)
          materialsToIssue = rawUsed.map((m: any) => ({
            materialId: m.item_id || m.itemId || m.materialId || m.inventoryItemId,
            quantity: m.qty || m.quantity || 0,
          })).filter((m: any) => m.materialId && m.quantity > 0)
          console.log(`[DEBUG:PUT:RAW] resolved from raw_materials_used: ${materialsToIssue.length} items`)
        }

        if (materialsToIssue.length > 0) {
          const accountingMaterials: any[] = []
          const inventoryRefs: Array<{ id: string; qty: number }> = []

          for (const mat of materialsToIssue) {
            console.log(`[DEBUG:PUT:INV] looking up inventory for materialId=${mat.materialId}, qty=${mat.quantity}`)
            const { data: invData, error: invErr } = await serviceDb.from(TABLES.INVENTORY_ITEMS).select("*").or(`id.eq.${mat.materialId},sku.eq.${mat.materialId}`).limit(1).maybeSingle()
            console.log(`[DEBUG:PUT:INV] result: found=${!!invData}, error=${invErr?.message || 'none'}, name=${invData?.name}, cost_per_unit=${invData?.cost_per_unit}`)
            if (invData) {
              const uc = invData.cost_per_unit || 0
              accountingMaterials.push({ itemId: invData.id, itemName: invData.name, quantity: mat.quantity, unitCost: uc })
              inventoryRefs.push({ id: invData.id, qty: mat.quantity })
            }
          }

            if (accountingMaterials.length > 0) {
              console.log(`[DEBUG:PUT:ACC] recording material issue: ${JSON.stringify(accountingMaterials)}`)
              const accResult = await EnhancedAccountingService.recordMaterialIssue(id, accountingMaterials)
              console.log(`[DEBUG:PUT:ACC] recordMaterialIssue result: success=${accResult.success}, entryId=${accResult.entryId}, error=${accResult.error}`)
              if (accResult.success) {
                const totalMC = accountingMaterials.reduce((s: number, m: any) => s + (m.quantity * m.unitCost), 0)
                const issuedPayload = accountingMaterials.map((m: any) => ({ itemId: m.itemId, itemName: m.itemName, quantity: m.quantity, unitCost: m.unitCost, totalCost: m.quantity * m.unitCost }))
                const rawMaterialsForUI = accountingMaterials.map((m: any) => ({ item_id: m.itemId, qty: m.quantity, cost: m.unitCost }))
                const newTotalCost = totalMC + (wo.labor_cost || 0) + (wo.overhead_cost || 0)
                console.log(`[DEBUG:PUT:WO:UPDATE] setting total_cost=${newTotalCost}, materials_issued=${JSON.stringify(issuedPayload)}`)
                await serviceDb.from(TABLES.WORK_ORDERS).update({
                  raw_materials_used: rawMaterialsForUI,
                  materials_issued: issuedPayload,
                  total_cost: newTotalCost,
                updated_at: new Date().toISOString()
              }).eq("id", id)

              for (const inv of inventoryRefs) {
                const { data: curr } = await serviceDb.from(TABLES.INVENTORY_ITEMS).select("quantity_on_hand,sku").eq("id", inv.id).maybeSingle()
                if (curr) {
                  await serviceDb.from(TABLES.INVENTORY_ITEMS).update({ quantity_on_hand: Math.max(0, (curr.quantity_on_hand || 0) - inv.qty) }).eq("id", inv.id)
                  await serviceDb.from(TABLES.INVENTORY_MOVEMENTS).insert({
                    item_id: inv.id,
                    sku: curr.sku || inv.id,
                    qty: -inv.qty,
                    type: "issue",
                    related_doc: id,
                    notes: `Issued to WO ${id} — ${accountingMaterials.find((m: any) => m.itemId === inv.id)?.itemName || 'material'} × ${inv.qty}`,
                    created_at: new Date().toISOString()
                  })
                }
              }
              await serviceDb.from(TABLES.WORK_ORDERS).update({ completion_percentage: 30 }).eq("id", id)
            } else {
              console.error(`[DEBUG:PUT:ACC] FAILED to create material issue JE: ${accResult.error}`)
            }
          } else {
            console.warn(`[DEBUG:PUT:INV] ${materialsToIssue.length} materials resolved but NONE matched inventory items`)
          }
        } else {
          console.log(`[DEBUG:PUT:SKIP] no materials to auto-issue — design_id=${wo.design_id || 'none'}, raw_materials_used=${wo.raw_materials_used ? JSON.stringify(wo.raw_materials_used).substring(0, 100) : 'none'}, items=${JSON.stringify(wo.items).substring(0, 100)}`)
          
          // Fallback: use WO's material_cost as lump-sum material issue
          const fallbackMatCost = Number(wo.material_cost) || 0;
          if (fallbackMatCost > 0) {
            console.log(`[DEBUG:PUT:FALLBACK] using WO material_cost=${fallbackMatCost} as lump-sum issue`)
            const accResult = await EnhancedAccountingService.recordMaterialIssue(id, [
              { itemId: "WO-MAT", itemName: `Materials for ${wo.wo_number || id}`, quantity: 1, unitCost: fallbackMatCost }
            ]);
            if (accResult.success) {
              await serviceDb.from(TABLES.WORK_ORDERS).update({
                total_cost: fallbackMatCost + (wo.labor_cost || 0) + (wo.overhead_cost || 0),
                updated_at: new Date().toISOString()
              }).eq("id", id)
              console.log(`[DEBUG:PUT:FALLBACK] posted lump-sum material JE`)
            }
          }
        }
        console.log(`[DEBUG:PUT:END] WO ${id} — material issue done`)

        // Auto-apply labor and overhead from WO costs (set during creation from design)
        const woLaborCost = wo.labor_cost || 0
        const woOverheadCost = wo.overhead_cost || 0

        if (woLaborCost > 0) {
          const { data: existingLaborJE } = await serviceDb.from(TABLES.JOURNAL_ENTRIES)
            .select("id")
            .eq("reference_id", id)
            .eq("type", "LABOR_APPLIED")
            .maybeSingle()

          if (!existingLaborJE) {
            console.log(`[DEBUG:PUT:LABOR] auto-applying labor_cost=${woLaborCost} for WO ${id}`)
            const laborResult = await EnhancedAccountingService.recordLaborApplied(id, Math.max(1, woLaborCost / 50), 50)
            if (laborResult.success) {
              await serviceDb.from(TABLES.WORK_ORDERS).update({ completion_percentage: 60 }).eq("id", id)
              console.log(`[DEBUG:PUT:LABOR] OK, entryId=${laborResult.entryId}`)
            } else {
              console.error(`[DEBUG:PUT:LABOR] FAILED: ${laborResult.error}`)
            }
          } else {
            console.log(`[DEBUG:PUT:LABOR] already applied, skipping`)
          }
        }

        if (woOverheadCost > 0) {
          const { data: existingOHJE } = await serviceDb.from(TABLES.JOURNAL_ENTRIES)
            .select("id")
            .eq("reference_id", id)
            .eq("type", "OVERHEAD_APPLIED")
            .maybeSingle()

          if (!existingOHJE) {
            console.log(`[DEBUG:PUT:OH] auto-applying overhead_cost=${woOverheadCost} for WO ${id}`)
            const ohResult = await EnhancedAccountingService.recordOverheadApplied(id, woOverheadCost)
            if (ohResult.success) {
              await serviceDb.from(TABLES.WORK_ORDERS).update({ completion_percentage: 90 }).eq("id", id)
              console.log(`[DEBUG:PUT:OH] OK, entryId=${ohResult.entryId}`)
            } else {
              console.error(`[DEBUG:PUT:OH] FAILED: ${ohResult.error}`)
            }
          } else {
            console.log(`[DEBUG:PUT:OH] already applied, skipping`)
          }
        }

        console.log(`[DEBUG:PUT:END] WO ${id} — done`)
      } catch (innerErr) {
        console.error("[DEBUG:PUT:ERROR]", innerErr)
      }
    }

    if (workOrderData.status === "completed") {
      try {
        const serviceDb = getServiceClient()
        await serviceDb.from(TABLES.WORK_ORDERS).update({
          updated_at: new Date().toISOString()
        }).eq("id", id)
      } catch (innerErr) {
        console.error("Status update failed:", innerErr)
      }
    }

    return NextResponse.json({ id, status: workOrderData.status, success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update work order" }, { status: 500 })
  }
}
