import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { OrderItemDesignService } from "@/lib/services/order-item-design-service"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { orderStatusWebhookSchema } from "@/lib/validation/schemas"
import { getCORSHeaders, handlePreflight } from "@/lib/cors"
import { formatCurrency } from "@/lib/utils"

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request, ["x-webhook-secret"]) ?? new NextResponse(null, { status: 204 })
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Accept webhook secret from header (x-webhook-secret) or body (webhookSecret)
    const headerSecret = request.headers.get("x-webhook-secret")
    const bodySecret = body.webhookSecret
    const secret = (headerSecret || bodySecret || '').trim()

    // Verify webhook secret for security (must happen before processing).
    const expectedSecret = (process.env.WEBHOOK_SECRET || '').trim()
    const providedBuffer = Buffer.from(secret)
    const expectedBuffer = Buffer.from(expectedSecret)

    const isAuthorized = secret && 
      providedBuffer.length === expectedBuffer.length && 
      timingSafeEqual(providedBuffer, expectedBuffer)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
      )
    }
    const parsed = orderStatusWebhookSchema.safeParse(body)

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ")
      return NextResponse.json(
        {
          error: "Invalid webhook payload",
          message,
          issues: parsed.error.issues,
        },
        { status: 400, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
      )
    }

    const { orderId, status } = parsed.data

    console.log(`🔄 Webhook: Processing order ${orderId} -> ${status}`)

    const serviceDb = getServiceClient()

    const { data: orderData } = await serviceDb
      .from(TABLES.ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (!orderData) {
      return NextResponse.json(
        { error: `Order ${orderId} not found` },
        { status: 404 }
      )
    }

    const orderItems: Array<Record<string, unknown>> = orderData.items || []
    const currentStatus = orderData.status || "pending"

    const STATUS_PRIORITY: Record<string, number> = { 
      pending: 0, 
      processing: 1, 
      shipped: 2, 
      delivered: 3, 
      cancelled: -1 
    }

    const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0
    const newPriority = STATUS_PRIORITY[status] ?? 0

    const now = new Date().toISOString()

    // 4. Status Regression Protection (Idempotent FIX-007)
    if (newPriority >= currentPriority || status === "cancelled") {
      await serviceDb.from(TABLES.ORDERS).update({
        status: status,
        updatedAt: now
      }).eq("id", orderId)
      console.log(`✅ Progressed status: ${currentStatus} -> ${status}`)
    } else {
      console.log(`ℹ️ Status skip: ${currentStatus} is higher priority than ${status}`)
    }

    // Create/Update sales order in accounting system (Idempotent FIX-006)
    const { data: existingSalesOrder } = await serviceDb
      .from(TABLES.SALES_ORDERS)
      .select("*")
      .eq("id", orderId)
      .single();

    if (existingSalesOrder) {
      await serviceDb.from(TABLES.SALES_ORDERS).update({
        status: mapOrderStatus(status),
        updated_at: now
      }).eq("id", orderId);
      console.log(`✅ Updated existing sales order status for ${orderId}`);
    } else {
      const salesOrder = {
        id: orderId,
        website_order_id: orderId,
        customer_id: orderData.userId || "unknown",
        customer_name: orderData.shippingAddress?.fullName || "Unknown Customer",
        items: orderData.items?.map((item: any) => ({
          sku: item.productId,
          name: item.name || item.sku || item.productId,
          qty: item.quantity,
          unit_price: item.basePrice || item.adjustedPrice
        })) || [],
        status: mapOrderStatus(status),
        created_at: orderData.createdAt ? new Date(orderData.createdAt).toISOString() : now,
        total_amount: Number(orderData.total) || Number(orderData.subtotal) || 0,
        order_source: "web",
        updated_at: now
      };
      await serviceDb.from(TABLES.SALES_ORDERS).upsert(salesOrder, { onConflict: "id" });
      console.log(`✅ Created new sales order for ${orderId}`);
    }

    // If status is "processing", create work order immediately
    if (status === "processing") {
      try {
        // Check if work order already exists
        const { data: existingWorkOrders } = await serviceDb
          .from(TABLES.WORK_ORDERS)
          .select("*")
          .eq("sales_order_id", orderId)

        if (!existingWorkOrders || existingWorkOrders.length === 0) {
          console.log(`Creating work order for web order ${orderId} with automatic cost calculation...`);

          console.log(`🔄 Calculating costs for ${orderItems.length} order items...`);
          const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

          if (costCalculation.success) {
            console.log(`✅ Cost calculation successful: ${formatCurrency(costCalculation.totalEstimatedCost)}`);
            
            const enrichedItems = orderItems.map((item: any) => {
              const match = costCalculation.itemCosts.find(
                (ic: any) => ic.designId && (ic.item?.productId === item.productId || ic.item?.name === item.name)
              );
              return match?.image ? { ...item, image: match.image } : item;
            });

            if (costCalculation.warnings && costCalculation.warnings.length > 0) {
              console.warn(`⚠️ Cost calculation warnings for order ${orderId}:`, costCalculation.warnings);
            }

            let notes = `Work order created with automatic cost calculation (${formatCurrency(costCalculation.totalEstimatedCost)})`;
            if (costCalculation.warnings && costCalculation.warnings.length > 0) {
              notes += `\n⚠️ Unmatched items: ${costCalculation.warnings.map((w: string) => w.split(': ')[1] || w).join(', ')}`;
            }

            const workOrder = {
              sales_order_id: orderId,
              status: "pending",
              completionPercentage: 0,
              raw_materials_used: [],
              materials_issued: [],
              overhead_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + (item.overheadCost || 0), 0),
              labor_cost: costCalculation.itemCosts.reduce((sum: number, item: any) => sum + (item.laborCost || 0), 0),
              total_cost: 0,
              estimated_cost: costCalculation.totalEstimatedCost,
              created_at: now,
              updated_at: now,
              estimated_completion: null,
              completed_at: null,
              notes: notes,
              items: enrichedItems,
              item_costs: costCalculation.itemCosts,
              order_source: "web"
            };

            const { data: insertedWorkOrder } = await serviceDb
              .from(TABLES.WORK_ORDERS)
              .insert(workOrder)
              .select("id")
              .single();

            const workOrderId = insertedWorkOrder?.id;
            console.log(`✅ Created work order ${workOrderId} with cost ${formatCurrency(costCalculation.totalEstimatedCost)}`);

            if (costCalculation.totalEstimatedCost > 0 && workOrderId) {
              const wipResult = await EnhancedAccountingService.recordWIPOpening(
                workOrderId,
                costCalculation.totalEstimatedCost
              );
              if (wipResult.success) {
                console.log(`✅ Posted WIP opening journal entry ${wipResult.entryId}`);
              } else {
                console.error(`❌ Failed to post WIP journal: ${wipResult.error}`);
              }
            } else {
              const warningMsg = costCalculation.warnings ? "Unmatched designs" : "Zero estimated cost";
              console.warn(`⚠️ Skipping WIP journal entry for ${orderId}: ${warningMsg}`);
            }
          } else {
            console.error(`❌ Cost calculation failed: ${costCalculation.error}`);

            const basicWorkOrder = {
              sales_order_id: orderId,
              status: "pending",
              completionPercentage: 0,
              raw_materials_used: [],
              materials_issued: [],
              overhead_cost: 0,
              labor_cost: 0,
              total_cost: 0,
              estimated_cost: 0,
              created_at: now,
              updated_at: now,
              estimated_completion: null,
              completed_at: null,
              notes: `Basic work order for web order ${orderId} (cost calculation failed: ${costCalculation.error})`,
              items: orderItems,
              order_source: "web"
            };

            const { data: basicWorkOrderResult } = await serviceDb
              .from(TABLES.WORK_ORDERS)
              .insert(basicWorkOrder)
              .select("id")
              .single();
            console.log(`⚠️ Created basic work order ${basicWorkOrderResult?.id} without costs - manual update required`);
          }
        } else {
          console.log(`ℹ️ Work order already exists for order ${orderId}`)
        }
      } catch (innerError) {
        console.error("❌ Critical failure in work order creation block:", innerError);
        try {
          await serviceDb.from(TABLES.WORK_ORDERS).insert({
            sales_order_id: orderId,
            status: "pending",
            completionPercentage: 0,
            raw_materials_used: [],
            materials_issued: [],
            overhead_cost: 0,
            labor_cost: 0,
            total_cost: 0,
            estimated_cost: 0,
            created_at: now,
            updated_at: now,
            estimated_completion: null,
            completed_at: null,
            notes: `Fallback work order (critical error: ${innerError})`,
            items: orderItems,
            order_source: "web"
          });
          console.log(`✅ Created fallback work order for ${orderId} after critical failure`);
        } catch (fallbackError) {
          console.error("❌ Failed to even create fallback work order:", fallbackError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Order ${orderId} status updated to ${status}`,
      orderId,
      status,
      timestamp: now
    }, {
      headers: getCORSHeaders(request, ["x-webhook-secret"])
    })

  } catch (error: any) {
    console.error("Error processing order status webhook:", error)
    return NextResponse.json(
      { error: "Failed to process order status update" },
      { status: 500 }
    )
  }
}

// Helper function to map website order status to accounting status
function mapOrderStatus(websiteStatus: string): string {
  const statusMap: { [key: string]: string } = {
    "pending": "pending",
    "processing": "producing",
    "shipped": "completed",
    "delivered": "completed",
    "cancelled": "cancelled"
  }

  return statusMap[websiteStatus.toLowerCase()] || "pending"
}
