import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requireAuth } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    console.log("Fetching real orders from Firestore...")

    // Fetch orders from your actual Firestore collection
    const ordersSnapshot = await db.collection(COLLECTIONS.ORDERS).get()
    const orders: any[] = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`Found ${orders.length} orders`)

    // Map orders to sales orders format for accounting system
    const salesOrders = orders.map(order => ({
      id: order.id,
      customer_name: order.shippingAddress?.fullName || "Unknown Customer",
      customer_email: order.userId, // Using userId as identifier
      order_date: order.createdAt?.toDate?.() || new Date(),
      status: mapOrderStatus(order.status),
      items: order.items?.map((item: any) => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.basePrice,
        total_price: item.adjustedPrice || item.basePrice
      })) || [],
      subtotal: order.total || 0,
      tax_amount: 0, // You might want to calculate this
      shipping_cost: 0, // You might want to add this field
      total_amount: order.total || 0,
      payment_method: order.paymentMethod || "unknown",
      shipping_address: order.shippingAddress || {},
      notes: `Original order status: ${order.status}`,
      created_at: order.createdAt?.toDate?.() || new Date(),
      updated_at: order.updatedAt?.toDate?.() || new Date()
    }))

    // Also fetch returns/refunds
    const returnsSnapshot = await db.collection(COLLECTIONS.RETURNS).get()
    const returns: any[] = returnsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

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
