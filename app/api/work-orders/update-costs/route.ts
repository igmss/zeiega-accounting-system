import { NextRequest, NextResponse } from "next/server";
import { db, COLLECTIONS } from "@/lib/firebase";
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

    // 1. Get the order data
    const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data();
    const orderItems = orderData?.items || [];

    // 2. Calculate costs from designs
    const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

    if (!costCalculation.success) {
      return NextResponse.json({
        error: 'Failed to calculate costs',
        details: costCalculation.error
      }, { status: 500 });
    }

    // 3. Update the work order with calculated costs
    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId);
    const workOrderDoc = await workOrderRef.get();

    if (!workOrderDoc.exists) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    const updateData = {
      estimated_cost: costCalculation.totalEstimatedCost,
      labor_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0),
      overhead_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0),
      item_costs: costCalculation.itemCosts,
      notes: `Updated with automatic cost calculation from designs (EGP ${costCalculation.totalEstimatedCost})`,
      updated_at: new Date()
    };

    await workOrderRef.update(updateData);

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
