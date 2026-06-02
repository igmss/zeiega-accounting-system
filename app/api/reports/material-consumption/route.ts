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

    let dbQuery = getServiceClient().from(TABLES.WORK_ORDERS).select("*")
    if (from) {
      dbQuery = dbQuery.gte("created_at", from)
    }
    if (to) {
      dbQuery = dbQuery.lte("created_at", to)
    }

    const { data: workOrders } = await dbQuery

    const consumption: Record<string, { name: string; totalQty: number; totalCost: number; woCount: number }> = {}
    for (const wo of (workOrders || [])) {
      const issued = Array.isArray(wo.materials_issued) ? wo.materials_issued : []
      for (const m of issued) {
        const key = m.itemId || m.itemName || "unknown"
        const entry = consumption[key] || { name: m.itemName || key, totalQty: 0, totalCost: 0, woCount: 0 }
        entry.totalQty += m.quantity || 0
        entry.totalCost += m.totalCost || (m.quantity * m.unitCost) || 0
        entry.woCount++
        consumption[key] = entry
      }
    }

    const items = Object.entries(consumption).map(([id, d]) => ({
      material_id: id, material_name: d.name, total_quantity: d.totalQty,
      total_cost: Math.round(d.totalCost * 100) / 100, work_orders_count: d.woCount,
      avg_cost_per_unit: d.totalQty > 0 ? Math.round((d.totalCost / d.totalQty) * 100) / 100 : 0,
    })).sort((a, b) => b.total_cost - a.total_cost)

    return NextResponse.json({
      items,
      summary: {
        totalCost: items.reduce((s, i) => s + i.total_cost, 0),
        totalQuantity: items.reduce((s, i) => s + i.total_quantity, 0),
        workOrdersWithConsumption: items.length,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate material consumption" }, { status: 500 })
  }
}
