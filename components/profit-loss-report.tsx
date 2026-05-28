"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Download, TrendingUp } from "lucide-react"
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
    const interval = setInterval(fetchReportData, 30000)
    return () => clearInterval(interval)
  }, [dateRange.from, dateRange.to])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profit & Loss Report</h2>
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
        <h2 className="text-2xl font-bold">Profit & Loss Report</h2>
        <p className="text-muted-foreground">Error loading report: {error}</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Profit & Loss Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Period: {reportData.periodStart} to {reportData.periodEnd}
            </p>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-bold text-lg">REVENUE</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {reportData.revenue.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-6">{item.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Revenue</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(reportData.revenue.total_revenue)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-bold text-lg pt-6">COST OF GOODS SOLD</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {reportData.cost_of_goods_sold.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-6">{item.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total COGS</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(reportData.cost_of_goods_sold.total_cogs)}</TableCell>
                </TableRow>

                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">GROSS PROFIT</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-lg text-green-600">{formatCurrency(reportData.gross_profit)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-bold text-lg pt-6">OPERATING EXPENSES</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {reportData.operating_expenses.onlineSalesCosts?.items?.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell className="pl-6 font-medium text-sm text-blue-600">Online Sales Costs</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    {reportData.operating_expenses.onlineSalesCosts.items.map((item: any) => (
                      <TableRow key={item.code}>
                        <TableCell className="pl-12 text-sm">{item.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
                {reportData.operating_expenses.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-6">{item.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Operating Expenses</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(reportData.operating_expenses.total_operating_expenses)}</TableCell>
                </TableRow>

                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">OPERATING INCOME</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(reportData.operating_income)}</TableCell>
                </TableRow>

                {reportData.other_income_expenses.items?.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell className="font-bold text-lg pt-6">OTHER INCOME (EXPENSES)</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    {reportData.other_income_expenses.items.map((item: any) => (
                      <TableRow key={item.code}>
                        <TableCell className="pl-6">{item.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-medium">Total Other</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(reportData.other_income_expenses.total_other)}</TableCell>
                    </TableRow>
                  </>
                )}

                <TableRow className="border-t-4 border-double">
                  <TableCell className="font-bold text-xl">NET INCOME</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold text-xl text-green-600">{formatCurrency(reportData.net_income)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
