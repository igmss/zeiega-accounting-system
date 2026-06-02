"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, Eye, Play, CheckCircle, ChevronsUpDown, Check, Package, FileText, Edit } from "lucide-react"
import { SalesOrderDetails } from "./sales-order-details"
import { ProcessOrdersDialog } from "./process-orders-dialog"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { supabase } from "@/lib/supabase"

export function SalesOrdersList() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false)
  const [inFlightOrderIds, setInFlightOrderIds] = useState<Set<string>>(new Set())
  const [customers, setCustomers] = useState<any[]>([])
  const [designs, setDesigns] = useState<any[]>([])
  const [custSearchOpen, setCustSearchOpen] = useState(false)
  const [designSearchOpenByIndex, setDesignSearchOpenByIndex] = useState<boolean[]>([])
  const [custSearch, setCustSearch] = useState("")
  const [designSearch, setDesignSearch] = useState("")
  const [newManualOrder, setNewManualOrder] = useState({
    customer_name: "",
    customer_email: "",
    items: [{
      product_name: "",
      product_id: "",
      quantity: 1,
      unit_price: 0,
      cost_price: 0,
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
  const [invoices, setInvoices] = useState<any[]>([])
  const [submittingManualOrder, setSubmittingManualOrder] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  // Pagination states
  const [cursors, setCursors] = useState<string[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    async function fetchSalesOrders() {
      try {
        const cursorParam = currentCursor ? `&cursor=${currentCursor}` : ""
        const response = await fetch(`/api/sales-orders?limit=50${cursorParam}`)
        if (!response.ok) {
          throw new Error('Failed to fetch sales orders')
        }
        const result = await response.json()
        setOrders(result.data || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } catch (error) {
        console.error("Error loading sales orders:", error)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    fetchSalesOrders()
    
    async function fetchInvoices() {
      try {
        const response = await fetch('/api/invoices')
        if (response.ok) {
          const result = await response.json()
          setInvoices(result.data || [])
        }
      } catch (error) {
        console.error("Error loading invoices:", error)
      }
    }
    fetchInvoices()

    const interval = setInterval(fetchSalesOrders, 30000)
    return () => clearInterval(interval)
  }, [currentCursor])

  useEffect(() => {
    if (isManualOrderOpen) {
      fetch("/api/customers").then(r => r.json()).then(d => setCustomers(d.data || [])).catch(() => {})
      fetch("/api/designs").then(r => r.json()).then(d => setDesigns(d.data || [])).catch(() => {})
    }
  }, [isManualOrderOpen])

  useEffect(() => {
    let filtered = orders

    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.website_order_id?.toLowerCase().includes(searchTerm.toLowerCase()),
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
    setInFlightOrderIds(prev => new Set(prev).add(orderId))
    try {
      const response = await fetch('/api/sales-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId, status: "producing" })
      })

      if (response.ok) {
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? { ...order, status: "producing" as const } : order)),
        )
        toast.success("Production started — work order created")
      } else {
        toast.error("Failed to start production")
      }
    } catch (error) {
      toast.error("Network error — failed to update order status")
    } finally {
      setInFlightOrderIds(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  const handleCompleteOrder = async (orderId: string) => {
    setInFlightOrderIds(prev => new Set(prev).add(orderId))
    try {
      const response = await fetch('/api/workflow/complete-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      })

      if (response.ok) {
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? { ...order, status: "completed" as const } : order)),
        )
        toast.success('Order completed!')
      } else {
        console.error('Failed to complete order')
        toast.error('Failed to complete order')
      }
    } catch (error) {
      console.error('Error completing order:', error)
      toast.error('Failed to complete order')
    } finally {
      setInFlightOrderIds(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  const hasInvoice = (orderId: string) => {
    return invoices.some((inv: any) => inv.sales_order_id === orderId)
  }

  const handleCreateInvoiceForOrder = async (order: any) => {
    setInFlightOrderIds(prev => new Set(prev).add(order.id))
    try {
      const subtotal = order.total_amount || order.total || 0
      const VAT_RATE = 0.14
      const netAmount = subtotal / (1 + VAT_RATE)
      const taxAmount = subtotal - netAmount

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          sales_order_id: order.id,
          amount: netAmount,
          tax_amount: taxAmount,
          total_amount: subtotal,
          items: order.items?.map((item: any) => ({
            sku: item.sku || item.productId || "",
            description: item.name || item.product_name || item.sku || "",
            qty: item.qty || item.quantity || 1,
            unit_price: item.unit_price || 0,
            total: (item.qty || item.quantity || 1) * (item.unit_price || 0)
          })) || [],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success("Invoice created successfully!")
        setInvoices(prev => [...prev, result])
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "invoiced" } : o))
      } else {
        const err = await response.json().catch(() => ({}))
        toast.error(err.error || "Failed to create invoice")
      }
    } catch (err) {
      console.error("Error creating invoice for order:", err)
      toast.error("Failed to create invoice")
    } finally {
      setInFlightOrderIds(prev => {
        const next = new Set(prev)
        next.delete(order.id)
        return next
      })
    }
  }

  const handleEditOrder = async (order: any) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("manual_orders")
        .select("*")
        .eq("id", order.id)
        .single()

      const manualOrder = data as any

      if (error || !manualOrder) {
        toast.error("Failed to load order details")
        return
      }

      setNewManualOrder({
        customer_name: manualOrder.customer_name || "",
        customer_email: manualOrder.customer_email || "",
        items: manualOrder.items?.map((item: any) => ({
          product_name: item.title || item.product_name || "",
          product_id: item.sku || item.product_id || "",
          quantity: item.quantity || 1,
          unit_price: item.adjustedPrice || item.unit_price || 0,
          cost_price: item.costPrice || 0,
          category: item.category || "",
          color: item.color || "",
          size: item.size || ""
        })) || [{
          product_name: "",
          product_id: "",
          quantity: 1,
          unit_price: 0,
          cost_price: 0,
          category: "",
          color: "",
          size: ""
        }],
        shipping_address: {
          city: manualOrder.shipping_address?.city || "",
          phone: manualOrder.shipping_address?.phone || "",
          street: manualOrder.shipping_address?.street || "",
          state: manualOrder.shipping_address?.state || "",
          zipCode: manualOrder.shipping_address?.zipCode || ""
        },
        total: manualOrder.total || 0,
        notes: manualOrder.notes || ""
      })
      setEditingOrderId(order.id)
      setIsManualOrderOpen(true)
    } catch (err) {
      console.error(err)
      toast.error("Failed to load order")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateManualOrder = async () => {
    if (submittingManualOrder) return
    setSubmittingManualOrder(true)
    try {
      const calculatedTotal = newManualOrder.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      const orderToCreate = {
        ...newManualOrder,
        total: calculatedTotal
      }

      let response
      if (editingOrderId) {
        response = await fetch('/api/sales-orders', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: editingOrderId,
            action: 'update',
            ...orderToCreate
          })
        })
      } else {
        response = await fetch('/api/sales-orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderToCreate)
        })
      }

      if (!response.ok) {
        throw new Error('Failed to save manual order')
      }

      setNewManualOrder({
        customer_name: "",
        customer_email: "",
        items: [{
          product_name: "",
          product_id: "",
          quantity: 1,
          unit_price: 0,
          cost_price: 0,
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
      setEditingOrderId(null)
      setIsManualOrderOpen(false)
      toast.success(editingOrderId ? "Order updated successfully" : "Order created successfully")

      const ordersResponse = await fetch('/api/sales-orders')
      if (ordersResponse.ok) {
        const result = await ordersResponse.json()
        setOrders(result.data || [])
      }
    } catch (error) {
      console.error('Error saving manual order:', error)
      toast.error('Failed to save manual order')
    } finally {
      setSubmittingManualOrder(false)
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
              <Button onClick={() => {
                setEditingOrderId(null)
                setNewManualOrder({
                  customer_name: "",
                  customer_email: "",
                  items: [{
                    product_name: "",
                    product_id: "",
                    quantity: 1,
                    unit_price: 0,
                    cost_price: 0,
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
                setIsManualOrderOpen(true)
              }}>
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
          <div className="overflow-x-auto">
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
              {filteredOrders.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">No orders found matching your search</p>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_number || order.id?.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.customer_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {order.order_source === "manual" ? "Manual" : "Web"}: {order.order_number || order.id?.slice(0, 8)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {(order.items || []).length} item{(order.items || []).length !== 1 ? "s" : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(order.items || []).map((item: any) => `${item.qty || item.quantity}x ${item.name || item.sku}`).join(", ").slice(0, 30)}
                      {(order.items || []).map((item: any) => `${item.qty || item.quantity}x ${item.name || item.sku}`).join(", ").length > 30 ? "..." : ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(order.total_amount ?? order.total ?? 0)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    {order.created_at
                      ? new Date(order.created_at).toLocaleDateString()
                      : 'N/A'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)} aria-label="View order details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Sales Order Details</DialogTitle>
                          </DialogHeader>
                          {selectedOrder && <SalesOrderDetails order={selectedOrder} />}
                        </DialogContent>
                      </Dialog>

                      {order.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditOrder(order)}
                            aria-label="Edit sales order"
                            title="Edit Order"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleStartProduction(order.id)}
                            disabled={inFlightOrderIds.has(order.id)}
                            aria-label="Start production"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {order.status === "producing" && (
                        <Button
                          size="sm"
                          onClick={() => handleCompleteOrder(order.id)}
                          disabled={inFlightOrderIds.has(order.id)}
                          aria-label="Complete order"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}

                      {(order.status === "completed" || order.status === "invoiced") && (
                        hasInvoice(order.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/invoices?search=${order.id}`)}
                            aria-label="View Invoice"
                            title="View Invoice"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleCreateInvoiceForOrder(order)}
                            disabled={inFlightOrderIds.has(order.id)}
                            aria-label="Create Invoice"
                            title="Create Invoice"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
                </>
              )}
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
        </CardContent>
      </Card>

      {/* Manual Order Dialog */}
      <Dialog open={isManualOrderOpen} onOpenChange={(open) => { setIsManualOrderOpen(open); if (!open) setEditingOrderId(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingOrderId ? "Edit Sales Order" : "Create Manual Order"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer</Label>
                  <Popover open={custSearchOpen} onOpenChange={setCustSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {newManualOrder.customer_name || "Select customer..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0">
                      <Command>
                        <CommandInput placeholder="Search customers..." value={custSearch} onValueChange={setCustSearch} />
                        <CommandList>
                          <CommandEmpty>No customers found.</CommandEmpty>
                          <CommandGroup>
                            {customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase()) || c.email?.toLowerCase().includes(custSearch.toLowerCase())).slice(0, 20).map(c => (
                              <CommandItem key={c.id} value={c.name} onSelect={() => {
                                setNewManualOrder({ ...newManualOrder, customer_name: c.name, customer_email: c.email || "" })
                                setCustSearchOpen(false)
                              }}>
                                <Check className={cn("mr-2 h-4 w-4", newManualOrder.customer_name === c.name ? "opacity-100" : "opacity-0")} />
                                <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.email}</div></div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="customer_email">Email</Label>
                  <Input id="customer_email" value={newManualOrder.customer_email} onChange={(e) => setNewManualOrder({...newManualOrder, customer_email: e.target.value})} placeholder="Auto-filled from customer" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Order Items</Label>
                </div>
                {newManualOrder.items.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3 mb-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Item {index + 1}</Label>
                      {newManualOrder.items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newItems = newManualOrder.items.filter((_, i) => i !== index)
                            setNewManualOrder({ ...newManualOrder, items: newItems })
                          }}
                          className="text-red-500 h-6 px-2"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Design (Product)</Label>
                        <Popover open={designSearchOpenByIndex[index] || false} onOpenChange={(open) => {
                          const newOpen = [...designSearchOpenByIndex]
                          newOpen[index] = open
                          setDesignSearchOpenByIndex(newOpen)
                        }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between font-normal text-sm h-9">
                              {item.product_name || "Select design..."}
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0">
                            <Command>
                              <CommandInput placeholder="Search designs..." value={designSearch} onValueChange={setDesignSearch} />
                              <CommandList>
                                <CommandEmpty>No designs found.</CommandEmpty>
                                <CommandGroup>
                                  {designs.filter(d => d.name?.toLowerCase().includes(designSearch.toLowerCase()) || d.category?.toLowerCase().includes(designSearch.toLowerCase())).slice(0, 20).map(d => (
                                    <CommandItem key={d.id} value={d.name} onSelect={() => {
                                      const newItems = [...newManualOrder.items]
                                      newItems[index] = { ...newItems[index], product_name: d.name, product_id: d.id, cost_price: d.total_cost || d.totalCost || 0, unit_price: newItems[index].unit_price || 0, category: d.category || "" }
                                      setNewManualOrder({ ...newManualOrder, items: newItems })
                                      const newOpen = [...designSearchOpenByIndex]
                                      newOpen[index] = false
                                      setDesignSearchOpenByIndex(newOpen)
                                    }}>
                                      <Check className={cn("mr-2 h-4 w-4", item.product_id === d.id ? "opacity-100" : "opacity-0")} />
                                      <div><div className="font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.category} · Cost: EGP {d.total_cost || d.totalCost || 0}</div></div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => {
                          const newItems = [...newManualOrder.items]
                          newItems[index] = { ...newItems[index], quantity: parseInt(e.target.value) || 1 }
                          setNewManualOrder({ ...newManualOrder, items: newItems })
                        }} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Cost Price (from Design)</Label>
                        <Input type="number" value={item.cost_price} readOnly className="bg-muted h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">Sale Price (EGP)</Label>
                        <Input type="number" min="0" value={item.unit_price} onChange={(e) => {
                          const newItems = [...newManualOrder.items]
                          newItems[index] = { ...newItems[index], unit_price: parseFloat(e.target.value) || 0 }
                          setNewManualOrder({ ...newManualOrder, items: newItems })
                        }} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">Line Total</Label>
                        <Input type="number" value={item.quantity * item.unit_price} readOnly className="h-9" />
                      </div>
                    </div>
                    {item.cost_price > 0 && item.unit_price > 0 && (
                      <Badge variant={item.unit_price >= item.cost_price ? "default" : "destructive"} className="text-xs">
                        Margin: EGP {formatCurrency(item.unit_price - item.cost_price)} ({Math.round(((item.unit_price - item.cost_price) / item.unit_price) * 100) || 0}%)
                      </Badge>
                    )}
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNewManualOrder({
                      ...newManualOrder,
                      items: [...newManualOrder.items, {
                        product_name: "",
                        product_id: "",
                        quantity: 1,
                        unit_price: 0,
                        cost_price: 0,
                        category: "",
                        color: "",
                        size: ""
                      }]
                    })
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>

              <div>
                <Label className="text-sm font-medium">Order Total: {formatCurrency(newManualOrder.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0))}</Label>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={newManualOrder.notes} onChange={(e) => setNewManualOrder({...newManualOrder, notes: e.target.value})} placeholder="Enter order notes" />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsManualOrderOpen(false)} disabled={submittingManualOrder}>Cancel</Button>
                <Button onClick={handleCreateManualOrder} disabled={submittingManualOrder}>
                  {submittingManualOrder ? "Creating..." : "Create Order"}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
