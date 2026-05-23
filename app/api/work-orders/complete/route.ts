import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function POST(request: Request) {
  try {
    const { workOrderId } = await request.json()
    
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work order ID is required" },
        { status: 400 }
      )
    }
    
    // Get work order
    const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get()
    if (!workOrderDoc.exists) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      )
    }
    
    const workOrder = workOrderDoc.data() as any
    
    // Call service first – it handles status update + accounting entries atomically.
    // Do NOT update status before the service call; if accounting fails the WO stays as-is.
    const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")

    const result = await WorkOrderMaterialService.completeWorkOrder(
      workOrderId,
      workOrder.design_id || ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
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

