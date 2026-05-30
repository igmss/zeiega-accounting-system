import { NextRequest, NextResponse } from "next/server";
import { supabase, TABLES, getServiceClient } from "@/lib/supabase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { workOrderId, orderId } = await request.json();

    if (!workOrderId || !orderId) {
      return NextResponse.json({ error: 'Work Order ID and Order ID are required' }, { status: 400 });
    }

    console.log(`🔄 Updating work order ${workOrderId} with automatic costs...`);

    const serviceDb = getServiceClient()

    const { data: orderData } = await serviceDb
      .from(TABLES.ORDERS)
      .select("*")
      .eq("id", orderId)
      .single();

    if (!orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderItems = orderData.items || [];

    const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

    if (!costCalculation.success) {
      return NextResponse.json({
        error: 'Failed to calculate costs',
        details: costCalculation.error
      }, { status: 500 });
    }

    const { data: workOrderDoc } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("id", workOrderId)
      .single();

    if (!workOrderDoc) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    const updateData = {
      estimated_cost: costCalculation.totalEstimatedCost,
      labor_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.laborCost, 0),
      overhead_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.overheadCost, 0),
      item_costs: costCalculation.itemCosts,
      notes: `Updated with automatic cost calculation from designs (EGP ${costCalculation.totalEstimatedCost})`,
      updated_at: new Date()
    };

    await serviceDb.from(TABLES.WORK_ORDERS).update(updateData).eq("id", workOrderId);

    console.log(`✅ Updated work order ${workOrderId} with costs: EGP ${costCalculation.totalEstimatedCost}`);

    return NextResponse.json({
      success: true,
      workOrderId,
      totalEstimatedCost: costCalculation.totalEstimatedCost,
      itemCosts: costCalculation.itemCosts,
      message: `Work order updated with automatic cost calculation`
    });

  } catch (error) {
    console.error("Error updating work order costs:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
