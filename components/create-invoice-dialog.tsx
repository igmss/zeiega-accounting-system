"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

export function CreateInvoiceDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const [invoiceData, setInvoiceData] = useState({
    customer_id: "",
    customer_name: "",
    sales_order_id: "",
    due_date: "",
    tax_rate: "10",
    items: [{ sku: "", description: "", qty: 1, unit_price: 0 }],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceData.customer_name && !invoiceData.customer_id) {
      toast.error("Customer name is required")
      return
    }

    setSubmitting(true)
    try {
      const subtotal = invoiceData.items.reduce((sum, item) => sum + item.qty * item.unit_price, 0)
      const taxAmount = (subtotal * Number.parseFloat(invoiceData.tax_rate)) / 100
      const total = subtotal + taxAmount

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          sales_order_id: invoiceData.sales_order_id,
          amount: subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          items: invoiceData.items.map(item => ({
            sku: item.sku,
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            total: item.qty * item.unit_price
          })),
          due_date: invoiceData.due_date && invoiceData.due_date.trim() !== "" ? new Date(invoiceData.due_date).toISOString() : undefined
        })
      })

      if (response.ok) {
        toast.success('Invoice created successfully!')
        setIsOpen(false)
        setInvoiceData({
          customer_id: "",
          customer_name: "",
          sales_order_id: "",
          due_date: "",
          tax_rate: "10",
          items: [{ sku: "", description: "", qty: 1, unit_price: 0 }],
        })
        router.refresh()
      } else {
        const errData = await response.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error("Error creating invoice:", error)
      toast.error('Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const addItem = () => {
    setInvoiceData((prev) => ({
      ...prev,
      items: [...prev.items, { sku: "", description: "", qty: 1, unit_price: 0 }],
    }))
  }

  const removeItem = (index: number) => {
    setInvoiceData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const updateItem = (index: number, field: string, value: any) => {
    setInvoiceData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))
  }

  const subtotal = invoiceData.items.reduce((sum, item) => sum + item.qty * item.unit_price, 0)
  const taxAmount = (subtotal * Number.parseFloat(invoiceData.tax_rate)) / 100
  const total = subtotal + taxAmount

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create New Invoice</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={invoiceData.customer_name}
                onChange={(e) => setInvoiceData((prev) => ({ ...prev, customer_name: e.target.value }))}
                placeholder="Customer name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sales_order">Sales Order</Label>
              <Input
                id="sales_order"
                value={invoiceData.sales_order_id}
                onChange={(e) => setInvoiceData((prev) => ({ ...prev, sales_order_id: e.target.value }))}
                placeholder="SO-2025-XXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date *</Label>
              <Input
                id="due_date"
                type="date"
                value={invoiceData.due_date}
                onChange={(e) => setInvoiceData((prev) => ({ ...prev, due_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-4 overflow-x-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Invoice Items</h3>
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceData.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={item.sku}
                        onChange={(e) => updateItem(index, "sku", e.target.value)}
                        placeholder="SKU"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        placeholder="Description"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, "qty", Number.parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, "unit_price", Number.parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>{formatCurrency(item.qty * item.unit_price)}</TableCell>
                    <TableCell>
                      {invoiceData.items.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-2">
               <div className="flex justify-between">
                 <span>Subtotal:</span>
                 <span>{formatCurrency(subtotal)}</span>
               </div>
              <div className="flex justify-between items-center">
                <span>Tax:</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={invoiceData.tax_rate}
                    onChange={(e) => setInvoiceData((prev) => ({ ...prev, tax_rate: e.target.value }))}
                    className="w-16"
                  />
                  <span>%</span>
                   <span>{formatCurrency(taxAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                 <span>Total:</span>
                 <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Invoice</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
