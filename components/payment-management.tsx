"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, DollarSign, CreditCard, Banknote, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export function PaymentManagement() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredPayments, setFilteredPayments] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [methodFilter, setMethodFilter] = useState("all")

  useEffect(() => {
    async function fetchPayments() {
      try {
        const response = await fetch('/api/payments')
        if (!response.ok) throw new Error('Failed to fetch payments')
        const result = await response.json()
        setPayments(result.data || [])
      } catch (error) {
        console.error("Error loading payments:", error)
        setPayments([])
      } finally {
        setLoading(false)
      }
    }
    fetchPayments()
  }, [])

  useEffect(() => {
    const filtered = payments.filter((payment) => {
      const matchesSearch =
        payment.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.invoice_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.notes?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesMethod = methodFilter === "all" || payment.method === methodFilter
      return matchesSearch && matchesMethod
    })
    setFilteredPayments(filtered)
  }, [payments, searchTerm, methodFilter])

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "cash": return <Badge variant="default">Cash</Badge>
      case "check": return <Badge variant="secondary">Check</Badge>
      case "bank_transfer": return <Badge variant="outline">Bank Transfer</Badge>
      case "credit_card": return <Badge variant="destructive">Credit Card</Badge>
      case "mobile_payment": return <Badge className="bg-blue-500">Mobile</Badge>
      default: return <Badge>{method}</Badge>
    }
  }

  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const today = new Date().toISOString().split("T")[0]
  const todayPayments = payments.filter((p) => p.created_at?.startsWith(today)).reduce((sum, p) => sum + (p.amount || 0), 0)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeekPayments = payments.filter((p) => new Date(p.created_at || 0) >= weekAgo).reduce((sum, p) => sum + (p.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-4"><div className="flex items-center justify-between"><div><div className="text-2xl font-bold">{formatCurrency(totalPayments)}</div><div className="text-sm text-muted-foreground">Total Received</div></div><DollarSign className="h-8 w-8 text-green-500" /></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center justify-between"><div><div className="text-2xl font-bold">{formatCurrency(todayPayments)}</div><div className="text-sm text-muted-foreground">Today</div></div><TrendingUp className="h-8 w-8 text-blue-500" /></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center justify-between"><div><div className="text-2xl font-bold">{formatCurrency(thisWeekPayments)}</div><div className="text-sm text-muted-foreground">This Week</div></div><TrendingUp className="h-8 w-8 text-orange-500" /></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center justify-between"><div><div className="text-2xl font-bold">{payments.length}</div><div className="text-sm text-muted-foreground">Total Transactions</div></div><CreditCard className="h-8 w-8 text-muted-foreground" /></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search payments, invoices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter by method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="mobile_payment">Mobile</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center"><div className="animate-pulse space-y-4"><div className="h-4 bg-muted rounded w-3/4 mx-auto" /><div className="h-4 bg-muted rounded w-1/2 mx-auto" /></div><p className="text-muted-foreground mt-4">Loading payments...</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                  <TableHeader><TableRow><TableHead>Payment</TableHead><TableHead>Invoice</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.payment_number || payment.id?.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{payment.invoice_number || (payment.invoice_id ? payment.invoice_id.slice(0, 8) : "—")}</TableCell>
                      <TableCell className="font-medium text-green-600">{formatCurrency(payment.amount || 0)}</TableCell>
                      <TableCell><div className="flex items-center gap-2">{getMethodBadge(payment.method)}</div></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{payment.reference_number || "—"}</TableCell>
                      <TableCell className="text-sm">{payment.date ? new Date(payment.date).toLocaleDateString() : payment.created_at ? new Date(payment.created_at).toLocaleDateString() : "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
