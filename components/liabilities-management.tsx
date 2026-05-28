"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Search, DollarSign, Calendar } from "lucide-react"
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

    const [newLiability, setNewLiability] = useState({
        description: "",
        amount: "",
        liabilityAccount: "",
        offsetAccount: "1105", // Default Bank
        transactionType: "incur" // incur or repay
    })

    // Filter COA for Liabilities
    const liabilityAccounts = Object.values(CHART_OF_ACCOUNTS).filter(
        acc => acc.type === AccountType.LIABILITY
    )

    useEffect(() => {
        fetchLiabilities()
    }, [])

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
                    offsetAccount: "1105",
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

    return (
        <div className="space-y-6">
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
                            <DialogDescription>Add a new loan or payable, or record a repayment.</DialogDescription>
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
                                        Add New Liability
                                    </Button>
                                    <Button
                                        variant={newLiability.transactionType === 'repay' ? 'default' : 'outline'}
                                        onClick={() => setNewLiability({ ...newLiability, transactionType: 'repay' })}
                                        className="flex-1"
                                    >
                                        Repay Liability
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
                                                {acc.code} - {acc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Amount</Label>
                                <Input
                                    type="number"
                                    value={newLiability.amount}
                                    onChange={e => setNewLiability({ ...newLiability, amount: e.target.value })}
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
                                        <SelectItem value="1105">Bank Account (1105)</SelectItem>
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
                </CardHeader>
                <CardContent>
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
                                    <TableCell>{l.type === 'LIABILITY_INCURED' ? 'New Liability' : 'Repayment'}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(l.amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
