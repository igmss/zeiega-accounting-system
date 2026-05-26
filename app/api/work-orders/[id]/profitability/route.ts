import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order-service";
import { requireAuth } from "@/lib/auth";

// GET /api/work-orders/[id]/profitability - Get work order profitability
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    console.log(`Calculating profitability for work order ${params.id}...`);
    
    const profitability = await WorkOrderService.calculateWorkOrderProfitability(params.id);
    
    return NextResponse.json({
      success: true,
      data: profitability
    });

  } catch (error) {
    console.error("Error calculating work order profitability:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
