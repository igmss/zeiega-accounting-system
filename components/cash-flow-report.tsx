"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table"
import { Download, ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface CashFlowReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function CashFlowReport({ dateRange }: CashFlowReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/cash-flow?from=${dateRange.from}&to=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch Cash Flow report')
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
                    <h2 className="text-2xl font-bold">Cash Flow Statement</h2>
                    <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
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
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Cash Flow Statement</h2>
                </div>
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Error loading report: {error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.operating.net_cash)}</div>
                                <div className="text-sm text-muted-foreground">Operating Activities</div>
                            </div>
                            <ArrowUpCircle className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.investing.net_cash)}</div>
                                <div className="text-sm text-muted-foreground">Investing Activities</div>
                            </div>
                            <ArrowDownCircle className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.financing.net_cash)}</div>
                                <div className="text-sm text-muted-foreground">Financing Activities</div>
                            </div>
                            <Wallet className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Cash Flow Statement */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Cash Flow Statement</CardTitle>
                    <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export PDF
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="text-center">
                            <h3 className="text-lg font-bold">TEL U ASEGH</h3>
                            <p className="text-muted-foreground">
                                Cash Flow Statement for {dateRange.from} to {dateRange.to}
                            </p>
                        </div>

                        <Table>
                            <TableBody>
                                {/* Operating Activities */}
                                <TableRow>
                                    <TableCell className="font-bold">CASH FLOWS FROM OPERATING ACTIVITIES</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Net Income</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.operating.net_income)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Depreciation & Amortization</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.operating.depreciation)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Changes in Accounts Receivable</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.operating.ar_change)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Changes in Inventory</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.operating.inventory_change)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Changes in Accounts Payable</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.operating.ap_change)}</TableCell>
                                </TableRow>
                                <TableRow className="border-t">
                                    <TableCell className="font-medium">Net Cash from Operating Activities</TableCell>
                                    <TableCell className="text-right font-bold text-green-600">
                                        {formatCurrency(reportData.operating.net_cash)}
                                    </TableCell>
                                </TableRow>

                                {/* Investing Activities */}
                                <TableRow>
                                    <TableCell className="font-bold pt-6">CASH FLOWS FROM INVESTING ACTIVITIES</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Purchase of Equipment</TableCell>
                                    <TableCell className="text-right text-red-600">({formatCurrency(Math.abs(reportData.investing.equipment_purchase))})</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Sale of Assets</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.investing.asset_sales)}</TableCell>
                                </TableRow>
                                <TableRow className="border-t">
                                    <TableCell className="font-medium">Net Cash from Investing Activities</TableCell>
                                    <TableCell className="text-right font-bold text-blue-600">
                                        {formatCurrency(reportData.investing.net_cash)}
                                    </TableCell>
                                </TableRow>

                                {/* Financing Activities */}
                                <TableRow>
                                    <TableCell className="font-bold pt-6">CASH FLOWS FROM FINANCING ACTIVITIES</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Loan Proceeds</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.financing.loan_proceeds)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Loan Repayments</TableCell>
                                    <TableCell className="text-right text-red-600">({formatCurrency(Math.abs(reportData.financing.loan_repayments))})</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Owner Drawings</TableCell>
                                    <TableCell className="text-right text-red-600">({formatCurrency(Math.abs(reportData.financing.owner_drawings))})</TableCell>
                                </TableRow>
                                <TableRow className="border-t">
                                    <TableCell className="font-medium">Net Cash from Financing Activities</TableCell>
                                    <TableCell className="text-right font-bold text-purple-600">
                                        {formatCurrency(reportData.financing.net_cash)}
                                    </TableCell>
                                </TableRow>

                                {/* Summary */}
                                <TableRow className="border-t-4 border-double">
                                    <TableCell className="font-bold text-lg">NET CHANGE IN CASH</TableCell>
                                    <TableCell className="text-right font-bold text-lg">
                                        {formatCurrency(reportData.net_change_in_cash)}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>Beginning Cash Balance</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.beginning_cash)}</TableCell>
                                </TableRow>
                                <TableRow className="border-t-2">
                                    <TableCell className="font-bold text-xl">ENDING CASH BALANCE</TableCell>
                                    <TableCell className="text-right font-bold text-xl text-green-600">
                                        {formatCurrency(reportData.ending_cash)}
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
