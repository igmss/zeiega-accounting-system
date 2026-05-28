"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Building, DollarSign } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface BalanceSheetReportProps {
  dateRange: {
    from: string
    to: string
  }
}

export function BalanceSheetReport({ dateRange }: BalanceSheetReportProps) {
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReportData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/reports/balance-sheet?from=${dateRange.from}&to=${dateRange.to}`)
        if (!response.ok) {
          throw new Error('Failed to fetch balance sheet')
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
          <h2 className="text-2xl font-bold">Balance Sheet</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-muted h-24 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !reportData) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Balance Sheet</h2>
        <p className="text-muted-foreground">Error loading report: {error}</p>
      </div>
    )
  }

  const { assets, liabilities, equity, total_liabilities_and_equity } = reportData

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(assets?.total_assets || 0)}</div>
                <div className="text-sm text-muted-foreground">Total Assets</div>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(liabilities?.total_liabilities || 0)}</div>
                <div className="text-sm text-muted-foreground">Total Liabilities</div>
              </div>
              <Building className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(equity?.total_equity || 0)}</div>
                <div className="text-sm text-muted-foreground">Total Equity</div>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-bold">Current Assets</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {assets?.current_assets?.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-4 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Current Assets</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(assets?.current_assets?.total_current_assets || 0)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-bold pt-4">Fixed Assets</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {assets?.fixed_assets?.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-4 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Fixed Assets</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(assets?.fixed_assets?.total_fixed_assets || 0)}</TableCell>
                </TableRow>

                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">TOTAL ASSETS</TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(assets?.total_assets || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liabilities & Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-bold">Current Liabilities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {liabilities?.current_liabilities?.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-4 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Current Liabilities</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(liabilities?.current_liabilities?.total_current_liabilities || 0)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-bold pt-4">Long-Term Liabilities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {liabilities?.long_term_liabilities?.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-4 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Long-Term Liabilities</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(liabilities?.long_term_liabilities?.total_long_term_liabilities || 0)}</TableCell>
                </TableRow>

                <TableRow className="border-t">
                  <TableCell className="font-medium">Total Liabilities</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(liabilities?.total_liabilities || 0)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-bold pt-4">Equity</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {equity?.items?.map((item: any) => (
                  <TableRow key={item.code}>
                    <TableCell className="pl-4 text-sm">{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total Equity</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(equity?.total_equity || 0)}</TableCell>
                </TableRow>

                <TableRow className="border-t-2">
                  <TableCell className="font-bold text-lg">TOTAL LIABILITIES & EQUITY</TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(total_liabilities_and_equity || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
