import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: "Date range is required" }, { status: 400 })
    }

    const fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    const { data: workOrders, error: woError } = await getServiceClient()
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())

    if (woError) throw woError

    const soIds = [...new Set((workOrders || []).map((wo: any) => wo.sales_order_id).filter(Boolean))]
    const { data: salesOrders } = soIds.length > 0
      ? await getServiceClient().from(TABLES.SALES_ORDERS).select("*").in("id", soIds as string[])
      : { data: [] }

    const { data: invoices } = soIds.length > 0
      ? await getServiceClient().from(TABLES.INVOICES).select("*").in("sales_order_id", soIds as string[])
      : { data: [] }

    const revenueBySO = new Map<string, number>()
    for (const inv of (invoices || [])) {
      const amt = inv.total_amount || inv.amount || 0
      revenueBySO.set(inv.sales_order_id, (revenueBySO.get(inv.sales_order_id) || 0) + amt)
    }

    const jobData = (workOrders || []).map((wo: any) => {
      const matIssued = Array.isArray(wo.materials_issued) ? wo.materials_issued : []
      const materialCost = matIssued.reduce((sum: number, m: any) =>
        sum + ((m.totalCost || m.quantity * m.unitCost) || 0), 0)

      const laborCost = wo.labor_cost || 0
      const overheadCost = wo.overhead_cost || 0
      const totalCost = materialCost + laborCost + overheadCost

      const salesOrder = (salesOrders || []).find((so: any) => so.id === wo.sales_order_id)
      const revenue = revenueBySO.get(wo.sales_order_id)
        || (salesOrder?.total_amount || salesOrder?.total || 0)

      const grossProfit = revenue - totalCost
      const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0

      return {
        work_order_id: wo.id,
        sales_order_id: wo.sales_order_id,
        customer_name: salesOrder?.customer_name || wo.customer_name || "",
        revenue: Math.round(revenue),
        material_cost: Math.round(materialCost),
        labor_cost: Math.round(laborCost),
        overhead_cost: Math.round(overheadCost),
        total_cost: Math.round(totalCost),
        gross_profit: Math.round(grossProfit),
        margin_percent: Math.round(marginPercent * 10) / 10,
        status: wo.status,
      }
    })

    const totalRevenue = jobData.reduce((s: number, j: any) => s + j.revenue, 0)
    const totalCost = jobData.reduce((s: number, j: any) => s + j.total_cost, 0)
    const totalProfit = totalRevenue - totalCost
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    return NextResponse.json({
      jobData: jobData.length > 0 ? jobData : [],
      chartData: jobData.map((j: any) => ({ job: j.work_order_id, revenue: j.revenue, cost: j.total_cost, profit: j.gross_profit })),
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        totalProfit: Math.round(totalProfit),
        averageMargin: Math.round(avgMargin * 10) / 10,
        jobCount: jobData.length,
        completedJobs: jobData.filter((j: any) => j.status === 'completed').length,
        inProgressJobs: jobData.filter((j: any) => j.status === 'in_progress').length,
      }
    })
  } catch (error) {
    console.error("Error generating job profitability report:", error)
    return NextResponse.json({ error: "Failed to generate job profitability report" }, { status: 500 })
  }
}
