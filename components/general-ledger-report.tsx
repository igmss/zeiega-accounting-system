"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Download, Search, BookOpen } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface GeneralLedgerReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function GeneralLedgerReport({ dateRange }: GeneralLedgerReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/general-ledger?from=${dateRange.from}&to=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch General Ledger report')
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

    const toggleAccount = (code: string) => {
        const newExpanded = new Set(expandedAccounts)
        if (newExpanded.has(code)) {
            newExpanded.delete(code)
        } else {
            newExpanded.add(code)
        }
        setExpandedAccounts(newExpanded)
    }

    const filteredAccounts = reportData?.accounts?.filter((account: any) =>
        (account.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (account.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    ) || []

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">General Ledger</h2>
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
                    <h2 className="text-2xl font-bold">General Ledger</h2>
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
                                <div className="text-2xl font-bold">{reportData.totalAccounts}</div>
                                <div className="text-sm text-muted-foreground">Active Accounts</div>
                            </div>
                            <BookOpen className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{reportData.totalTransactions}</div>
                                <div className="text-sm text-muted-foreground">Total Transactions</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Period</div>
                        <div className="text-lg font-medium">
                            {reportData.period.from} to {reportData.period.to}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* General Ledger */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>General Ledger</CardTitle>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search accounts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 w-64"
                            />
                        </div>
                        <Button variant="outline">
                            <Download className="h-4 w-4 mr-2" />
                            Export PDF
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="text-center">
                            <h3 className="text-lg font-bold">TEL U ASEGH</h3>
                            <p className="text-muted-foreground">
                                General Ledger for {dateRange.from} to {dateRange.to}
                            </p>
                        </div>

                        {filteredAccounts.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No accounts with transactions found
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredAccounts.map((account: any) => (
                                    <Card key={account.code} className="overflow-hidden">
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className="p-4 cursor-pointer hover:bg-muted/50 flex items-center justify-between"
                                            onClick={() => toggleAccount(account.code)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAccount(account.code); } }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{account.code}</span>
                                                <span className="font-medium">{account.name}</span>
                                                <span className="text-sm text-muted-foreground">
                                                    ({account.transactions.length} transactions)
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold">{formatCurrency(account.closingBalance)}</div>
                                                <div className="text-xs text-muted-foreground">Closing Balance</div>
                                            </div>
                                        </div>

                                        {expandedAccounts.has(account.code) && (
                                            <div className="border-t">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Date</TableHead>
                                                            <TableHead>Entry #</TableHead>
                                                            <TableHead>Description</TableHead>
                                                            <TableHead className="text-right">Debit</TableHead>
                                                            <TableHead className="text-right">Credit</TableHead>
                                                            <TableHead className="text-right">Balance</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        <TableRow className="bg-muted/30">
                                                            <TableCell colSpan={5}>Opening Balance</TableCell>
                                                            <TableCell className="text-right font-medium">
                                                                {formatCurrency(account.openingBalance)}
                                                            </TableCell>
                                                        </TableRow>
                                                        {account.transactions.map((tx: any, idx: number) => (
                                                            <TableRow key={idx}>
                                                                <TableCell>{tx.date}</TableCell>
                                                                <TableCell className="font-mono text-xs">{tx.entryId}</TableCell>
                                                                <TableCell>{tx.description || '-'}</TableCell>
                                                                <TableCell className="text-right">
                                                                    {tx.debit > 0 ? formatCurrency(tx.debit) : '-'}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {tx.credit > 0 ? formatCurrency(tx.credit) : '-'}
                                                                </TableCell>
                                                                <TableCell className="text-right font-medium">
                                                                    {formatCurrency(tx.runningBalance)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        <TableRow className="bg-muted/30 font-bold">
                                                            <TableCell colSpan={5}>Closing Balance</TableCell>
                                                            <TableCell className="text-right">
                                                                {formatCurrency(account.closingBalance)}
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
