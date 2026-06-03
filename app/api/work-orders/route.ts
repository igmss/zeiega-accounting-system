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

        if (!wo.design_id) {
          console.warn(`[DEBUG:PUT:BOM] WO has no design_id — cannot resolve BOM, skipping materials`)
        } else {
          console.log(`[DEBUG:PUT:BOM] looking up active BOM for design ${wo.design_id}`)
          const { data: bom } = await serviceDb.from("bom")
            .select("id,items,status,labor_hours,labor_rate,overhead_percentage")
            .eq("design_id", wo.design_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!bom || !Array.isArray(bom.items) || bom.items.length === 0) {
            const msg = `No active BOM found for design ${wo.design_id}. Create and activate a BOM first.`
            console.warn(`[DEBUG:PUT:BOM] ${msg}`)
            return NextResponse.json({ success: false, error: msg }, { status: 400 })
          }

          const orderQty = wo.items?.[0]?.quantity || wo.items?.[0]?.qty || wo.quantity || 1
          console.log(`[DEBUG:PUT:BOM] found BOM ${bom.id} with ${bom.items.length} items, orderQty=${orderQty}`)

          materialsToIssue = bom.items.map((bi: any) => ({
            materialId: bi.material_id || bi.materialId,
            materialName: bi.material_name || bi.materialName || "Unknown",
            quantity: (bi.quantity || 1) * orderQty,
            unitCost: bi.unit_cost || bi.unitCost || 0,
            wasteFactor: bi.waste_factor || 0,
          })).filter((m: any) => m.materialId && m.quantity > 0)

          if (materialsToIssue.length === 0) {
            return NextResponse.json({ success: false, error: `BOM ${bom.id} has no valid materials` }, { status: 400 })
          }

          // Build accounting materials from BOM (use BOM costs directly)
          const accountingMaterials = materialsToIssue.map((m: any) => ({
            itemId: m.materialId,
            itemName: m.materialName,
            quantity: m.quantity,
            unitCost: m.unitCost,
          }))

          console.log(`[DEBUG:PUT:BOM] issuing ${accountingMaterials.length} materials: ${JSON.stringify(accountingMaterials)}`)
          const accResult = await EnhancedAccountingService.recordMaterialIssue(id, accountingMaterials)
          if (!accResult.success) {
            console.error(`[DEBUG:PUT:BOM] material JE failed: ${accResult.error}`)
            return NextResponse.json({ success: false, error: accResult.error || "Material JE failed" }, { status: 500 })
          }

          const totalMC = accountingMaterials.reduce((s: number, m: any) => s + (m.quantity * m.unitCost), 0)
          const issuedPayload = accountingMaterials.map((m: any) => ({
            itemId: m.itemId, itemName: m.itemName,
            quantity: m.quantity, unitCost: m.unitCost,
            totalCost: m.quantity * m.unitCost
          }))
          const newTotalCost = totalMC + (wo.labor_cost || 0) + (wo.overhead_cost || 0)

          await serviceDb.from(TABLES.WORK_ORDERS).update({
            materials_issued: issuedPayload,
            total_cost: newTotalCost,
            updated_at: new Date().toISOString()
          }).eq("id", id)

          // Deduct inventory stock for matched items
          for (const mat of materialsToIssue) {
            const { data: invData } = await serviceDb.from(TABLES.INVENTORY_ITEMS)
              .select("id,quantity_on_hand,sku")
              .or(`id.eq.${mat.materialId},sku.eq.${mat.materialId}`)
              .limit(1).maybeSingle()
            if (invData) {
              await serviceDb.from(TABLES.INVENTORY_ITEMS)
                .update({ quantity_on_hand: Math.max(0, (invData.quantity_on_hand || 0) - mat.quantity) })
                .eq("id", invData.id)
              await serviceDb.from(TABLES.INVENTORY_MOVEMENTS).insert({
                item_id: invData.id, sku: invData.sku || invData.id,
                qty: -mat.quantity, type: "issue", related_doc: id,
                notes: `BOM issue to WO ${id} — ${mat.materialName} × ${mat.quantity}`,
                created_at: new Date().toISOString()
              })
            }
          }

          await serviceDb.from(TABLES.WORK_ORDERS).update({ completion_percentage: 30 }).eq("id", id)
          console.log(`[DEBUG:PUT:BOM] ✅ posted material JE — total=${totalMC}`)
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
