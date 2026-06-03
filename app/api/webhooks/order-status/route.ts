import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { OrderItemDesignService } from "@/lib/services/order-item-design-service"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { orderStatusWebhookSchema } from "@/lib/validation/schemas"
import { getCORSHeaders, handlePreflight } from "@/lib/cors"
import { formatCurrency } from "@/lib/utils"
import { generateSalesOrderNumber } from "@/lib/utils/id-generator"

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

    const { orderId, status, webhookId, order: orderPayload } = parsed.data

    console.log(`🔄 Webhook: Processing order ${orderId} -> ${status}`, {
      hasOrderPayload: !!orderPayload,
      payloadKeys: Object.keys(parsed.data),
      orderKeys: orderPayload ? Object.keys(orderPayload) : 'none',
      itemCount: orderPayload?.items?.length,
    })

    const now = new Date().toISOString()
    const serviceDb = getServiceClient()

    let orderData = null

    const { data: existingOrder } = await serviceDb
      .from(TABLES.ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (existingOrder) {
      orderData = existingOrder
      console.log(`📋 Found existing order ${orderId} in Supabase`)
    } else if (orderPayload) {
      console.log(`📋 Order ${orderId} not in Supabase — creating from webhook payload`)
      const orderRecord = {
        id: orderId,
        user_id: orderPayload.userId || "unknown",
        status: status,
        items: orderPayload.items || [],
        shipping_address: orderPayload.shippingAddress || {},
        total: orderPayload.total || 0,
        created_at: orderPayload.createdAt || now,
        updated_at: now,
      }
      const { data: inserted } = await serviceDb
        .from(TABLES.ORDERS)
        .upsert(orderRecord, { onConflict: "id" })
        .select("*")
        .single()
      orderData = inserted
      console.log(`✅ Created order ${orderId} in Supabase`)
    }

    if (!orderData) {
      return NextResponse.json(
        { error: `Order ${orderId} not found and no payload provided to create it` },
        { status: 404, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
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

    // 4. Status Regression Protection (Idempotent FIX-007)
    if (newPriority >= currentPriority || status === "cancelled") {
      await serviceDb.from(TABLES.ORDERS).update({
        status: status,
        updated_at: now
      }).eq("id", orderId)
      console.log(`✅ Progressed status: ${currentStatus} -> ${status}`)
    } else {
      console.log(`ℹ️ Status skip: ${currentStatus} is higher priority than ${status}`)
    }

    // Create/Update sales order in accounting system
    // Lookup by website_order_id (text), not id (uuid)
    const { data: existingSalesOrder } = await serviceDb
      .from(TABLES.SALES_ORDERS)
      .select("*")
      .eq("website_order_id", orderId)
      .single();

    if (existingSalesOrder) {
      await serviceDb.from(TABLES.SALES_ORDERS).update({
        status: mapOrderStatus(status),
        updated_at: now
      }).eq("website_order_id", orderId);
      console.log(`✅ Updated existing sales order status for ${orderId}`);
    } else {
      const salesOrder = {
        order_number: generateSalesOrderNumber(),
        website_order_id: orderId,
        customer_name: orderData.shipping_address?.fullName || "Unknown Customer",
        items: orderItems.map((item: any) => ({
          sku: item.productId,
          name: item.name || item.sku || item.productId,
          qty: item.quantity,
          unit_price: item.basePrice || item.adjustedPrice
        })),
        status: mapOrderStatus(status),
        created_at: orderData.created_at || now,
        total_amount: Number(orderData.total) || 0,
        order_source: orderPayload?.source || (orderData.source || "web"),
        updated_at: now
      };
      await serviceDb.from(TABLES.SALES_ORDERS).insert(salesOrder);
      console.log(`✅ Created new sales order for ${orderId}`);
    }

    // If status is "processing", create work order immediately
    if (status === "processing") {
      try {
        const { data: existingWorkOrders } = await serviceDb
          .from(TABLES.WORK_ORDERS)
          .select("*")
          .eq("sales_order_id", orderId)

        if (!existingWorkOrders || existingWorkOrders.length === 0) {
          console.log(`🔄 Creating work order for web order ${orderId} using shared auto-costs engine...`);

          const result = await OrderItemDesignService.createWorkOrderWithAutoCosts(
            orderId,
            orderItems,
            { order_source: "web" }
          );

          if (result.success && result.workOrderId) {
            console.log(`✅ Created work order ${result.workOrderId}`);

            const { data: wo } = await serviceDb.from(TABLES.WORK_ORDERS)
              .select("id,material_cost,labor_cost,overhead_cost")
              .eq("id", result.workOrderId).single();

            if (wo) {
              const matCost = Number(wo.material_cost) || 0;
              const labCost = Number(wo.labor_cost) || 0;
              const ohCost = Number(wo.overhead_cost) || 0;

              if (matCost > 0) {
                await EnhancedAccountingService.recordMaterialIssue(
                  result.workOrderId,
                  [{ itemId: "BOM-MAT", itemName: "BOM Materials", quantity: 1, unitCost: matCost }]
                );
              }
              if (labCost > 0) {
                await EnhancedAccountingService.recordLaborApplied(
                  result.workOrderId, Math.max(1, labCost / 50), 50
                );
              }
              if (ohCost > 0) {
                await EnhancedAccountingService.recordOverheadApplied(result.workOrderId, ohCost);
              }
              console.log(`✅ Posted JEs — mat:${matCost} lab:${labCost} oh:${ohCost}`);
            }
          } else {
            console.error(`❌ Cost calculation failed: ${result.error}`);
            const fallbackWo = {
              wo_number: `WO-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              sales_order_id: orderId,
              status: "pending",
              completion_percentage: 0,
              raw_materials_used: [],
              materials_issued: [],
              overhead_cost: 0,
              labor_cost: 0,
              material_cost: 0,
              total_cost: 0,
              estimated_cost: 0,
              created_at: now,
              updated_at: now,
              notes: `Basic work order (cost calc failed: ${result.error})`,
              items: orderItems,
              order_source: "web"
            };
            await serviceDb.from(TABLES.WORK_ORDERS).insert(fallbackWo);
            console.log(`⚠️ Created basic work order without costs`);
          }
        } else {
          console.log(`ℹ️ Work order already exists for order ${orderId}`)
        }
      } catch (innerError) {
        console.error("❌ Critical failure in work order creation:", innerError);
        await serviceDb.from(TABLES.WORK_ORDERS).insert({
          wo_number: `WO-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          sales_order_id: orderId,
          status: "pending",
          completion_percentage: 0,
          raw_materials_used: [],
          materials_issued: [],
          overhead_cost: 0,
          labor_cost: 0,
          material_cost: 0,
          total_cost: 0,
          estimated_cost: 0,
          created_at: now,
          updated_at: now,
          notes: `Fallback work order (critical error: ${innerError})`,
          items: orderItems,
          order_source: "web"
        });
        console.log(`✅ Created emergency fallback work order`);
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
