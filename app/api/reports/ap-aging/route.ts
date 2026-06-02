import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const { data: vendors } = await getServiceClient().from(TABLES.VENDORS).select("*")

    let dbQuery = getServiceClient().from(TABLES.PURCHASE_ORDERS).select("*")
    if (from) {
      dbQuery = dbQuery.gte("created_at", from)
    }
    if (to) {
      dbQuery = dbQuery.lte("created_at", to)
    }
    const { data: purchaseOrders } = await dbQuery

    const now = to ? new Date(to) : new Date()
    const apByVendor: any[] = []

    for (const po of (purchaseOrders || [])) {
      if (po.status === "cancelled") continue
      const remaining = (po.total_amount || 0) - (po.paid_amount || 0)
      if (remaining <= 0) continue  // fully paid
      const vendor = (vendors || []).find((v: any) => v.id === po.vendor_id)

      // Use vendor payment_terms for due date calculation
      let dueDate: Date
      if (po.received_at || po.actual_delivery) {
        dueDate = new Date(po.received_at || po.actual_delivery)
      } else {
        const terms = vendor?.payment_terms || "Net 30"
        const days = parseInt(terms.match(/\d+/)?.[0] || "30")
        dueDate = new Date(po.created_at)
        dueDate.setDate(dueDate.getDate() + days)
      }

      const daysDue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)

      let aging = "current"
      if (daysDue > 90) aging = "90plus"
      else if (daysDue > 60) aging = "61_90"
      else if (daysDue > 30) aging = "31_60"
      else if (daysDue > 0) aging = "1_30"

      apByVendor.push({
        vendor_id: po.vendor_id,
        vendor_name: vendor?.name || "Unknown",
        po_id: po.id,
        amount: remaining,
        total: po.total_amount,
        paid: po.paid_amount || 0,
        due_date: dueDate.toISOString().split("T")[0],
        days_overdue: Math.max(0, daysDue),
        aging,
        status: po.status,
      })
    }

    const summary = {
      current: apByVendor.filter(a => a.aging === "current").reduce((s: number, a: any) => s + a.amount, 0),
      "1_30": apByVendor.filter(a => a.aging === "1_30").reduce((s: number, a: any) => s + a.amount, 0),
      "31_60": apByVendor.filter(a => a.aging === "31_60").reduce((s: number, a: any) => s + a.amount, 0),
      "61_90": apByVendor.filter(a => a.aging === "61_90").reduce((s: number, a: any) => s + a.amount, 0),
      "90plus": apByVendor.filter(a => a.aging === "90plus").reduce((s: number, a: any) => s + a.amount, 0),
      total: apByVendor.reduce((s: number, a: any) => s + a.amount, 0),
    }

    return NextResponse.json({ vendors: apByVendor, summary, totalPayables: summary.total })
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate AP aging" }, { status: 500 })
  }
}
