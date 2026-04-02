import { NextRequest, NextResponse } from "next/server";
import { db, COLLECTIONS } from "@/lib/firebase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";

/**
 * Background job to ensure all work orders have automatic cost calculation
 * This can be called periodically or triggered by events
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 Background job: Ensuring all work orders have automatic costs...");

    // Get all work orders
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS).get();

    const workOrdersToProcess = workOrdersSnapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.estimated_cost || data.estimated_cost === 0;
    });

    console.log(`Found ${workOrdersToProcess.length} work orders without costs`);

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const workOrderDoc of workOrdersToProcess) {
      const workOrder = workOrderDoc.data();
      const workOrderId = workOrderDoc.id;
      const salesOrderId = workOrder.sales_order_id;

      results.processed++;

      console.log(`Processing work order ${workOrderId} for sales order ${salesOrderId}...`);

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
          notes: `Background job: Auto-calculated costs from designs (EGP ${costCalculation.totalEstimatedCost})`,
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

    console.log(`Background job completed: ${results.processed} processed, ${results.updated} updated, ${results.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Background job completed: ${results.processed} processed, ${results.updated} updated, ${results.failed} failed`,
      results
    });

  } catch (error) {
    console.error("Error in background job:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET() {
  try {
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS).get();

    let totalWorkOrders = 0;
    let workOrdersWithCosts = 0;
    let workOrdersWithoutCosts = 0;
    const workOrdersWithoutCostsList: any[] = [];

    workOrdersSnapshot.docs.forEach(doc => {
      const workOrder = doc.data();
      totalWorkOrders++;

      if (workOrder.estimated_cost && workOrder.estimated_cost > 0) {
        workOrdersWithCosts++;
      } else {
        workOrdersWithoutCosts++;
        workOrdersWithoutCostsList.push({
          id: doc.id,
          sales_order_id: workOrder.sales_order_id,
          created_at: workOrder.created_at
        });
      }
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalWorkOrders,
        workOrdersWithCosts,
        workOrdersWithoutCosts,
        percentageWithCosts: totalWorkOrders > 0 ? Math.round((workOrdersWithCosts / totalWorkOrders) * 100) : 0,
        workOrdersWithoutCostsList
      }
    });

  } catch (error) {
    console.error("Error getting work orders status:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
