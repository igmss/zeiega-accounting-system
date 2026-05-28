import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
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
      return NextResponse.json(
        { error: "Date range is required" },
        { status: 400 }
      )
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    // Fetch work orders and sales orders
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
      .where('created_at', '>=', fromDate)
      .where('created_at', '<=', toDate)
      .get()

    const workOrders: any[] = workOrdersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    const salesOrdersSnapshot = await db.collection(COLLECTIONS.SALES_ORDERS).get()
    const salesOrders: any[] = salesOrdersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Create job profitability data
    const jobData = workOrders.map((wo: any) => {
      const salesOrder = (salesOrders as any[]).find(so => so.id === wo.sales_order_id)

      const materialCost = wo.raw_materials_used?.reduce((sum: number, mat: any) =>
        sum + (mat.qty * mat.cost), 0) || 0

      const laborCost = wo.labor_cost || wo.laborCost || 0
      const overheadCost = wo.overhead_cost || 0
      const totalCost = materialCost + laborCost + overheadCost

      const revenue = salesOrder?.total || 0
      const grossProfit = revenue - totalCost
      const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0

      return {
        work_order_id: wo.id,
        sales_order_id: wo.sales_order_id,
        customer_name: wo.customer_name,
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

    // If no job data, return empty structure
    if (jobData.length === 0) {
      return NextResponse.json({
        jobData: [],
        chartData: [],
        summary: {
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          averageMargin: 0,
          jobCount: 0,
          completedJobs: 0,
          inProgressJobs: 0,
        }
      })
    }

    // Calculate totals
    const totalRevenue = jobData.reduce((sum, job) => sum + job.revenue, 0)
    const totalCost = jobData.reduce((sum, job) => sum + job.total_cost, 0)
    const totalProfit = totalRevenue - totalCost
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    const chartData = jobData.map((job) => ({
      job: job.work_order_id,
      revenue: job.revenue,
      cost: job.total_cost,
      profit: job.gross_profit,
    }))

    const reportData = {
      jobData,
      chartData,
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        totalProfit: Math.round(totalProfit),
        averageMargin: Math.round(averageMargin * 10) / 10,
        jobCount: jobData.length,
        completedJobs: jobData.filter(job => job.status === 'completed').length,
        inProgressJobs: jobData.filter(job => job.status === 'in_progress').length,
      }
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Error generating job profitability report:", error)
    return NextResponse.json(
      { error: "Failed to generate job profitability report" },
      { status: 500 }
    )
  }
}
