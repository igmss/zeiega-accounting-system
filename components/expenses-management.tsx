"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Search, Filter, Receipt, Calendar, CreditCard } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { CHART_OF_ACCOUNTS, AccountType } from "@/lib/accounting/account-types"

interface Expense {
    id: string
    date: string
    description: string
    amount: number
    expenseAccount: string
    paymentAccount: string
    category?: string
}

export function ExpensesManagement() {
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    // Form state
    const [newExpense, setNewExpense] = useState({
        date: new Date().toISOString().split('T')[0],
        description: "",
        amount: "",
        expenseAccount: "",
        paymentMethod: "cash" // cash, bank, payable
    })

    // Get expense accounts from COA
    const expenseAccounts = Object.values(CHART_OF_ACCOUNTS).filter(
        acc => acc.type === AccountType.EXPENSE || acc.type === AccountType.COGS
    )

    useEffect(() => {
        fetchExpenses()
    }, [])

    async function fetchExpenses() {
        try {
            setLoading(true)
            const response = await fetch('/api/accounting/expenses')
            if (response.ok) {
                const data = await response.json()
                setExpenses(data.expenses || [])
            }
        } catch (error) {
            console.error("Failed to fetch expenses:", error)
        } finally {
            setLoading(false)
        }
    }

    async function handleAddExpense() {
        if (!newExpense.amount || !newExpense.expenseAccount) return

        try {
            const response = await fetch('/api/accounting/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newExpense,
                    amount: parseFloat(newExpense.amount)
                })
            })

            if (response.ok) {
                setIsAddDialogOpen(false)
                fetchExpenses()
                setNewExpense({
                    date: new Date().toISOString().split('T')[0],
                    description: "",
                    amount: "",
                    expenseAccount: "",
                    paymentMethod: "cash"
                })
            }
        } catch (error) {
            console.error("Failed to add expense:", error)
        }
    }

    const filteredExpenses = expenses.filter(exp =>
        exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (CHART_OF_ACCOUNTS[exp.expenseAccount]?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0)

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
                        <p className="text-xs text-muted-foreground">For filtered result</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {expenses.filter(e => {
                                const d = new Date(e.date);
                                const now = new Date();
                                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                            }).length}
                        </div>
                        <p className="text-xs text-muted-foreground">This Month</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search expenses..."
                        className="pl-8 max-w-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Add Expense
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Record New Expense</DialogTitle>
                            <DialogDescription>
                                Enter the details of the business expense. This will create a journal entry.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Date</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            className="pl-8"
                                            value={newExpense.date}
                                            onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            className="pl-7"
                                            value={newExpense.amount}
                                            onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input
                                    placeholder="e.g. Office Rent - January"
                                    value={newExpense.description}
                                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Expense Account</Label>
                                <Select
                                    value={newExpense.expenseAccount}
                                    onValueChange={(val) => setNewExpense({ ...newExpense, expenseAccount: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select account" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b mb-1">
                                            Online Sales Costs
                                        </div>
                                        {expenseAccounts.filter(acc => ["6108", "6109", "6110"].includes(acc.code)).map(acc => (
                                            <SelectItem key={acc.code} value={acc.code}>
                                                {acc.code} - {acc.name}
                                            </SelectItem>
                                        ))}
                                        
                                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b my-1">
                                            General Expenses
                                        </div>
                                        {expenseAccounts.filter(acc => !["6108", "6109", "6110"].includes(acc.code)).map(acc => (
                                            <SelectItem key={acc.code} value={acc.code}>
                                                {acc.code} - {acc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Payment Method</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    <Button
                                        type="button"
                                        variant={newExpense.paymentMethod === 'cash' ? "default" : "outline"}
                                        className="w-full"
                                        onClick={() => setNewExpense({ ...newExpense, paymentMethod: 'cash' })}
                                    >
                                        Cash
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={newExpense.paymentMethod === 'bank' ? "default" : "outline"}
                                        className="w-full"
                                        onClick={() => setNewExpense({ ...newExpense, paymentMethod: 'bank' })}
                                    >
                                        Bank
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={newExpense.paymentMethod === 'payable' ? "default" : "outline"}
                                        className="w-full"
                                        onClick={() => setNewExpense({ ...newExpense, paymentMethod: 'payable' })}
                                    >
                                        Payable
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {newExpense.paymentMethod === 'cash' && "Paid from Petty Cash (1101)"}
                                    {newExpense.paymentMethod === 'bank' && "Paid from Bank Account (1105)"}
                                    {newExpense.paymentMethod === 'payable' && "Credit / Accounts Payable (2101)"}
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleAddExpense}>Record Expense</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Expense History</CardTitle>
                    <CardDescription>All recorded expenses and their journal entries</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Category / Account</TableHead>
                                <TableHead>Payment</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading expenses...</TableCell>
                                </TableRow>
                            ) : filteredExpenses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses found</TableCell>
                                </TableRow>
                            ) : (
                                filteredExpenses.map((expense, i) => {
                                    const accountName = CHART_OF_ACCOUNTS[expense.expenseAccount]?.name || expense.expenseAccount
                                    return (
                                        <TableRow key={expense.id || i}>
                                            <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-medium">{expense.description}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{accountName}</span>
                                                    <span className="text-xs text-muted-foreground">{expense.expenseAccount}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="capitalize">{expense.paymentAccount?.replace(/_/g, " ").toLowerCase()}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(expense.amount)}</TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
