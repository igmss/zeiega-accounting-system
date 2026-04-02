"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table"
import { Download, Receipt, Building2, Percent, CheckCircle2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface TaxVATReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function TaxVATReport({ dateRange }: TaxVATReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/tax-vat?from=${dateRange.from}&to=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch Tax/VAT report')
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
                    <h2 className="text-2xl font-bold">Tax & VAT Report</h2>
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
                    <h2 className="text-2xl font-bold">Tax & VAT Report</h2>
                </div>
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Error loading report: {error}</p>
                </div>
            </div>
        )
    }

    const netVAT = reportData.output_vat - reportData.input_vat

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.output_vat_posted)}</div>
                                <div className="text-sm text-muted-foreground">Output VAT (Posted)</div>
                            </div>
                            <Receipt className="h-8 w-8 text-red-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.input_vat_posted)}</div>
                                <div className="text-sm text-muted-foreground">Input VAT (Posted)</div>
                            </div>
                            <Building2 className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.vat_already_filed)}</div>
                                <div className="text-sm text-muted-foreground">VAT Already Filed</div>
                            </div>
                            <CheckCircle2 className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className={`text-2xl font-bold ${reportData.vat_outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(reportData.vat_outstanding)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Remaining Payable
                                </div>
                            </div>
                            <Percent className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* VAT Report Detail */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>VAT Report Detail</CardTitle>
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
                                VAT Report for {dateRange.from} to {dateRange.to}
                            </p>
                            <p className="text-sm text-muted-foreground">VAT Rate: {reportData.vat_rate}%</p>
                        </div>

                        <Table>
                            <TableBody>
                                {/* Output VAT Section */}
                                <TableRow>
                                    <TableCell className="font-bold">OUTPUT VAT (On Sales)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Total Taxable Sales</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.taxable_sales)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Output VAT (Actual Posted)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold">{formatCurrency(reportData.output_vat_posted)}</TableCell>
                                </TableRow>

                                {/* Input VAT Section */}
                                <TableRow>
                                    <TableCell className="font-bold pt-6">INPUT VAT (On Purchases)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Total Taxable Purchases (Reference)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.taxable_purchases)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Input VAT (Actual Posted)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold text-green-600">({formatCurrency(reportData.input_vat_posted)})</TableCell>
                                </TableRow>

                                {/* Net VAT */}
                                <TableRow className="border-t-2">
                                    <TableCell className="font-bold">NET VAT PAYABLE / (RECEIVABLE)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className={`text-right font-bold ${reportData.net_vat_payable > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(reportData.net_vat_payable)}
                                    </TableCell>
                                </TableRow>

                                {/* Reconciliation */}
                                <TableRow>
                                    <TableCell className="pl-6 italic">Less: VAT Already Filed/Declared (Account 2112)</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        ({formatCurrency(reportData.vat_already_filed)})
                                    </TableCell>
                                </TableRow>

                                <TableRow className="border-t-4 border-double">
                                    <TableCell className="font-bold text-lg">REMAINING VAT OUTSTANDING</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className={`text-right font-bold text-lg ${reportData.vat_outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(reportData.vat_outstanding)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>

                        {/* Account Balances */}
                        <div className="mt-6 pt-4 border-t">
                            <h4 className="font-bold mb-2">Current Account Balances</h4>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>VAT Receivable (1120)</TableCell>
                                        <TableCell className="text-right">{formatCurrency(reportData.vat_receivable_balance)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>VAT Payable (2110)</TableCell>
                                        <TableCell className="text-right">{formatCurrency(reportData.vat_payable_balance)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>Tax Payable (2130)</TableCell>
                                        <TableCell className="text-right">{formatCurrency(reportData.tax_payable_balance)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
