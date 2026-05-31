import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { data: vendors } = await getServiceClient().from(TABLES.VENDORS).select("*")
    const { data: purchaseOrders } = await getServiceClient().from(TABLES.PURCHASE_ORDERS).select("*")

    const now = new Date()
    const apByVendor: any[] = []

    for (const po of (purchaseOrders || [])) {
      if (po.status === "received" || po.status === "cancelled") continue
      const vendor = (vendors || []).find((v: any) => v.id === po.vendor_id)
      const dueDate = po.expected_delivery ? new Date(po.expected_delivery) : new Date(po.created_at)
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
        amount: po.total_amount || 0,
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
