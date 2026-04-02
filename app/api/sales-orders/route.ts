import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { OrderItemDesignService } from "@/lib/services/order-item-design-service"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    console.log(`Fetching unified sales orders (limit: ${limit}, cursor: ${cursor})`)

    // Use unified acc_sales_orders collection for consistent pagination
    let query = db.collection(COLLECTIONS.SALES_ORDERS)
      .orderBy("created_at", "desc")
      .limit(limit)
    
    if (cursor) {
      const lastDoc = await db.collection(COLLECTIONS.SALES_ORDERS).doc(cursor).get()
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc)
      }
    }

    const snapshot = await query.get()
    const salesOrders = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        // Ensure standard date format for UI
        created_at: (data.created_at as any)?.toDate?.() || data.created_at || new Date(),
        updated_at: (data.updated_at as any)?.toDate?.() || data.updated_at || new Date()
      }
    })

    const lastVisible = snapshot.docs[snapshot.docs.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = snapshot.docs.length === limit

    return NextResponse.json({
      data: salesOrders,
      nextCursor,
      hasMore
    })
  } catch (error) {
    console.error("Error fetching sales orders:", error)
    return NextResponse.json(
      { error: "Failed to fetch sales orders" },
      { status: 500 }
    )
  }
}

function mapOrderStatus(status: string): string {
  switch (status) {
    case "delivered":
      return "completed"
    case "shipped":
      return "shipped"
    case "processing":
      return "processing"
    case "cancelled":
      return "cancelled"
    case "refunded":
      return "refunded"
    default:
      return "pending"
  }
}

export async function POST(request: Request) {
  try {
    const orderData = await request.json()

    // Create manual order with same structure as web orders
    const now = new Date()
    const manualOrder = {
      // Basic order info
      carrier: null,
      createdAt: now,
      fragranceCodes: [],

      // Items array (same structure as web orders)
      items: orderData.items?.map((item: any) => ({
        adjustedPrice: item.total_price || item.unit_price,
        basePrice: item.unit_price,
        category: item.category || "Manual",
        color: item.color || "",
        customization: null,
        image: item.image || "",
        name: item.product_name,
        productId: item.product_id,
        quantity: item.qty || item.quantity,
        size: item.size || "",
        taleId: null,
        type: "product"
      })) || [],

      // Payment and shipping
      paymentMethod: orderData.payment_method || "manual",
      shippingAddress: {
        city: orderData.shipping_address?.city || "",
        fullName: orderData.customer_name || "Manual Customer",
        phone: orderData.shipping_address?.phone || "",
        state: orderData.shipping_address?.state || "",
        street: orderData.shipping_address?.street || "",
        zipCode: orderData.shipping_address?.zipCode || ""
      },
      shippingMethod: null,

      // Status and tracking
      status: orderData.status || "pending",
      total: orderData.total || 0,
      trackingNumber: null,
      updatedAt: now,
      userId: orderData.customer_email || "manual_user",

      // Mark as manual order
      orderSource: "manual"
    }

    // Create in manual_orders collection
    const docRef = await db.collection(COLLECTIONS.MANUAL_ORDERS).add(manualOrder)

    // Create accounting records for the manual order
    try {
      // Create sales order record in accounting system
      const salesOrderId = docRef.id
      const accountingSalesOrder = {
        id: salesOrderId,
        website_order_id: salesOrderId,
        customer_id: orderData.customer_email || "manual_user",
        customer_name: orderData.customer_name || "Manual Customer",
        items: orderData.items?.map((item: any) => ({
          sku: item.product_id,
          qty: item.qty || item.quantity,
          unit_price: item.unit_price
        })) || [],
        status: "pending",
        created_at: now,
        total_amount: orderData.total || 0,
        order_source: "manual"
      }

      // Save to accounting sales orders collection
      await db.collection(COLLECTIONS.SALES_ORDERS).doc(salesOrderId).set(accountingSalesOrder)

      console.log(`Created accounting sales order ${salesOrderId}`)
    } catch (accountingError) {
      console.error("Error creating accounting records:", accountingError)
      // Don't fail the main request if accounting fails
    }

    return NextResponse.json({ id: docRef.id, ...manualOrder })
  } catch (error) {
    console.error("Error creating manual order:", error)
    return NextResponse.json(
      { error: "Failed to create manual order" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const { orderId, status } = await request.json()

    if (!orderId || !status) {
      return NextResponse.json(
        { error: "Order ID and status are required" },
        { status: 400 }
      )
    }

    // Update manual order status in Firestore
    await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(orderId).update({
      status: status,
      updatedAt: new Date()
    })

    // If starting production, create a work order
    if (status === "producing") {
      try {
        // Get the order details - check both manual and web orders
        let orderData = null
        let orderSource = "manual"

        // First try manual orders
        const manualOrderDoc = await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(orderId).get()
        if (manualOrderDoc.exists) {
          orderData = manualOrderDoc.data()
          orderSource = "manual"
        } else {
          // Try web orders
          const webOrderDoc = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get()
          if (webOrderDoc.exists) {
            orderData = webOrderDoc.data()
            orderSource = "web"
          }
        }

        if (orderData) {
          console.log(`Creating work order for ${orderSource} order ${orderId} with automatic cost calculation...`);

          // Create work order with automatic cost calculation from designs
          const workOrderResult = await OrderItemDesignService.createWorkOrderWithAutoCosts(
            orderId,
            orderData.items || [],
            {
              customer_name: orderData.shippingAddress?.fullName || orderData.customer_name || "Unknown Customer",
              customer_email: orderData.userId || orderData.customer_email || "unknown_user",
              total_amount: orderData.total || orderData.total_amount || 0,
              order_source: orderSource
            }
          );

          if (workOrderResult.success) {
            console.log(`✅ Created work order ${workOrderResult.workOrderId} with auto-calculated cost EGP ${workOrderResult.totalEstimatedCost}`);

            // Update accounting sales order status to "producing" (only for manual orders)
            if (orderSource === "manual") {
              await db.collection(COLLECTIONS.SALES_ORDERS).doc(orderId).update({
                status: "producing",
                updated_at: new Date()
              });
            }
          } else {
            console.error(`❌ Failed to create work order: ${workOrderResult.error}`);

            // Fallback: Create basic work order without auto costs
            const basicWorkOrder = {
              sales_order_id: orderId,
              status: "pending",
              created_at: new Date(),
              updated_at: new Date(),
              completionPercentage: 0,
              notes: `Basic work order for ${orderSource} order ${orderId} (auto-cost calculation failed)`,
              items: orderData.items || [],
              customer_name: orderData.shippingAddress?.fullName || orderData.customer_name || "Unknown Customer",
              customer_email: orderData.userId || orderData.customer_email || "unknown_user",
              total_amount: orderData.total || orderData.total_amount || 0,
              order_source: orderSource,
              estimated_cost: 0,
              total_cost: 0,
              labor_cost: 0,
              overhead_cost: 0,
              materials_issued: []
            };

            const workOrderRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(basicWorkOrder);
            console.log(`Created basic work order ${workOrderRef.id} as fallback`);
          }
        }
      } catch (workOrderError) {
        console.error("Error creating work order:", workOrderError)
        // Don't fail the main request if work order creation fails
      }
    }

    return NextResponse.json({ success: true, orderId, status })
  } catch (error) {
    console.error("Error updating manual order status:", error)
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    )
  }
}

