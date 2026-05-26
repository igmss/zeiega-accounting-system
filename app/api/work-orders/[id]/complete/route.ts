import { NextRequest, NextResponse } from "next/server";
import { WorkOrderMaterialService } from "@/lib/services/work-order-material-service";
import { requirePermission } from "@/lib/auth";

// POST /api/work-orders/[id]/complete - Complete a work order
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { designId, quantity = 1 } = await request.json();

    if (!designId) {
      return NextResponse.json(
        { error: "Design ID is required" },
        { status: 400 }
      );
    }

    console.log(`Completing work order ${params.id} for design ${designId}`);

    const result = await WorkOrderMaterialService.completeWorkOrder(
      params.id,
      designId,
      quantity
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Work order ${params.id} completed successfully`,
        data: {
          journalEntryId: result.journalEntryId
        }
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Failed to complete work order" },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error("Error completing work order:", error);
    return NextResponse.json(
      { error: "Failed to complete work order" },
      { status: 500 }
    );
  }
}
