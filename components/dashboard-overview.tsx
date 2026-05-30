"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DollarSign, Package, TrendingUp, Clock, AlertCircle, CheckCircle, Wrench } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { formatCurrency } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"

interface DashboardData {
  kpiData: {
    revenue: number
    cogs: number
    profit: number
    wipValue: number
  }
  monthlyRevenue: Array<{
    month: string
    revenue: number
    cogs: number
  }>
  orderStatus: Array<{
    name: string
    value: number
    color: string
  }>
  recentOrders: Array<{
    id: string
    customer: string
    amount: number
    status: string
  }>
  workOrders: Array<{
    id: string
    salesOrder: string
    status: string
    completion: number
  }>
}

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const response = await fetch('/api/dashboard')
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data')
        }
        const apiData = await response.json()

        const { kpiData, monthlyRevenue, topCustomers, recentOrders, inventoryAlerts, workOrderStatus } = apiData

        const orderStatusData = [
          { name: "Pending", value: workOrderStatus?.pending || 0, color: "#f97316" },
          { name: "In Production", value: workOrderStatus?.in_progress || 0, color: "#164e63" },
          { name: "Completed", value: workOrderStatus?.completed || 0, color: "#10b981" },
          { name: "Invoiced", value: workOrderStatus?.invoiced || 0, color: "#6b7280" },
        ]

        const recentOrdersData = recentOrders?.slice(0, 4).map((order: any) => ({
          id: order.id,
          customer: order.customer_name,
          amount: order.total,
          status: order.status,
        })) || []

        const activeWorkOrders = workOrderStatus?.slice(0, 3).map((wo: any) => ({
          id: wo.id,
          salesOrder: wo.sales_order_id,
          status: wo.status,
          completion: wo.status === "completed" ? 100 : wo.completionPercentage ?? 0,
        })) || []

        setData({
          kpiData: kpiData || {
            revenue: 0,
            cogs: 0,
            profit: 0,
            wipValue: 0,
          },
          monthlyRevenue: monthlyRevenue || [],
          orderStatus: orderStatusData,
          recentOrders: recentOrdersData,
          workOrders: activeWorkOrders,
        })
      } catch (error) {
        console.error("Error loading dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()

    const salesChannel = supabase
      .channel("dashboard-sales-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sales_orders" },
        () => loadDashboardData()
      )
      .subscribe()

    const woChannel = supabase
      .channel("dashboard-wo-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => loadDashboardData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(salesChannel)
      supabase.removeChannel(woChannel)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return <div>Error loading dashboard data</div>
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpiData.revenue)}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 mr-1" />
              From paid invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost of Goods Sold</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpiData.cogs)}</div>
            <p className="text-xs text-muted-foreground">
              {data.kpiData.revenue > 0 ? Math.round((data.kpiData.cogs / data.kpiData.revenue) * 100) : 0}% of revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpiData.profit)}</div>
            <p className="text-xs text-muted-foreground">
              {data.kpiData.revenue > 0 ? Math.round((data.kpiData.profit / data.kpiData.revenue) * 100) : 0}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Work in Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpiData.wipValue)}</div>
            <p className="text-xs text-muted-foreground">{data.workOrders.length} active jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue vs COGS</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
                <Bar dataKey="revenue" fill="var(--color-chart-3)" name="Revenue" />
                <Bar dataKey="cogs" fill="var(--color-chart-1)" name="COGS" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.orderStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.orderStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-4">
              {data.orderStatus.map((status, index) => (
                <div key={status?.name || `status-${index}`} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} aria-hidden="true" />
                  <span className="text-sm">
                    {status.name}: {status.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Sales Orders</CardTitle>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentOrders.length > 0 ? (
                data.recentOrders.map((order, index) => (
                  <div key={order?.id || `order-${index}`} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{order.id}</div>
                      <div className="text-sm text-muted-foreground">{order.customer}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(order.amount)}</div>
                      <Badge
                        variant={
                          order.status === "completed"
                            ? "default"
                            : order.status === "producing"
                              ? "secondary"
                              : order.status === "invoiced"
                                ? "outline"
                                : "destructive"
                        }
                      >
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent orders</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Work Orders</CardTitle>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.workOrders.length > 0 ? (
                data.workOrders.map((wo, index) => (
                  <div key={wo?.id || `workorder-${index}`} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{wo.id}</div>
                        <div className="text-sm text-muted-foreground">Order: {wo.salesOrder}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {wo.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                        ) : wo.status === "in_progress" ? (
                          <Wrench className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                        )}
                        <span className="text-sm">{wo.completion}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${wo.completion}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No active work orders</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
