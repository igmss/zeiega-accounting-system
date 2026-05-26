import { NextRequest, NextResponse } from "next/server";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { designId, sizeQuantities } = await request.json();
    
    if (!designId) {
      return NextResponse.json(
        { success: false, error: "Design ID is required" },
        { status: 400 }
      );
    }
    
    if (!sizeQuantities || !Array.isArray(sizeQuantities)) {
      return NextResponse.json(
        { success: false, error: "Size quantities array is required" },
        { status: 400 }
      );
    }
    
    console.log(`Calculating multi-size costs for design ${designId} with ${sizeQuantities.length} size variants`);
    
    const result = await OrderItemDesignService.calculateMultiSizeDesignCosts(
      designId,
      sizeQuantities
    );
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          totalEstimatedCost: result.totalEstimatedCost,
          totalMaterialCost: result.totalMaterialCost,
          totalLaborCost: result.totalLaborCost,
          totalOverheadCost: result.totalOverheadCost,
          totalManufacturingTime: result.totalManufacturingTime,
          sizeBreakdown: result.sizeBreakdown
        }
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    
  } catch (error) {
    console.error("Error in multi-size cost calculation API:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
