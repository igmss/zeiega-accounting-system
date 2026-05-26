import { NextRequest, NextResponse } from "next/server";
import { WorkOrderMaterialService } from "@/lib/services/work-order-material-service";
import { requirePermission } from "@/lib/auth";

// POST /api/work-orders/[id]/issue-materials - Issue materials for a work order
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

    console.log(`Issuing materials for work order ${params.id}, design ${designId}, quantity ${quantity}`);

    const result = await WorkOrderMaterialService.issueMaterialsForWorkOrder(
      params.id,
      designId,
      quantity
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Materials issued successfully for work order ${params.id}`,
        data: {
          issuedMaterials: result.issuedMaterials,
          totalCost: result.totalCost,
          journalEntryId: result.journalEntryId
        }
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Failed to issue materials" },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error("Error issuing materials for work order:", error);
    return NextResponse.json(
      { error: "Failed to issue materials" },
      { status: 500 }
    );
  }
}
