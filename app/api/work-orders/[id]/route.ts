import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order-service";
import { requirePermission, requireAuth } from "@/lib/auth";

// GET /api/work-orders/[id] - Get work order with design information
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    console.log(`Getting work order ${params.id} with design information...`);
    
    const result = await WorkOrderService.getWorkOrderWithDesign(params.id);
    
    if (!result.workOrder) {
      return NextResponse.json(
        { success: false, error: "Work order not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        workOrder: result.workOrder,
        design: result.design,
        materialRequirements: result.materialRequirements
      }
    });

  } catch (error) {
    console.error("Error getting work order with design:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PUT /api/work-orders/[id] - Update work order
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const updates = await request.json();
    
    console.log(`Updating work order ${params.id} with:`, updates);
    
    // Whitelist only specific safe modifiable fields to prevent Mass Assignment / cost tampering
    const whitelistedUpdates: Record<string, any> = {};
    if (updates.status !== undefined) whitelistedUpdates.status = updates.status;
    if (updates.completionPercentage !== undefined) whitelistedUpdates.completionPercentage = updates.completionPercentage;
    if (updates.notes !== undefined) whitelistedUpdates.notes = updates.notes;
    if (updates.estimated_completion !== undefined) {
      whitelistedUpdates.estimated_completion = updates.estimated_completion ? new Date(updates.estimated_completion) : null;
    }
    
    // Update work order
    const { db, COLLECTIONS } = await import("@/lib/firebase");
    await db.collection(COLLECTIONS.WORK_ORDERS).doc(params.id).update({
      ...whitelistedUpdates,
      updated_at: new Date()
    });
    
    return NextResponse.json({
      success: true,
      message: "Work order updated successfully"
    });

  } catch (error) {
    console.error("Error updating work order:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
