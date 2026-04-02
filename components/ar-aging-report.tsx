"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table"
import { Download, Clock, AlertTriangle, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface ARAgingReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function ARAgingReport({ dateRange }: ARAgingReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/ar-aging?from=${dateRange.from}&to=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch AR Aging report')
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
                    <h2 className="text-2xl font-bold">Accounts Receivable Aging</h2>
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
                    <h2 className="text-2xl font-bold">Accounts Receivable Aging</h2>
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
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.summary.current)}</div>
                                <div className="text-sm text-muted-foreground">Current (0-30 days)</div>
                            </div>
                            <Clock className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.summary.days_31_60)}</div>
                                <div className="text-sm text-muted-foreground">31-60 Days</div>
                            </div>
                            <Clock className="h-8 w-8 text-yellow-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.summary.days_61_90)}</div>
                                <div className="text-sm text-muted-foreground">61-90 Days</div>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold text-red-600">{formatCurrency(reportData.summary.over_90)}</div>
                                <div className="text-sm text-muted-foreground">Over 90 Days</div>
                            </div>
                            <AlertCircle className="h-8 w-8 text-red-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AR Aging Detail */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>AR Aging by Customer</CardTitle>
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
                                Accounts Receivable Aging Report as of {dateRange.to}
                            </p>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">Current</TableHead>
                                    <TableHead className="text-right">31-60 Days</TableHead>
                                    <TableHead className="text-right">61-90 Days</TableHead>
                                    <TableHead className="text-right">Over 90 Days</TableHead>
                                    <TableHead className="text-right font-bold">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.customers?.map((customer: any, index: number) => (
                                    <TableRow key={index}>
                                        <TableCell>{customer.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(customer.current)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(customer.days_31_60)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(customer.days_61_90)}</TableCell>
                                        <TableCell className="text-right text-red-600">{formatCurrency(customer.over_90)}</TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(customer.total)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="border-t-2 font-bold">
                                    <TableCell>TOTAL</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.summary.current)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.summary.days_31_60)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.summary.days_61_90)}</TableCell>
                                    <TableCell className="text-right text-red-600">{formatCurrency(reportData.summary.over_90)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.summary.total)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
