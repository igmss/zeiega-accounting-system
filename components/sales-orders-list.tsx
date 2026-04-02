"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, Eye, Play, CheckCircle } from "lucide-react"
import { SalesOrderDetails } from "./sales-order-details"
import { ProcessOrdersDialog } from "./process-orders-dialog"
import { formatCurrency } from "@/lib/utils"

export function SalesOrdersList() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false)
  const [newManualOrder, setNewManualOrder] = useState({
    customer_name: "",
    customer_email: "",
    payment_method: "manual",
    items: [{
      product_name: "",
      product_id: "",
      quantity: 1,
      unit_price: 0,
      category: "",
      color: "",
      size: ""
    }],
    shipping_address: {
      city: "",
      phone: "",
      street: "",
      state: "",
      zipCode: ""
    },
    total: 0,
    notes: ""
  })

  // Fetch sales orders from Firestore
  useEffect(() => {
    async function fetchSalesOrders() {
      try {
        const response = await fetch('/api/sales-orders')
        if (!response.ok) {
          throw new Error('Failed to fetch sales orders')
        }
        const result = await response.json()
        setOrders(result.data || [])
      } catch (error) {
        console.error("Error loading sales orders:", error)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchSalesOrders()

    // Auto-refresh every 30 seconds to get new orders
    const interval = setInterval(fetchSalesOrders, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let filtered = orders

    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.website_order_id.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter)
    }

    setFilteredOrders(filtered)
  }, [orders, searchTerm, statusFilter])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="destructive">Pending</Badge>
      case "producing":
        return <Badge variant="secondary">Producing</Badge>
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "invoiced":
        return <Badge variant="outline">Invoiced</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const handleStartProduction = async (orderId: string) => {
    try {
      // Update status via API for manual orders
      const response = await fetch('/api/sales-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId,
          status: "producing"
        })
      })

      if (response.ok) {
        // Update local state
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? { ...order, status: "producing" as const } : order)),
        )
      } else {
        console.error('Failed to update order status')
      }
    } catch (error) {
      console.error('Error updating order status:', error)
    }
  }

  const handleCompleteOrder = async (orderId: string) => {
    try {
      // Call complete workflow API
      const response = await fetch('/api/workflow/complete-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Order completed:', result)
        
        // Update local state
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? { ...order, status: "completed" as const } : order)),
        )
        
        // Show success message
        alert(`Order completed! Invoice ${result.invoiceId} generated.`)
      } else {
        console.error('Failed to complete order')
        alert('Failed to complete order. Please try again.')
      }
    } catch (error) {
      console.error('Error completing order:', error)
      alert('Error completing order. Please try again.')
    }
  }

  const handleCreateManualOrder = async () => {
    try {
      // Calculate total before sending
      const calculatedTotal = newManualOrder.items[0].quantity * newManualOrder.items[0].unit_price
      const orderToCreate = {
        ...newManualOrder,
        total: calculatedTotal
      }

      const response = await fetch('/api/sales-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderToCreate)
      })

      if (!response.ok) {
        throw new Error('Failed to create manual order')
      }

      // Reset form
      setNewManualOrder({
        customer_name: "",
        customer_email: "",
        payment_method: "manual",
        items: [{
          product_name: "",
          product_id: "",
          quantity: 1,
          unit_price: 0,
          category: "",
          color: "",
          size: ""
        }],
        shipping_address: {
          city: "",
          phone: "",
          street: "",
          state: "",
          zipCode: ""
        },
        total: 0,
        notes: ""
      })
      setIsManualOrderOpen(false)

      const ordersResponse = await fetch('/api/sales-orders')
      if (ordersResponse.ok) {
        const result = await ordersResponse.json()
        setOrders(result.data || [])
      }
    } catch (error) {
      console.error('Error creating manual order:', error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CardTitle>Sales Orders Management</CardTitle>
            <div className="flex gap-2">
              <ProcessOrdersDialog />
              <Button onClick={() => setIsManualOrderOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Manual Order
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders, customers, or order IDs..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="producing">Producing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.customer_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {order.order_source === "manual" ? "Manual" : "Web"}: {order.website_order_id}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.items
                        .map((item: any) => `${item.qty}x ${item.name || item.sku}`)
                        .join(", ")
                        .slice(0, 30)}
                      {order.items.map((item: any) => `${item.qty}x ${item.name || item.sku}`).join(", ").length > 30 ? "..." : ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(order.total_amount ?? order.total ?? 0)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    {order.created_at 
                      ? ((order.created_at as any).toDate ? (order.created_at as any).toDate() : new Date(order.created_at)).toLocaleDateString()
                      : 'N/A'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Sales Order Details</DialogTitle>
                          </DialogHeader>
                          {selectedOrder && <SalesOrderDetails order={selectedOrder} />}
                        </DialogContent>
                      </Dialog>

                      {order.status === "pending" && order.order_source === "manual" && (
                        <Button size="sm" onClick={() => handleStartProduction(order.id)}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}

                      {order.status === "producing" && order.order_source === "manual" && (
                        <Button size="sm" onClick={() => handleCompleteOrder(order.id)}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual Order Dialog */}
      <Dialog open={isManualOrderOpen} onOpenChange={setIsManualOrderOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Manual Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer_name">Customer Name</Label>
                <Input
                  id="customer_name"
                  value={newManualOrder.customer_name}
                  onChange={(e) => setNewManualOrder({...newManualOrder, customer_name: e.target.value})}
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="customer_email">Customer Email</Label>
                <Input
                  id="customer_email"
                  value={newManualOrder.customer_email}
                  onChange={(e) => setNewManualOrder({...newManualOrder, customer_email: e.target.value})}
                  placeholder="Enter customer email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="product_name">Product Name</Label>
              <Input
                id="product_name"
                value={newManualOrder.items[0].product_name}
                onChange={(e) => setNewManualOrder({
                  ...newManualOrder,
                  items: [{
                    ...newManualOrder.items[0],
                    product_name: e.target.value,
                    product_id: e.target.value.toLowerCase().replace(/\s+/g, '_')
                  }]
                })}
                placeholder="Enter product name"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={newManualOrder.items[0].quantity}
                  onChange={(e) => setNewManualOrder({
                    ...newManualOrder,
                    items: [{
                      ...newManualOrder.items[0],
                      quantity: parseInt(e.target.value) || 1
                    }]
                  })}
                />
              </div>
              <div>
                <Label htmlFor="unit_price">Unit Price</Label>
                <Input
                  id="unit_price"
                  type="number"
                  value={newManualOrder.items[0].unit_price}
                  onChange={(e) => setNewManualOrder({
                    ...newManualOrder,
                    items: [{
                      ...newManualOrder.items[0],
                      unit_price: parseFloat(e.target.value) || 0
                    }]
                  })}
                />
              </div>
              <div>
                <Label htmlFor="total">Total</Label>
                <Input
                  id="total"
                  type="number"
                  value={newManualOrder.items[0].quantity * newManualOrder.items[0].unit_price}
                  readOnly
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={newManualOrder.notes}
                onChange={(e) => setNewManualOrder({...newManualOrder, notes: e.target.value})}
                placeholder="Enter order notes"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsManualOrderOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateManualOrder}>
                Create Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
