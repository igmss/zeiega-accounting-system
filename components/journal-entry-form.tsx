"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Plus, Trash2, Save, AlertCircle, CheckCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface JournalLine {
    id: string
    accountCode: string
    accountName: string
    description: string
    debit: number
    credit: number
}

interface Account {
    id: string
    code: string
    name: string
    type: string
    is_active?: boolean
}

interface JournalEntryFormProps {
    onSuccess?: () => void
    onCancel?: () => void
}

export function JournalEntryForm({ onSuccess, onCancel }: JournalEntryFormProps) {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [lines, setLines] = useState<JournalLine[]>([
        { id: "1", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
        { id: "2", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
    ])
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
    const [memo, setMemo] = useState("")
    const [reference, setReference] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await fetch("/api/chart-of-accounts")
                if (response.ok) {
                    const data = await response.json()
                    // Filter to only show active accounts
                    const allAccounts = data.accounts || []
                    setAccounts(allAccounts.filter((a: any) => a.is_active !== false))
                }
            } catch (err) {
                console.error("Error fetching accounts:", err)
            }
        }
        fetchAccounts()
    }, [])

    const totalDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01
    const difference = Math.abs(totalDebits - totalCredits)

    const addLine = () => {
        const newId = String(Date.now())
        setLines([
            ...lines,
            { id: newId, accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
        ])
    }

    const removeLine = (id: string) => {
        if (lines.length <= 2) return
        setLines(lines.filter((line) => line.id !== id))
    }

    const updateLine = (id: string, field: keyof JournalLine, value: string | number) => {
        setLines(
            lines.map((line) => {
                if (line.id !== id) return line

                // If selecting an account, also update the account name
                if (field === "accountCode") {
                    const account = accounts.find(a => a.code === value || a.id === value)
                    return {
                        ...line,
                        accountCode: String(value),
                        accountName: account?.name || ""
                    }
                }

                // If entering a debit, clear credit and vice versa
                if (field === "debit" && Number(value) > 0) {
                    return { ...line, debit: Number(value), credit: 0 }
                }
                if (field === "credit" && Number(value) > 0) {
                    return { ...line, credit: Number(value), debit: 0 }
                }

                return { ...line, [field]: value }
            })
        )
    }

    const handleSubmit = async () => {
        setError(null)
        setSuccess(false)

        // Validation
        if (!isBalanced) {
            setError("Journal entry must be balanced (Debits = Credits)")
            return
        }

        const emptyLines = lines.filter(l => !l.accountCode)
        if (emptyLines.length > 0) {
            setError("All lines must have an account selected")
            return
        }

        const zeroLines = lines.filter(l => l.debit === 0 && l.credit === 0)
        if (zeroLines.length > 0) {
            setError("All lines must have either a debit or credit amount")
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/journal-entries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: entryDate,
                    memo,
                    reference,
                    entries: lines.map(line => ({
                        account_id: line.accountCode,
                        account_name: line.accountName,
                        description: line.description,
                        debit: line.debit,
                        credit: line.credit,
                    })),
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || "Failed to create journal entry")
            }

            setSuccess(true)

            // Reset form
            setLines([
                { id: "1", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
                { id: "2", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
            ])
            setMemo("")
            setReference("")

            onSuccess?.()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create journal entry")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>New Journal Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="entry-date">Date</Label>
                        <Input
                            id="entry-date"
                            type="date"
                            value={entryDate}
                            onChange={(e) => setEntryDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reference">Reference</Label>
                        <Input
                            id="reference"
                            placeholder="Optional reference number"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="memo">Memo</Label>
                        <Input
                            id="memo"
                            placeholder="Description of the entry"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </div>
                </div>

                {/* Journal Lines */}
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[200px]">Account</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="w-[140px] text-right">Debit</TableHead>
                                <TableHead className="w-[140px] text-right">Credit</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lines.map((line, index) => (
                                <TableRow key={line.id}>
                                    <TableCell>
                                        <Select
                                            value={line.accountCode}
                                            onValueChange={(value) => updateLine(line.id, "accountCode", value)}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select account" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {accounts.map((account) => (
                                                    <SelectItem key={account.id} value={account.code || account.id}>
                                                        {account.code || account.id} - {account.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="Line description"
                                            value={line.description}
                                            onChange={(e) => updateLine(line.id, "description", e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="text-right"
                                            placeholder="0.00"
                                            value={line.debit || ""}
                                            onChange={(e) => updateLine(line.id, "debit", parseFloat(e.target.value) || 0)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="text-right"
                                            placeholder="0.00"
                                            value={line.credit || ""}
                                            onChange={(e) => updateLine(line.id, "credit", parseFloat(e.target.value) || 0)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLine(line.id)}
                                            disabled={lines.length <= 2}
                                        >
                                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Add Line Button */}
                <Button variant="outline" onClick={addLine}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line
                </Button>

                {/* Totals */}
                <div className="flex justify-end">
                    <div className="w-[300px] space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Total Debits:</span>
                            <span className="font-medium">{formatCurrency(totalDebits)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>Total Credits:</span>
                            <span className="font-medium">{formatCurrency(totalCredits)}</span>
                        </div>
                        <div className="border-t pt-2">
                            <div className="flex justify-between text-sm">
                                <span>Difference:</span>
                                <span className={`font-medium ${isBalanced ? "text-green-600" : "text-red-600"}`}>
                                    {formatCurrency(difference)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status Messages */}
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                            Journal entry created successfully!
                        </AlertDescription>
                    </Alert>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !isBalanced}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {loading ? "Saving..." : "Save Journal Entry"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
