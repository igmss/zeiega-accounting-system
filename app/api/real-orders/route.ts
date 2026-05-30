import { NextRequest, NextResponse } from "next/server"
import { getServiceClient, TABLES } from "@/lib/supabase"
import { requireAuth } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    console.log("Fetching real orders from Supabase...")

    const { data: orders, error: ordersError } = await getServiceClient()
      .from(TABLES.ORDERS)
      .select("*")

    if (ordersError) throw ordersError

    console.log(`Found ${orders.length} orders`)

    const salesOrders = orders.map((order: any) => ({
      id: order.id,
      customer_name: order.shippingAddress?.fullName || "Unknown Customer",
      customer_email: order.userId,
      order_date: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
      status: mapOrderStatus(order.status),
      items: order.items?.map((item: any) => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.basePrice,
        total_price: item.adjustedPrice || item.basePrice
      })) || [],
      subtotal: order.total || 0,
      tax_amount: 0,
      shipping_cost: 0,
      total_amount: order.total || 0,
      payment_method: order.paymentMethod || "unknown",
      shipping_address: order.shippingAddress || {},
      notes: `Original order status: ${order.status}`,
      created_at: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
      updated_at: order.updatedAt ? new Date(order.updatedAt).toISOString() : new Date().toISOString()
    }))

    const { data: returns, error: returnsError } = await getServiceClient()
      .from(TABLES.RETURNS)
      .select("*")

    if (returnsError) throw returnsError

    console.log(`Found ${returns.length} returns`)

    return NextResponse.json({
      salesOrders,
      returns,
      totalOrders: orders.length,
      totalReturns: returns.length
    })

  } catch (error) {
    console.error("Error fetching orders:", error)
    return NextResponse.json(
      { error: "Failed to fetch orders" },
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
      return "pending"
    case "cancelled":
      return "cancelled"
    case "refunded":
      return "refunded"
    default:
      return "pending"
  }
}
