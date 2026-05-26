import { NextRequest, NextResponse } from "next/server";
import { db, COLLECTIONS } from "@/lib/firebase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

/**
 * This API ensures all work orders have automatic cost calculation
 * It can be called periodically or after work order creation
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    console.log("🔄 Ensuring all work orders have automatic cost calculation...");

    // Get all work orders that don't have estimated costs
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS).get();

    const workOrdersToUpdate = workOrdersSnapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.estimated_cost || data.estimated_cost === 0;
    });

    console.log(`Found ${workOrdersToUpdate.length} work orders without costs`);

    const results = {
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const workOrderDoc of workOrdersToUpdate) {
      const workOrder = workOrderDoc.data();
      const workOrderId = workOrderDoc.id;
      const salesOrderId = workOrder.sales_order_id;

      console.log(`Updating work order ${workOrderId} for sales order ${salesOrderId}...`);

      try {
        // Get the order data
        const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(salesOrderId).get();
        if (!orderDoc.exists) {
          console.warn(`Order ${salesOrderId} not found`);
          results.failed++;
          results.errors.push(`Order ${salesOrderId} not found`);
          continue;
        }

        const orderData = orderDoc.data();
        const orderItems = orderData?.items || [];

        if (orderItems.length === 0) {
          console.warn(`No items found for order ${salesOrderId}`);
          results.failed++;
          results.errors.push(`No items found for order ${salesOrderId}`);
          continue;
        }

        // Calculate costs from designs
        const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

        if (!costCalculation.success) {
          console.error(`Cost calculation failed for work order ${workOrderId}: ${costCalculation.error}`);
          results.failed++;
          results.errors.push(`Cost calculation failed for ${workOrderId}: ${costCalculation.error}`);
          continue;
        }

        // Update the work order with calculated costs
        const updateData = {
          estimated_cost: costCalculation.totalEstimatedCost,
          labor_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0),
          overhead_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0),
          item_costs: costCalculation.itemCosts,
          notes: `Auto-calculated costs from designs (EGP ${costCalculation.totalEstimatedCost})`,
          updated_at: new Date()
        };

        await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update(updateData);

        console.log(`✅ Updated work order ${workOrderId} with cost EGP ${costCalculation.totalEstimatedCost}`);
        results.updated++;

      } catch (error) {
        console.error(`Error updating work order ${workOrderId}:`, error);
        results.failed++;
        results.errors.push(`Error updating ${workOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`Update completed: ${results.updated} updated, ${results.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Updated ${results.updated} work orders with automatic cost calculation`,
      results
    });

  } catch (error) {
    console.error("Error in ensure costs API:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
