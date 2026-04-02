"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface JobProfitabilityReportProps {
  dateRange: {
    from: string
    to: string
  }
}

export function JobProfitabilityReport({ dateRange }: JobProfitabilityReportProps) {
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReportData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/reports/job-profitability?from=${dateRange.from}&to=${dateRange.to}`)
        if (!response.ok) {
          throw new Error('Failed to fetch job profitability report')
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
  }, [dateRange.from, dateRange.to])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Job Profitability Report</h2>
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
          <h2 className="text-2xl font-bold">Job Profitability Report</h2>
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

  const totalRevenue = reportData.jobData.reduce((sum: number, job: any) => sum + job.revenue, 0)
  const totalCost = reportData.jobData.reduce((sum: number, job: any) => sum + job.total_cost, 0)
  const totalProfit = reportData.jobData.reduce((sum: number, job: any) => sum + job.gross_profit, 0)
  const averageMargin = reportData.jobData.length > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const highMarginJobs = reportData.jobData.filter((job: any) => job.margin_percent > 35)
  const lowMarginJobs = reportData.jobData.filter((job: any) => job.margin_percent < 20)
  const mediumMarginJobs = reportData.jobData.filter((job: any) => job.margin_percent >= 20 && job.margin_percent <= 35)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                <div className="text-sm text-muted-foreground">Total Job Revenue</div>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(totalProfit)}</div>
                <div className="text-sm text-muted-foreground">Total Gross Profit</div>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{averageMargin.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Average Margin</div>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{lowMarginJobs.length}</div>
                <div className="text-sm text-muted-foreground">Low Margin Jobs</div>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Profitability Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Job Profitability Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
              <BarChart data={reportData.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="job" />
              <YAxis />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
              <Bar dataKey="revenue" fill="var(--color-chart-3)" name="Revenue" />
              <Bar dataKey="cost" fill="var(--color-chart-1)" name="Total Cost" />
              <Bar dataKey="profit" fill="var(--color-chart-2)" name="Gross Profit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Job Profitability */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Job Profitability Details</CardTitle>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Material Cost</TableHead>
                <TableHead>Labor Cost</TableHead>
                <TableHead>Overhead</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Gross Profit</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.jobData.map((job: any) => (
                <TableRow key={job.work_order_id}>
                  <TableCell className="font-medium">{job.work_order_id}</TableCell>
                  <TableCell>{job.customer_name}</TableCell>
                  <TableCell>{formatCurrency(job.revenue)}</TableCell>
                  <TableCell>{formatCurrency(job.material_cost)}</TableCell>
                  <TableCell>{formatCurrency(job.labor_cost)}</TableCell>
                  <TableCell>{formatCurrency(job.overhead_cost)}</TableCell>
                  <TableCell>{formatCurrency(job.total_cost)}</TableCell>
                  <TableCell
                    className={job.gross_profit > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}
                  >
                    {formatCurrency(job.gross_profit)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        job.margin_percent > 35 ? "default" : job.margin_percent > 20 ? "secondary" : "destructive"
                      }
                    >
                      {job.margin_percent.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={job.status === "completed" ? "default" : "secondary"}>{job.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Summary Section */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{highMarginJobs.length}</div>
                  <div className="text-sm text-muted-foreground">High Margin Jobs &gt;35%</div>
                  <div className="text-xs text-muted-foreground">
                    ${highMarginJobs.reduce((sum: number, job: any) => sum + job.gross_profit, 0).toLocaleString()} profit
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{mediumMarginJobs.length}</div>
                  <div className="text-sm text-muted-foreground">Medium Margin Jobs (20-35%)</div>
                  <div className="text-xs text-muted-foreground">
                    ${mediumMarginJobs.reduce((sum: number, job: any) => sum + job.gross_profit, 0).toLocaleString()} profit
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{lowMarginJobs.length}</div>
                  <div className="text-sm text-muted-foreground">Low Margin Jobs &lt;20%</div>
                  <div className="text-xs text-muted-foreground">
                    ${lowMarginJobs.reduce((sum: number, job: any) => sum + job.gross_profit, 0).toLocaleString()} profit
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
