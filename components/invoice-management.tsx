"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, FileText, DollarSign, Clock, CheckCircle, Eye } from "lucide-react"
import { InvoiceDetails } from "./invoice-details"
import { CreateInvoiceDialog } from "./create-invoice-dialog"
import { RecordPaymentDialog } from "./record-payment-dialog"
import { formatCurrency } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

export function InvoiceManagement() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredInvoices, setFilteredInvoices] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)

  // Pagination states
  const [cursors, setCursors] = useState<string[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const q = params.get("id") || params.get("search")
      if (q) {
        setSearchTerm(q)
      }
    }
  }, [])

  useEffect(() => {
    async function fetchInvoices() {
      try {
        setLoading(true)
        const cursorParam = currentCursor ? `&cursor=${currentCursor}` : ""
        const response = await fetch(`/api/invoices?limit=50${cursorParam}`)
        if (!response.ok) {
          throw new Error('Failed to fetch invoices')
        }
        const result = await response.json()
        setInvoices(result.data || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } catch (error) {
        console.error("Error loading invoices:", error)
        setInvoices([])
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()

    const channel = supabase
      .channel("invoice-management-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => fetchInvoices()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentCursor])

  useEffect(() => {
    let filtered = invoices

    if (searchTerm) {
      filtered = filtered.filter(
        (invoice) =>
          invoice.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.sales_order_id?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((invoice) => invoice.status === statusFilter)
    }

    setFilteredInvoices(filtered)
  }, [invoices, searchTerm, statusFilter])

  const getStatusBadge = (status: string, dueDate: any) => {
    if (status === "paid") {
      return <Badge variant="default">Paid</Badge>
    } else if (status === "partial") {
      return <Badge variant="secondary">Partial</Badge>
    } else if (status === "overdue" || (status === "unpaid" && dueDate && new Date() > new Date(dueDate || new Date()))) {
      return <Badge variant="destructive">Overdue</Badge>
    } else {
      return <Badge variant="outline">Unpaid</Badge>
    }
  }

  const totalInvoiceAmount = invoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
  const paidAmount = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
  const unpaidAmount = invoices
    .filter((inv) => inv.status !== "paid")
    .reduce((sum, invoice) => sum + (invoice.total_amount || invoice.amount || 0), 0)
  const overdueCount = invoices.filter(
    (inv) => inv.status === "overdue" || (inv.status !== "paid" && inv.due_date && new Date() > new Date(inv.due_date || new Date())),
  ).length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(totalInvoiceAmount)}</div>
                <div className="text-sm text-muted-foreground">Total Invoiced</div>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(paidAmount)}</div>
                <div className="text-sm text-muted-foreground">Paid</div>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-500 dark:text-orange-400">{formatCurrency(unpaidAmount)}</div>
                <div className="text-sm text-muted-foreground">Outstanding</div>
              </div>
              <DollarSign className="h-8 w-8 text-orange-500 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</div>
                <div className="text-sm text-muted-foreground">Overdue</div>
              </div>
              <Clock className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CardTitle>Invoice Management</CardTitle>
            <CreateInvoiceDialog />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices, customers, or order IDs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-3/4 mx-auto"></div>
                <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
                <div className="h-4 bg-muted rounded w-2/3 mx-auto"></div>
              </div>
              <p className="text-muted-foreground mt-4">Loading invoices...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number || invoice.id?.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.customer_name}</div>
                      <div className="text-sm text-muted-foreground">Order: {invoice.order_number || (invoice.sales_order_id ? invoice.sales_order_id.slice(0, 8) : "—")}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{formatCurrency(invoice.total_amount || invoice.amount || 0)}</div>
                      {(invoice.tax_amount || 0) > 0.01 && (
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(invoice.amount || 0)} + {formatCurrency(invoice.tax_amount || 0)} tax
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {(() => {
                        const total = invoice.total_amount || invoice.amount || 0
                        const paid = invoice.paid_amount || 0
                        const bal = Math.max(0, total - paid)
                        return formatCurrency(bal)
                      })()}
                    </div>
                    {((invoice.paid_amount || 0) > 0) && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        Paid: {formatCurrency(invoice.paid_amount || 0)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className={new Date() > new Date(invoice.due_date || new Date()) ? "text-red-600 dark:text-red-400" : ""}>
                      {new Date(invoice.due_date || new Date()).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status, invoice.due_date)}</TableCell>
                  <TableCell>
                    {invoice.created_at
                      ? new Date(invoice.created_at || new Date()).toLocaleDateString()
                      : 'N/A'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedInvoice(invoice)} aria-label="View invoice details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Invoice Details</DialogTitle>
                          </DialogHeader>
                          {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} />}
                        </DialogContent>
                      </Dialog>

                      {invoice.status !== "paid" && (
                        <RecordPaymentDialog invoice={invoice} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t p-4">
            <div className="text-xs text-muted-foreground">
              Page {cursors.length + 1}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const prevCursor = cursors[cursors.length - 2] || null
                  setCursors(prev => prev.slice(0, -1))
                  setCurrentCursor(prevCursor)
                }}
                disabled={cursors.length === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (nextCursor) {
                    setCursors(prev => [...prev, nextCursor])
                    setCurrentCursor(nextCursor)
                  }
                }}
                disabled={!hasMore}
              >
                Next
              </Button>
            </div>
          </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
