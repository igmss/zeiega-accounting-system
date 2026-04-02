"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Download, TrendingUp, TrendingDown, DollarSign, Calculator } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface ProfitLossReportProps {
  dateRange: {
    from: string
    to: string
  }
}

export function ProfitLossReport({ dateRange }: ProfitLossReportProps) {
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReportData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/reports/profit-loss?from=${dateRange.from}&to=${dateRange.to}`)
        if (!response.ok) {
          throw new Error('Failed to fetch P&L report')
        }
        const data = await response.json()
        setReportData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    
    fetchReportData()

    // Auto-refresh every 30 seconds to get new data
    const interval = setInterval(fetchReportData, 30000)

    return () => clearInterval(interval)
  }, [dateRange.from, dateRange.to])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profit & Loss Report</h2>
          <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse bg-muted h-24 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !reportData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profit & Loss Report</h2>
          <Button disabled>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Error loading report: {error}</p>
        </div>
      </div>
    )
  }

  const grossMargin = reportData.revenue.total_revenue > 0 
    ? (reportData.gross_profit / reportData.revenue.total_revenue) * 100 
    : 0
  const netMargin = reportData.revenue.total_revenue > 0 
    ? (reportData.net_income / reportData.revenue.total_revenue) * 100 
    : 0

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(reportData.revenue.total_revenue)}</div>
                <div className="text-sm text-muted-foreground">Total Revenue</div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(reportData.gross_profit)}</div>
                <div className="text-sm text-muted-foreground">Gross Profit</div>
              </div>
              <div className="text-sm text-green-600">{grossMargin.toFixed(1)}%</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(reportData.operating_income)}</div>
                <div className="text-sm text-muted-foreground">Operating Income</div>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(reportData.net_income)}</div>
                <div className="text-sm text-muted-foreground">Net Income</div>
              </div>
              <div className="text-sm text-green-600">{netMargin.toFixed(1)}%</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Profit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={reportData.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
                <Line type="monotone" dataKey="profit" stroke="var(--color-chart-3)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportData.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
                <Bar dataKey="revenue" fill="var(--color-chart-3)" name="Revenue" />
                <Bar dataKey="expenses" fill="var(--color-chart-1)" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed P&L Statement */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Profit & Loss Statement</CardTitle>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-bold">Manufacturing Company</h3>
              <p className="text-muted-foreground">
                Profit & Loss Statement for {dateRange.from} to {dateRange.to}
              </p>
            </div>

            <Table>
              <TableBody>
                {/* Revenue Section */}
                <TableRow>
                  <TableCell className="font-bold">REVENUE</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Sales Revenue</TableCell>
                  <TableCell className="text-right">{formatCurrency(reportData.revenue.sales_revenue)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Other Income</TableCell>
                  <TableCell className="text-right">{formatCurrency(reportData.revenue.other_income)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Revenue</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(reportData.revenue.total_revenue)}
                  </TableCell>
                </TableRow>

                {/* COGS Section */}
                <TableRow>
                  <TableCell className="font-bold pt-6">COST OF GOODS SOLD</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Raw Materials</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(reportData.cost_of_goods_sold.raw_materials)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Direct Labor</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(reportData.cost_of_goods_sold.direct_labor)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Manufacturing Overhead</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(reportData.cost_of_goods_sold.manufacturing_overhead)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Cost of Goods Sold</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(reportData.cost_of_goods_sold.total_cogs)}
                  </TableCell>
                </TableRow>

                {/* Gross Profit */}
                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">GROSS PROFIT</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-lg text-green-600">
                    {formatCurrency(reportData.gross_profit)}
                  </TableCell>
                </TableRow>

                {/* Operating Expenses */}
                <TableRow>
                  <TableCell className="font-bold pt-6">OPERATING EXPENSES</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold pt-4 pl-6 text-sm text-blue-600 italic">Online Sales Costs</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {reportData.operating_expenses.onlineSalesCosts?.items.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-12 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(item.amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="pl-12 font-medium text-sm">Subtotal Online Sales Costs</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-medium text-sm">{formatCurrency(reportData.operating_expenses.onlineSalesCosts?.total || 0)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-6 pt-4 font-bold">General Operating Expenses</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {reportData.operating_expenses.items.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-12">{item.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Operating Expenses</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(reportData.operating_expenses.total_operating_expenses)}
                  </TableCell>
                </TableRow>

                {/* Operating Income */}
                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">OPERATING INCOME</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {formatCurrency(reportData.operating_income)}
                  </TableCell>
                </TableRow>

                {/* Other Income/Expenses */}
                <TableRow>
                  <TableCell className="font-bold pt-6">OTHER INCOME (EXPENSES)</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Interest Income</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(reportData.other_income_expenses.interest_income)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6">Interest Expense</TableCell>
                  <TableCell className="text-right text-red-600">
                    ({formatCurrency(Math.abs(reportData.other_income_expenses.interest_expense))})
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Other Income (Expenses)</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-red-600">
                    ({formatCurrency(Math.abs(reportData.other_income_expenses.total_other))})
                  </TableCell>
                </TableRow>

                {/* Net Income */}
                <TableRow className="border-t-4 border-double">
                  <TableCell className="font-bold text-xl">NET INCOME</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-xl text-green-600">
                    {formatCurrency(reportData.net_income)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
