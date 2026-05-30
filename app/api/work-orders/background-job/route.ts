import { NextRequest, NextResponse } from "next/server";
import { supabase, TABLES, getServiceClient } from "@/lib/supabase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

/**
 * Background job to ensure all work orders have automatic cost calculation
 * This can be called periodically or triggered by events
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    console.log("🔄 Background job: Ensuring all work orders have automatic costs...");

    const serviceDb = getServiceClient()

    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*");

    const workOrdersToProcess = (workOrders || []).filter((doc: any) => {
      return !doc.estimated_cost || doc.estimated_cost === 0;
    });

    console.log(`Found ${workOrdersToProcess.length} work orders without costs`);

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const workOrder of workOrdersToProcess) {
      const workOrderId = workOrder.id;
      const salesOrderId = workOrder.sales_order_id;

      results.processed++;

      console.log(`Processing work order ${workOrderId} for sales order ${salesOrderId}...`);

      try {
        const { data: orderData } = await serviceDb
          .from(TABLES.ORDERS)
          .select("*")
          .eq("id", salesOrderId)
          .single();

        if (!orderData) {
          console.warn(`Order ${salesOrderId} not found`);
          results.failed++;
          results.errors.push(`Order ${salesOrderId} not found`);
          continue;
        }

        const orderItems = orderData.items || [];

        if (orderItems.length === 0) {
          console.warn(`No items found for order ${salesOrderId}`);
          results.failed++;
          results.errors.push(`No items found for order ${salesOrderId}`);
          continue;
        }

        const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

        if (!costCalculation.success) {
          console.error(`Cost calculation failed for work order ${workOrderId}: ${costCalculation.error}`);
          results.failed++;
          results.errors.push(`Cost calculation failed for ${workOrderId}: ${costCalculation.error}`);
          continue;
        }

        const updateData = {
          estimated_cost: costCalculation.totalEstimatedCost,
          labor_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.laborCost, 0),
          overhead_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.overheadCost, 0),
          item_costs: costCalculation.itemCosts,
          notes: `Background job: Auto-calculated costs from designs (EGP ${costCalculation.totalEstimatedCost})`,
          updated_at: new Date()
        };

        await serviceDb.from(TABLES.WORK_ORDERS).update(updateData).eq("id", workOrderId);

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
    const serviceDb = getServiceClient()

    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*");

    let totalWorkOrders = 0;
    let workOrdersWithCosts = 0;
    let workOrdersWithoutCosts = 0;
    const workOrdersWithoutCostsList: any[] = [];

    if (workOrders) {
      for (const workOrder of workOrders) {
        totalWorkOrders++;

        if (workOrder.estimated_cost && workOrder.estimated_cost > 0) {
          workOrdersWithCosts++;
        } else {
          workOrdersWithoutCosts++;
          workOrdersWithoutCostsList.push({
            id: workOrder.id,
            sales_order_id: workOrder.sales_order_id,
            created_at: workOrder.created_at
          });
        }
      }
    }

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
