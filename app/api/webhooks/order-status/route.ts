import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { OrderItemDesignService } from "@/lib/services/order-item-design-service"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { orderStatusWebhookSchema } from "@/lib/validation/schemas"

// Get allowed origins from environment variable
function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || ""
  const list = origins.split(",").map((o) => o.trim()).filter(Boolean)
  
  // Always include Cloud Functions domain for webhooks (FIX-005)
  // Note: Firestore triggers/functions don't always send an 'origin' header, 
  // but for those that do, we should permit this pattern.
  // The actual verification is handled by the webhookSecret.
  
  // In development, allow localhost
  if (process.env.NODE_ENV === "development") {
    list.push("http://localhost:3000", "http://localhost:3001")
  }
  return list
}

// Apply CORS headers safely
function getCORSHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || ""
  const allowedOrigins = getAllowedOrigins()

  // Only allow specific origins
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret",
    }
  }

  // Default: no CORS headers (browser will block)
  return {}
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const corsHeaders = getCORSHeaders(request)

  if (Object.keys(corsHeaders).length === 0) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
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
    if (!secret || secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCORSHeaders(request) }
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
        { status: 400, headers: getCORSHeaders(request) }
      )
    }

    const { orderId, status } = parsed.data

    console.log(`🔄 Webhook: Processing order ${orderId} -> ${status}`)

    // Get the order from the main website orders collection
    const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get()

    if (!orderDoc.exists) {
      return NextResponse.json(
        { error: `Order ${orderId} not found` },
        { status: 404 }
      )
    }

    const orderData = orderDoc.data()
    const currentStatus = orderData?.status || "pending"

    if (!orderData) {
      return NextResponse.json(
        { error: `Order ${orderId} data not found` },
        { status: 404 }
      )
    }

    const STATUS_PRIORITY: Record<string, number> = { 
      pending: 0, 
      processing: 1, 
      shipped: 2, 
      delivered: 3, 
      cancelled: -1 
    }

    const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0
    const newPriority = STATUS_PRIORITY[status] ?? 0

    const now = new Date()

    // 4. Status Regression Protection (Idempotent FIX-007)
    // Only update the Firestore order status if the new status represents a forward progression
    if (newPriority >= currentPriority || status === "cancelled") {
      // Update the order status in the main orders collection
      await orderDoc.ref.update({
        status: status,
        updatedAt: now
      })
      console.log(`✅ Progressed status: ${currentStatus} -> ${status}`)
    } else {
      console.log(`ℹ️ Status skip: ${currentStatus} is higher priority than ${status}`)
    }

    // Create/Update sales order in accounting system (Idempotent FIX-006)
    const salesOrderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc(orderId);
    const existingSalesOrder = await salesOrderRef.get();

    if (existingSalesOrder.exists) {
      await salesOrderRef.update({
        status: mapOrderStatus(status),
        updated_at: now
      });
      console.log(`✅ Updated existing sales order status for ${orderId}`);
    } else {
      const salesOrder = {
        id: orderId,
        website_order_id: orderId,
        customer_id: orderData.userId || "unknown",
        customer_name: orderData.shippingAddress?.fullName || "Unknown Customer",
        items: orderData.items?.map((item: any) => ({
          sku: item.productId,
          name: item.name || item.sku || item.productId, // (Bug 2 Fix: Display name)
          qty: item.quantity,
          unit_price: item.basePrice || item.adjustedPrice
        })) || [],
        status: mapOrderStatus(status),
        created_at: orderData.createdAt?.toDate?.() || now,
        total_amount: Number(orderData.total) || Number(orderData.subtotal) || 0, // (Bug 1 Fix: No EGPNaN)
        order_source: "web",
        updated_at: now
      };
      await salesOrderRef.set(salesOrder);
      console.log(`✅ Created new sales order for ${orderId}`);
    }

    // If status is "processing", create work order immediately
    if (status === "processing") {
      // (Bug 3 Fix: Inner try/catch to protect against cost calculation crashes)
      try {
        // Check if work order already exists
        const existingWorkOrderSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
          .where("sales_order_id", "==", orderId)
          .get()

        if (existingWorkOrderSnapshot.empty) {
          console.log(`Creating work order for web order ${orderId} with automatic cost calculation...`);

          // Get order items for cost calculation
          const orderDocForWO = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
          const orderItems = orderDocForWO.exists ? (orderDocForWO.data()?.items || []) : [];

          // Calculate costs from designs FIRST
          console.log(`🔄 Calculating costs for ${orderItems.length} order items...`);
          const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(orderItems);

          if (costCalculation.success) {
            console.log(`✅ Cost calculation successful: EGP ${costCalculation.totalEstimatedCost}`);
            
            // Enrich order items with design images from cost calculation
            const enrichedItems = orderItems.map((item: any) => {
              const match = costCalculation.itemCosts.find(
                (ic: any) => ic.designId && (ic.item?.productId === item.productId || ic.item?.name === item.name)
              );
              return match?.image ? { ...item, image: match.image } : item;
            });

            if (costCalculation.warnings && costCalculation.warnings.length > 0) {
              console.warn(`⚠️ Cost calculation warnings for order ${orderId}:`, costCalculation.warnings);
            }

            // Construct notes including warnings if any
            let notes = `Work order created with automatic cost calculation (EGP ${costCalculation.totalEstimatedCost})`;
            if (costCalculation.warnings && costCalculation.warnings.length > 0) {
              notes += `\n⚠️ Unmatched items: ${costCalculation.warnings.map(w => w.split(': ')[1] || w).join(', ')}`;
            }

            // Create work order with calculated costs
            const workOrder = {
              sales_order_id: orderId,
              status: "pending",
              completionPercentage: 0,
              raw_materials_used: [],
              materials_issued: [],
              overhead_cost: costCalculation.itemCosts.reduce((sum, item) => sum + (item.overheadCost || 0), 0),
              labor_cost: costCalculation.itemCosts.reduce((sum, item) => sum + (item.laborCost || 0), 0),
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

            const workOrderRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(workOrder);
            console.log(`✅ Created work order ${workOrderRef.id} with cost EGP ${costCalculation.totalEstimatedCost}`);

            // Post WIP journal entry (DR WIP / CR Accrued Liabilities)
            // Use estimated cost for opening (can be overridden manually later)
            if (costCalculation.totalEstimatedCost > 0) {
              const wipResult = await EnhancedAccountingService.recordWIPOpening(
                workOrderRef.id,
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

            // Fallback: Create basic work order with warning
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

            const workOrderRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(basicWorkOrder);
            console.log(`⚠️ Created basic work order ${workOrderRef.id} without costs - manual update required`);
          }
        } else {
          console.log(`ℹ️ Work order already exists for order ${orderId}`)
        }
      } catch (innerError) {
        console.error("❌ Critical failure in work order creation block:", innerError);
        // Create basic fallback work order so the order is not lost (Bug 3 Fix)
        // Note: orderItems was defined within the try block, let's ensure it's accessible or re-fetch
        try {
          const orderDocForFallback = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
          const itemsForFallback = orderDocForFallback.exists ? (orderDocForFallback.data()?.items || []) : [];
          
          await db.collection(COLLECTIONS.WORK_ORDERS).add({
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
            items: itemsForFallback,
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
      timestamp: now.toISOString()
    }, {
      headers: getCORSHeaders(request)
    })

  } catch (error: any) {
    console.error("Error processing order status webhook:", error)
    // CHANGED: Do not leak internal error details to external callers.
    // Full error is logged server-side; return a generic message to the client.
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
