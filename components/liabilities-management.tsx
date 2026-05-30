"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Search, DollarSign, TrendingUp, TrendingDown, Building2, Wallet } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { CHART_OF_ACCOUNTS, AccountType, AccountSubType } from "@/lib/accounting/account-types"

interface Liability {
    id: string
    date: string
    description: string
    amount: number
    type: string
}

export function LiabilitiesManagement() {
    const [liabilities, setLiabilities] = useState<Liability[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [coaBalances, setCoaBalances] = useState<Record<string, number>>({})

    const [newLiability, setNewLiability] = useState({
        description: "",
        amount: "",
        liabilityAccount: "",
        offsetAccount: "1103",
        transactionType: "incur"
    })

    const allLiabilityAccounts = Object.values(CHART_OF_ACCOUNTS).filter(
        acc => acc.type === AccountType.LIABILITY && acc.isActive
    )

    const liabilityAccounts = newLiability.transactionType === 'repay'
        ? allLiabilityAccounts.filter(acc => (coaBalances[acc.code] || 0) > 0)
        : allLiabilityAccounts

    useEffect(() => {
        fetchLiabilities()
        fetchBalances()
    }, [])

    async function fetchBalances() {
        try {
            const response = await fetch('/api/chart-of-accounts')
            if (response.ok) {
                const data = await response.json()
                const balances: Record<string, number> = {}
                for (const a of (data.accounts || [])) {
                    balances[a.code] = a.balance
                }
                setCoaBalances(balances)
            }
        } catch {
            console.error("Failed to fetch account balances")
        }
    }

    async function fetchLiabilities() {
        try {
            setLoading(true)
            const response = await fetch('/api/accounting/liabilities')
            if (response.ok) {
                const data = await response.json()
                setLiabilities(data.liabilities || [])
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit() {
        try {
            const response = await fetch('/api/accounting/liabilities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newLiability,
                    amount: parseFloat(newLiability.amount)
                })
            })

            if (response.ok) {
                setIsAddDialogOpen(false)
                fetchLiabilities()
                setNewLiability({
                    description: "",
                    amount: "",
                    liabilityAccount: "",
                    offsetAccount: "1103",
                    transactionType: "incur"
                })
            }
        } catch (error) {
            console.error(error)
        }
    }

    const filtered = liabilities.filter(l =>
        l.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalIncurred = liabilities
        .filter(l => l.type === 'LIABILITY_INCURED')
        .reduce((s, l) => s + (l.amount || 0), 0)
    const totalRepaid = liabilities
        .filter(l => l.type === 'LIABILITY_REPAYMENT')
        .reduce((s, l) => s + (l.amount || 0), 0)
    const netLiabilities = totalIncurred - totalRepaid

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Liabilities</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(netLiabilities)}</div>
                        <p className="text-xs text-muted-foreground">{liabilities.length} transactions</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Incurred</CardTitle>
                        <TrendingUp className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(totalIncurred)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Repaid</CardTitle>
                        <TrendingDown className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRepaid)}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search liabilities..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><Plus className="mr-2 h-4 w-4" /> Record Liability</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record Liability / Loan</DialogTitle>
                            <DialogDescription>
                                {newLiability.transactionType === 'incur'
                                    ? 'Record a new loan or payable (DR Asset / CR Liability)'
                                    : 'Record a repayment (DR Liability / CR Asset)'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Action</Label>
                                <div className="flex gap-2">
                                    <Button
                                        variant={newLiability.transactionType === 'incur' ? 'default' : 'outline'}
                                        onClick={() => setNewLiability({ ...newLiability, transactionType: 'incur' })}
                                        className="flex-1"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> New Liability
                                    </Button>
                                    <Button
                                        variant={newLiability.transactionType === 'repay' ? 'default' : 'outline'}
                                        onClick={() => setNewLiability({ ...newLiability, transactionType: 'repay' })}
                                        className="flex-1"
                                    >
                                        <DollarSign className="h-3.5 w-3.5 mr-1" /> Repay
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Liability Account</Label>
                                <Select
                                    value={newLiability.liabilityAccount}
                                    onValueChange={val => setNewLiability({ ...newLiability, liabilityAccount: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {liabilityAccounts.map(acc => (
                                            <SelectItem key={acc.code} value={acc.code}>
                                                <span className="font-mono mr-2">{acc.code}</span> {acc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Amount (EGP)</Label>
                                <Input
                                    type="number"
                                    value={newLiability.amount}
                                    onChange={e => setNewLiability({ ...newLiability, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input
                                    value={newLiability.description}
                                    onChange={e => setNewLiability({ ...newLiability, description: e.target.value })}
                                    placeholder={newLiability.transactionType === 'incur' ? "e.g. Bank Loan" : "e.g. Loan Repayment"}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{newLiability.transactionType === 'incur' ? "Received To" : "Paid From"}</Label>
                                <Select
                                    value={newLiability.offsetAccount}
                                    onValueChange={val => setNewLiability({ ...newLiability, offsetAccount: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1101">Cash on Hand (1101)</SelectItem>
                                        <SelectItem value="1103">Bank - Main (1103)</SelectItem>
                                        <SelectItem value="1105">Bank - Payroll (1105)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleSubmit}>Save Record</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Liability records and repayments</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[1,2,3].map(i => (
                                <div key={i} className="animate-pulse flex justify-between py-2">
                                    <div className="h-4 bg-muted rounded w-24"></div>
                                    <div className="h-4 bg-muted rounded w-40"></div>
                                    <div className="h-4 bg-muted rounded w-16"></div>
                                    <div className="h-4 bg-muted rounded w-24"></div>
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No liabilities recorded yet.</p>
                            <p className="text-sm">Click Record Liability to add one.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((l, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{new Date(l.date).toLocaleDateString()}</TableCell>
                                        <TableCell>{l.description}</TableCell>
                                        <TableCell>
                                            <Badge variant={l.type === 'LIABILITY_INCURED' ? 'destructive' : 'secondary'}>
                                                {l.type === 'LIABILITY_INCURED' ? 'New Liability' : 'Repayment'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatCurrency(l.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
