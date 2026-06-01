import { NextResponse } from "next/server"
import { getServiceClient, TABLES } from "@/lib/supabase"
import { OrderItemDesignService } from "@/lib/services/order-item-design-service"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    console.log(`Fetching unified sales orders (limit: ${limit}, cursor: ${cursor})`)

    let query = getServiceClient()
      .from(TABLES.SALES_ORDERS)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit + 1)
    
    if (cursor) {
      const { data: cursorDoc } = await getServiceClient()
        .from(TABLES.SALES_ORDERS)
        .select("created_at")
        .eq("id", cursor)
        .maybeSingle()
      
      if (cursorDoc) {
        query = query.lt("created_at", cursorDoc.created_at)
      }
    }

    const { data, error } = await query

    if (error) throw error

    const hasMore = (data || []).length > limit
    if (hasMore) {
      data!.pop()
    }

    const salesOrders = (data || []).map((item: any) => ({
      ...item,
      created_at: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
      updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString()
    }))

    const lastVisible = (data || []).length > 0 ? data![data!.length - 1] : null
    const nextCursor = lastVisible ? lastVisible.id : null

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
  const auth = await requirePermission("sales-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const orderData = await request.json()

    const now = new Date().toISOString()
    const manualOrder = {
      carrier: null,
      created_at: now,
      fragrance_codes: [],

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

      payment_method: orderData.payment_method || "manual",
      shipping_address: {
        city: orderData.shipping_address?.city || "",
        fullName: orderData.customer_name || "Manual Customer",
        phone: orderData.shipping_address?.phone || "",
        state: orderData.shipping_address?.state || "",
        street: orderData.shipping_address?.street || "",
        zipCode: orderData.shipping_address?.zipCode || ""
      },
      shipping_method: null,

      status: orderData.status || "pending",
      total: orderData.total || 0,
      tracking_number: null,
      updated_at: now,
      user_id: orderData.customer_email || "manual_user",

      order_source: "manual"
    }

    const { data: insertedOrders, error: insertError } = await getServiceClient()
      .from(TABLES.MANUAL_ORDERS)
      .insert(manualOrder)
      .select()

    if (insertError) throw insertError

    const docRef = insertedOrders[0]

    try {
      const salesOrderId = docRef.id
      const accountingSalesOrder = {
        id: salesOrderId,
        website_order_id: salesOrderId,
        customer_id: orderData.customer_email || "manual_user",
        customer_name: orderData.customer_name || "Manual Customer",
        items: orderData.items?.map((item: any) => ({
          sku: item.product_id,
          name: item.product_name || item.product_id,
          qty: item.qty || item.quantity,
          unit_price: item.unit_price
        })) || [],
        status: "pending",
        created_at: now,
        total_amount: orderData.total || 0,
        order_source: "manual"
      }

      await getServiceClient()
        .from(TABLES.SALES_ORDERS)
        .upsert(accountingSalesOrder, { onConflict: "id" })

      console.log(`Created accounting sales order ${salesOrderId}`)
    } catch (accountingError) {
      console.error("Error creating accounting records:", accountingError)
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
  const auth = await requirePermission("sales-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { orderId, status } = await request.json()

    if (!orderId || !status) {
      return NextResponse.json(
        { error: "Order ID and status are required" },
        { status: 400 }
      )
    }

    await getServiceClient()
      .from(TABLES.MANUAL_ORDERS)
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId)

    if (status === "producing") {
      try {
        let orderData = null
        let orderSource = "manual"

        const { data: manualOrderDoc } = await getServiceClient()
          .from(TABLES.MANUAL_ORDERS)
          .select("*")
          .eq("id", orderId)
          .single()

        if (manualOrderDoc) {
          orderData = manualOrderDoc
          orderSource = "manual"
        } else {
          const { data: webOrderDoc } = await getServiceClient()
            .from(TABLES.ORDERS)
            .select("*")
            .eq("id", orderId)
            .single()

          if (webOrderDoc) {
            orderData = webOrderDoc
            orderSource = "web"
          } else {
            const { data: soDoc } = await getServiceClient()
              .from(TABLES.SALES_ORDERS)
              .select("*")
              .eq("id", orderId)
              .single()

            if (soDoc) {
              orderData = soDoc
              orderSource = "manual"
            }
          }
        }

        // Update sales_orders status immediately (before attempting WO creation)
        await getServiceClient()
          .from(TABLES.SALES_ORDERS)
          .update({
            status: "producing",
            updated_at: new Date().toISOString()
          })
          .eq("id", orderId)

        if (orderData) {
          const normalizedItems = (orderData.items || []).map((item: any) => ({
            productId: item.productId || item.sku || item.product_id || "",
            name: item.name || item.product_name || "",
            quantity: item.quantity || item.qty || 1,
            size: item.size || "",
            unit_price: item.unit_price || item.basePrice || 0,
            ...item
          }))

          console.log(`Creating work order for ${orderSource} order ${orderId} with automatic cost calculation...`);

          const workOrderResult = await OrderItemDesignService.createWorkOrderWithAutoCosts(
            orderId,
            normalizedItems,
            {
              customer_name: (orderData as any).shipping_address?.fullName || orderData.customer_name || "Unknown Customer",
              customer_email: (orderData as any).user_id || (orderData as any).customer_email || "unknown_user",
              total_amount: orderData.total || (orderData as any).total_amount || 0,
              order_source: orderSource
            }
          );

          if (workOrderResult.success) {
            console.log(`✅ Created work order ${workOrderResult.workOrderId} with auto-calculated cost EGP ${workOrderResult.totalEstimatedCost}`);
          } else {
            console.error(`❌ Failed to create work order: ${workOrderResult.error}`);

            const basicWorkOrder = {
              sales_order_id: orderId,
              status: "pending",
              completion_percentage: 0,
              raw_materials_used: [],
              materials_issued: [],
              labor_hours: 0,
              labor_cost: 0,
              overhead_cost: 0,
              total_cost: 0,
              estimated_cost: 0,
              items: normalizedItems,
              notes: `Basic work order for ${orderSource} order ${orderId} (auto-cost failed: ${workOrderResult.error})`,
            };

            const { data: insertedWO } = await getServiceClient()
              .from(TABLES.WORK_ORDERS)
              .insert(basicWorkOrder)
              .select()

            if (insertedWO) {
              console.log(`Created basic work order ${insertedWO[0].id} as fallback`);
            }
          }
        }
      } catch (workOrderError) {
        console.error("Error creating work order:", workOrderError)
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


