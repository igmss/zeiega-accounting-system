import { NextRequest, NextResponse } from "next/server";
import { supabase, TABLES, getServiceClient } from "@/lib/supabase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    console.log("🔄 Starting automatic update of all work orders with zero costs...");

    const serviceDb = getServiceClient()

    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*");

    const results = {
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const workOrder of (workOrders || [])) {
      const workOrderId = workOrder.id;
      const salesOrderId = workOrder.sales_order_id;

      if (workOrder.estimated_cost && workOrder.estimated_cost > 0) {
        results.skipped++;
        continue;
      }

      console.log(`Processing work order ${workOrderId} for sales order ${salesOrderId}...`);

      try {
        const { data: orderData } = await serviceDb
          .from(TABLES.ORDERS)
          .select("*")
          .eq("id", salesOrderId)
          .single();

        if (!orderData) {
          console.warn(`Order ${salesOrderId} not found for work order ${workOrderId}`);
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
          console.error(`Failed to calculate costs for work order ${workOrderId}: ${costCalculation.error}`);
          results.failed++;
          results.errors.push(`Cost calculation failed for ${workOrderId}: ${costCalculation.error}`);
          continue;
        }

        const updateData = {
          estimated_cost: costCalculation.totalEstimatedCost,
          labor_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.laborCost, 0),
          overhead_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + item.overheadCost, 0),
          item_costs: costCalculation.itemCosts,
          notes: `Auto-updated with cost calculation from designs (EGP ${costCalculation.totalEstimatedCost})`,
          updated_at: new Date().toISOString()
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

    console.log(`Automatic update completed: ${results.updated} updated, ${results.failed} failed, ${results.skipped} skipped`);

    return NextResponse.json({
      success: true,
      message: `Automatic update completed: ${results.updated} work orders updated, ${results.failed} failed, ${results.skipped} skipped`,
      results
    });

  } catch (error) {
    console.error("Error in automatic update:", error);
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

    if (workOrders) {
      for (const workOrder of workOrders) {
        totalWorkOrders++;

        if (workOrder.estimated_cost && workOrder.estimated_cost > 0) {
          workOrdersWithCosts++;
        } else {
          workOrdersWithoutCosts++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalWorkOrders,
        workOrdersWithCosts,
        workOrdersWithoutCosts,
        percentageWithCosts: totalWorkOrders > 0 ? Math.round((workOrdersWithCosts / totalWorkOrders) * 100) : 0
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
