import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { orderId } = await request.json()
    const serviceDb = getServiceClient()

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      )
    }

    let orderSource: string | null = null

    const { data: manualOrder } = await serviceDb
      .from(TABLES.MANUAL_ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (manualOrder) {
      orderSource = "manual_orders"
    } else {
      const { data: webOrder } = await serviceDb
        .from(TABLES.ORDERS)
        .select("*")
        .eq("id", orderId)
        .single()

      if (webOrder) {
        orderSource = "orders"
      } else {
        const { data: salesOrder } = await serviceDb
          .from(TABLES.SALES_ORDERS)
          .select("*")
          .eq("id", orderId)
          .single()

        if (salesOrder) {
          orderSource = "acc_sales_orders"
        }
      }
    }

    if (!orderSource) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      )
    }

    // Update order status in the source collection
    if (orderSource === "manual_orders") {
      await serviceDb.from(TABLES.MANUAL_ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    } else if (orderSource === "orders") {
      await serviceDb.from(TABLES.ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    }

    // Sync to accounting sales orders
    const { data: salesOrderDoc } = await serviceDb
      .from(TABLES.SALES_ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (salesOrderDoc) {
      await serviceDb.from(TABLES.SALES_ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    }

    // Mark associated work orders as completed (no journal entries here —
    // the /api/work-orders/complete endpoint is the single authoritative handler)
    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("sales_order_id", orderId)

    if (workOrders && workOrders.length > 0) {
      for (const wo of workOrders) {
        if (wo.status !== "completed") {
          await serviceDb.from(TABLES.WORK_ORDERS).update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq("id", wo.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      message: "Order status updated to completed"
    })

  } catch (error) {
    console.error("Error completing order:", error)
    return NextResponse.json(
      { error: "Failed to complete order" },
      { status: 500 }
    )
  }
}
