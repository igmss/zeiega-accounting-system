import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { data: invoices } = await getServiceClient().from(TABLES.INVOICES).select("*")

    const byCustomer = new Map<string, { name: string; revenue: number; orders: number; paid: number; unpaid: number }>()
    for (const inv of (invoices || [])) {
      const key = inv.customer_id || inv.customer_name || "Unknown"
      const entry = byCustomer.get(key) || { name: inv.customer_name || key, revenue: 0, orders: 0, paid: 0, unpaid: 0 }
      entry.revenue += inv.total_amount || inv.amount || 0
      entry.orders++
      if (inv.status === "paid") entry.paid += inv.total_amount || inv.amount || 0
      else entry.unpaid += inv.total_amount || inv.amount || 0
      byCustomer.set(key, entry)
    }

    const customers = Array.from(byCustomer.entries()).map(([id, d]) => ({
      customer_id: id, customer_name: d.name, total_revenue: d.revenue, order_count: d.orders, paid: d.paid, unpaid: d.unpaid
    })).sort((a, b) => b.total_revenue - a.total_revenue)

    return NextResponse.json({
      customers,
      summary: {
        totalRevenue: customers.reduce((s, c) => s + c.total_revenue, 0),
        totalOrders: customers.reduce((s, c) => s + c.order_count, 0),
        totalPaid: customers.reduce((s, c) => s + c.paid, 0),
        totalUnpaid: customers.reduce((s, c) => s + c.unpaid, 0),
        customerCount: customers.length,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate sales by customer" }, { status: 500 })
  }
}
