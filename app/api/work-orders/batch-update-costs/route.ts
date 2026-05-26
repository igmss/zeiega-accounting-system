import { NextRequest, NextResponse } from "next/server";
import { db, COLLECTIONS } from "@/lib/firebase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    console.log("🔄 Starting batch update of work orders with zero costs...");

    // Get all work orders (we'll filter for missing or zero estimated costs)
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS).get();

    console.log(`Found ${workOrdersSnapshot.docs.length} total work orders`);

    const results = {
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const workOrderDoc of workOrdersSnapshot.docs) {
      const workOrder = workOrderDoc.data();
      const workOrderId = workOrderDoc.id;
      const salesOrderId = workOrder.sales_order_id;

      // Skip work orders that already have estimated costs
      if (workOrder.estimated_cost && workOrder.estimated_cost > 0) {
        console.log(`Skipping work order ${workOrderId} - already has estimated cost EGP ${workOrder.estimated_cost}`);
        results.skipped++;
        continue;
      }

      console.log(`Processing work order ${workOrderId} for sales order ${salesOrderId}...`);

      try {
        // Get the order data
        const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(salesOrderId).get();
        if (!orderDoc.exists) {
          console.warn(`Order ${salesOrderId} not found for work order ${workOrderId}`);
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
          console.error(`Failed to calculate costs for work order ${workOrderId}: ${costCalculation.error}`);
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
          notes: `Auto-updated with cost calculation from designs (EGP ${costCalculation.totalEstimatedCost})`,
          updated_at: new Date()
        };

        await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update(updateData);

        console.log(`✅ Updated work order ${workOrderId} with cost EGP ${costCalculation.totalEstimatedCost}`);
        results.updated++;

      } catch (error) {
        console.error(`Error processing work order ${workOrderId}:`, error);
        results.failed++;
        results.errors.push(`Error processing ${workOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`Batch update completed: ${results.updated} updated, ${results.failed} failed, ${results.skipped} skipped`);

    return NextResponse.json({
      success: true,
      message: `Batch update completed: ${results.updated} work orders updated, ${results.failed} failed, ${results.skipped} skipped`,
      results
    });

  } catch (error) {
    console.error("Error in batch update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
