import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { workOrderId } = await request.json()
    
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work order ID is required" },
        { status: 400 }
      )
    }
    
    const serviceDb = getServiceClient()

    const { data: workOrder } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("id", workOrderId)
      .single()
    
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      )
    }
    
    const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")

    const result = await WorkOrderMaterialService.completeWorkOrder(
      workOrderId,
      workOrder.design_id || ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (workOrder.sales_order_id) {
      const soId = workOrder.sales_order_id

      const { data: soDoc } = await serviceDb
        .from(TABLES.SALES_ORDERS)
        .select("*")
        .eq("id", soId)
        .single()

      const { data: manualDoc } = await serviceDb
        .from(TABLES.MANUAL_ORDERS)
        .select("*")
        .eq("id", soId)
        .single()

      if (soDoc) {
        await serviceDb.from(TABLES.SALES_ORDERS).update({
          status: "completed",
          updated_at: new Date().toISOString()
        }).eq("id", soId)
      }
      if (manualDoc) {
        await serviceDb.from(TABLES.MANUAL_ORDERS).update({
          status: "completed",
          updatedAt: new Date().toISOString()
        }).eq("id", soId)
      }
    }
    
    return NextResponse.json({
      success: true,
      message: "Work order completed successfully",
      workOrderId,
      journalEntryId: result.journalEntryId,
      totalValue: workOrder.total_amount || 0
    })
    
  } catch (error) {
    console.error("Error completing work order:", error)
    return NextResponse.json(
      { error: "Failed to complete work order" },
      { status: 500 }
    )
  }
}
