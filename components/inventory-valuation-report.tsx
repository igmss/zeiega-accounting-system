"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, Package, TrendingDown, AlertTriangle } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface InventoryValuationReportProps {
  dateRange: {
    from: string
    to: string
  }
}

export function InventoryValuationReport({ dateRange }: InventoryValuationReportProps) {
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReportData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/reports/inventory-valuation?from=${dateRange.from}&to=${dateRange.to}`)
        if (!response.ok) {
          throw new Error('Failed to fetch inventory valuation report')
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
          <h2 className="text-2xl font-bold">Inventory Valuation Report</h2>
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
          <h2 className="text-2xl font-bold">Inventory Valuation Report</h2>
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

  const totalInventoryValue = reportData.inventoryData.reduce((sum: number, item: any) => sum + item.total_value, 0)
  const slowMovingItems = reportData.inventoryData.filter((item: any) => item.turnover_days > 90)
  const fastMovingItems = reportData.inventoryData.filter((item: any) => item.turnover_days <= 30)
  const mediumMovingItems = reportData.inventoryData.filter((item: any) => item.turnover_days > 30 && item.turnover_days <= 90)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</div>
                <div className="text-sm text-muted-foreground">Total Inventory Value</div>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{reportData.inventoryData.length}</div>
                <div className="text-sm text-muted-foreground">Total Items</div>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">{slowMovingItems.length}</div>
                <div className="text-sm text-muted-foreground">Slow Moving</div>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(slowMovingItems.reduce((sum: number, item: any) => sum + item.total_value, 0))}
                </div>
                <div className="text-sm text-muted-foreground">Slow Moving Value</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inventory by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reportData.inventoryByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {reportData.inventoryByType.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {reportData.inventoryByType.map((type: any) => (
                <div key={type.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="text-sm">
                    {type.name}: {formatCurrency(type.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory Turnover Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{fastMovingItems.length}</div>
                <div className="text-sm text-muted-foreground">Fast Moving Items (≤30 days)</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {mediumMovingItems.length}
                </div>
                <div className="text-sm text-muted-foreground">Medium Moving Items (31-90 days)</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{slowMovingItems.length}</div>
                <div className="text-sm text-muted-foreground">Slow Moving Items &gt;90 days</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Inventory Report */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Inventory Valuation Details</CardTitle>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Cost per Unit</TableHead>
                <TableHead>Total Value</TableHead>
                <TableHead>Turnover Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.inventoryData.map((item: any) => (
                <TableRow key={item.sku}>
                  <TableCell className="font-medium">{item.sku}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <Badge variant={item.type === "raw" ? "outline" : "secondary"}>
                      {item.type === "raw" ? "Raw Material" : "Finished Good"}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatCurrency(item.cost_per_unit)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(item.total_value)}</TableCell>
                  <TableCell>{item.turnover_days} days</TableCell>
                  <TableCell>
                    {item.turnover_days <= 30 ? (
                      <Badge variant="default">Fast Moving</Badge>
                    ) : item.turnover_days <= 90 ? (
                      <Badge variant="secondary">Medium</Badge>
                    ) : (
                      <Badge variant="destructive">Slow Moving</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-lg font-bold">{formatCurrency(reportData.inventoryByType[0].value)}</div>
                <div className="text-sm text-muted-foreground">Raw Materials Value</div>
              </div>
              <div>
                <div className="text-lg font-bold">{formatCurrency(reportData.inventoryByType[1].value)}</div>
                <div className="text-sm text-muted-foreground">Finished Goods Value</div>
              </div>
              <div>
                <div className="text-lg font-bold">{formatCurrency(totalInventoryValue)}</div>
                <div className="text-sm text-muted-foreground">Total Inventory Value</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
