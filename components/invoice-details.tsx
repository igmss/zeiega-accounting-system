"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DollarSign, User, FileText } from "lucide-react"
import { RecordPaymentDialog } from "./record-payment-dialog"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface InvoiceDetailsProps {
  invoice: {
    id: string
    sales_order_id: string
    customer_name: string
    customer_email: string
    amount: number
    tax_amount: number
    total_amount: number
    due_date: Date
    status: string
    created_at: Date
    paid_at?: Date
    items: Array<{
      sku: string
      description: string
      qty: number
      unit_price: number
      total: number
    }>
  }
}

export function InvoiceDetails({ invoice }: { invoice: any }) {
  const getStatusBadge = (status: string, dueDate: Date) => {
    if (status === "paid") {
      return <Badge variant="default">Paid</Badge>
    } else if (status === "partial") {
      return <Badge variant="secondary">Partial</Badge>
    } else if (status === "overdue" || (status === "unpaid" && new Date() > dueDate)) {
      return <Badge variant="destructive">Overdue</Badge>
    } else {
      return <Badge variant="outline">Unpaid</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Invoice Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice ID:</span>
              <span className="font-medium">{invoice.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sales Order:</span>
              <span className="font-medium">{invoice.sales_order_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              {getStatusBadge(invoice.status, invoice.due_date)}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-medium">
                {invoice.created_at
                  ? new Date(invoice.created_at).toLocaleDateString()
                  : 'N/A'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date:</span>
              <span className={`font-medium ${new Date() > new Date(invoice.due_date || new Date()) ? "text-red-600" : ""}`}>
                {new Date(invoice.due_date || new Date()).toLocaleDateString()}
              </span>
            </div>
            {invoice.paid_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid Date:</span>
                <span className="font-medium text-green-600">
                    {invoice.paid_at
                      ? new Date(invoice.paid_at).toLocaleDateString()
                      : 'N/A'
                    }
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{invoice.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{invoice.customer_email}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.items || []).map((item: any, index: number) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.sku}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.qty}</TableCell>
                  <TableCell>{formatCurrency(item.unit_price || 0)}</TableCell>
                  <TableCell>{formatCurrency(item.total || (item.qty * (item.unit_price || 0)))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax (10%):</span>
              <span>{formatCurrency(invoice.tax_amount || 0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span>{formatCurrency(invoice.total_amount || invoice.amount || 0)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Actions */}
      {invoice.status !== "paid" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <RecordPaymentDialog invoice={invoice} />
              <Button variant="outline" onClick={() => toast.info("Reminder sent to " + (invoice.customer_email || invoice.customer_name || "customer"))}>Send Reminder</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
