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

    if (workOrderData.status === "in_progress") {
      try {
        const serviceDb = getServiceClient()
        const { data: wo } = await serviceDb.from(TABLES.WORK_ORDERS).select("*").eq("id", id).single()

        if (wo) {
          const alreadyIssued = Array.isArray(wo.materials_issued) && wo.materials_issued.length > 0
          if (alreadyIssued) {
            console.log(`Materials already issued for WO ${id}, skipping auto-issue`)
            return NextResponse.json({ id, status: workOrderData.status, success: true, message: "Materials already issued" })
          }

          let materialsToIssue: any[] = []

          if (wo.design_id) {
            const { data: design } = await serviceDb.from(TABLES.DESIGNS).select("*").eq("id", wo.design_id).single()
            if (design?.materials) {
              const mats = Array.isArray(design.materials) ? design.materials : []
              const orderQty = wo.items?.[0]?.quantity || wo.items?.[0]?.qty || 1
              materialsToIssue = mats.map((m: any) => ({
                materialId: m.inventoryItemId || m.id,
                quantity: (m.quantityPerUnit || 0) * orderQty,
              })).filter((m: any) => m.materialId && m.quantity > 0)
            }
          }

          if (materialsToIssue.length === 0 && wo.materials_issued) {
            const issued = Array.isArray(wo.materials_issued) ? wo.materials_issued : []
            materialsToIssue = issued.map((m: any) => ({
              materialId: m.itemId || m.materialId || m.inventoryItemId,
              quantity: m.quantity || 0,
            })).filter((m: any) => m.materialId && m.quantity > 0)
          }

          if (materialsToIssue.length > 0) {
            const accountingMaterials: any[] = []
            const inventoryRefs: Array<{ id: string; qty: number }> = []

            for (const mat of materialsToIssue) {
              const { data: invData } = await serviceDb.from(TABLES.INVENTORY_ITEMS).select("*").or(`id.eq.${mat.materialId},sku.eq.${mat.materialId}`).limit(1).single()
              if (invData) {
                const uc = invData.cost_per_unit || 0
                accountingMaterials.push({ itemId: invData.id, itemName: invData.name, quantity: mat.quantity, unitCost: uc })
                inventoryRefs.push({ id: invData.id, qty: mat.quantity })
              }
            }

            if (accountingMaterials.length > 0) {
              const accResult = await EnhancedAccountingService.recordMaterialIssue(id, accountingMaterials)
              if (accResult.success) {
                const totalMC = accountingMaterials.reduce((s: number, m: any) => s + (m.quantity * m.unitCost), 0)
                await serviceDb.from(TABLES.WORK_ORDERS).update({
                  raw_materials_used: materialsToIssue,
                  materials_issued: accountingMaterials.map((m: any) => ({ itemId: m.itemId, itemName: m.itemName, quantity: m.quantity, unitCost: m.unitCost, totalCost: m.quantity * m.unitCost })),
                  total_cost: totalMC + (wo.overhead_cost || 0),
                  updated_at: new Date().toISOString()
                }).eq("id", id)

                for (const inv of inventoryRefs) {
                  const { data: curr } = await serviceDb.from(TABLES.INVENTORY_ITEMS).select("quantity_on_hand").eq("id", inv.id).single()
                  await serviceDb.from(TABLES.INVENTORY_ITEMS).update({ quantity_on_hand: Math.max(0, (curr?.quantity_on_hand || 0) - inv.qty) }).eq("id", inv.id)
                }
              }
            }
          }
        }
      } catch (innerErr) {
        console.error("Auto-issue materials failed:", innerErr)
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
