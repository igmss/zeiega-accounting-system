import { NextRequest, NextResponse } from "next/server";
import { supabase, TABLES, getServiceClient } from "@/lib/supabase";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { requirePermission } from "@/lib/auth";

/**
 * Simple API to fix any work orders that don't have costs
 * This can be called whenever needed to ensure all work orders have automatic costs
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    console.log("🔧 Fixing work orders without costs...");

    const serviceDb = getServiceClient()

    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*");

    const workOrdersWithoutCosts = (workOrders || []).filter((doc: any) => {
      return !doc.estimated_cost || doc.estimated_cost === 0;
    });

    console.log(`Found ${workOrdersWithoutCosts.length} work orders without costs`);

    const results = {
      fixed: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const workOrder of workOrdersWithoutCosts) {
      const workOrderId = workOrder.id;
      const salesOrderId = workOrder.sales_order_id;

      console.log(`Fixing work order ${workOrderId}...`);

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
          notes: `Fixed with automatic cost calculation (EGP ${costCalculation.totalEstimatedCost})`,
          updated_at: new Date()
        };

        await serviceDb.from(TABLES.WORK_ORDERS).update(updateData).eq("id", workOrderId);

        console.log(`✅ Fixed work order ${workOrderId} with cost EGP ${costCalculation.totalEstimatedCost}`);
        results.fixed++;

      } catch (error) {
        console.error(`Error fixing work order ${workOrderId}:`, error);
        results.failed++;
        results.errors.push(`Error fixing ${workOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`Fix completed: ${results.fixed} fixed, ${results.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.fixed} work orders with automatic cost calculation`,
      results
    });

  } catch (error) {
    console.error("Error in fix costs API:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
