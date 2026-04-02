"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table"
import { Download, CheckCircle2, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface TrialBalanceReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function TrialBalanceReport({ dateRange }: TrialBalanceReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/trial-balance?asOf=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch Trial Balance report')
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
    }, [dateRange.to])

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Trial Balance</h2>
                    <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
                </div>
                <div className="animate-pulse bg-muted h-96 rounded"></div>
            </div>
        )
    }

    if (error || !reportData) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Trial Balance</h2>
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
                                <div className="text-2xl font-bold">{formatCurrency(reportData.totalDebits)}</div>
                                <div className="text-sm text-muted-foreground">Total Debits</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.totalCredits)}</div>
                                <div className="text-sm text-muted-foreground">Total Credits</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className={`text-2xl font-bold ${reportData.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                                    {reportData.isBalanced ? 'Balanced' : 'Unbalanced'}
                                </div>
                                <div className="text-sm text-muted-foreground">Status</div>
                            </div>
                            {reportData.isBalanced ? (
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                            ) : (
                                <AlertCircle className="h-8 w-8 text-red-500" />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Trial Balance Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Trial Balance</CardTitle>
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
                                Trial Balance as of {reportData.asOfDate}
                            </p>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account Code</TableHead>
                                    <TableHead>Account Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.accounts?.map((account: any, index: number) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-mono">{account.code}</TableCell>
                                        <TableCell>{account.name}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{account.type}</TableCell>
                                        <TableCell className="text-right">
                                            {account.debit > 0 ? formatCurrency(account.debit) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {account.credit > 0 ? formatCurrency(account.credit) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="border-t-4 border-double font-bold">
                                    <TableCell colSpan={3}>TOTAL</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.totalDebits)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.totalCredits)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
