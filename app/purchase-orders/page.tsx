"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Eye, Send, CheckCircle, XCircle, Truck, ChevronsUpDown, Check, DollarSign, Edit } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState, useEffect } from "react"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ReceiveGoodsDialog } from "@/components/receive-goods-dialog"
import { PayVendorDialog } from "@/components/pay-vendor-dialog"

interface POItem {
  material_id: string
  material_name: string
  item_type: "inventory_raw" | "inventory_accessory" | "equipment" | "supplies"
  quantity: number
  unit: string
  unit_cost: number
  total_cost: number
  asset_account?: string
  supplies_account?: string
  received_quantity?: number
}

interface PurchaseOrder {
  id: string
  po_number?: string
  vendor_id: string
  vendor_name: string
  items: POItem[]
  subtotal: number
  tax_amount: number
  shipping_cost: number
  total_amount: number
  paid_amount?: number
  expected_delivery?: string
  shipping_address?: string
  notes?: string
  status: "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled"
  created_at: string
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null)

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {
    try {
      const response = await fetch('/api/purchase-orders')
      if (response.ok) {
        const result = await response.json()
        setOrders(result.data || [])
      }
    } catch (error) {
      console.error("Error loading POs:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchTerm === "" ||
      order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleAction = async (id: string, action: string) => {
    if (action === "send" && !confirm("Send this purchase order to the vendor? This action cannot be undone.")) return
    if (action === "cancel" && !confirm("Cancel this purchase order? This action cannot be undone.")) return
    try {
      const response = await fetch('/api/purchase-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      })
      if (response.ok) {
        toast.success(`PO ${action} successful`)
        fetchOrders()
      } else {
        const err = await response.json()
        toast.error(err.error || `Failed to ${action} PO`)
      }
    } catch {
      toast.error(`Failed to ${action} PO`)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      sent: "outline",
      confirmed: "default",
      partial: "default",
      received: "default",
      cancelled: "destructive",
    }
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6"><h1 className="text-3xl font-bold">Purchase Orders</h1>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><div className="animate-pulse"><div className="h-4 bg-muted rounded w-3/4 mb-2" /><div className="h-8 bg-muted rounded w-1/2" /></div></CardContent></Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Purchase Orders</h1>
            <p className="text-muted-foreground">Manage supplier purchase orders</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setEditingPO(null); }}>
            <Button onClick={() => { setEditingPO(null); setIsCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />New PO</Button>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPO ? "Edit Purchase Order" : "Create Purchase Order"}</DialogTitle>
                <DialogDescription>{editingPO ? "Modify draft purchase order details" : "Select a vendor and add line items"}</DialogDescription>
              </DialogHeader>
              <POForm
                editingPO={editingPO}
                onClose={() => { setIsCreateOpen(false); setEditingPO(null); }}
                onCreated={() => { setIsCreateOpen(false); setEditingPO(null); fetchOrders() }}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{orders.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.filter(o => ["sent", "confirmed", "partial"].includes(o.status)).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.filter(o => o.status === "received").length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total_amount, 0))}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>Search and filter purchase orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO ID</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead>VAT</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.po_number || order.id?.slice(0, 8)}</TableCell>
                        <TableCell>{order.vendor_name}</TableCell>
                        <TableCell>{(order.items || []).length} item{(order.items || []).length !== 1 ? "s" : ""}</TableCell>
                        <TableCell>{formatCurrency(order.subtotal || 0)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            {((order.tax_amount || 0) > 0) ? (
                              <span className="text-amber-600">{formatCurrency(order.tax_amount)} (14%)</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {(order.shipping_cost || 0) > 0 && (
                              <span className="text-xs text-muted-foreground">+ Ship: {formatCurrency(order.shipping_cost)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(order.total_amount || 0)}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>{order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)} aria-label="View PO details"><Eye className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>PO {order.po_number || order.id?.slice(0, 8)}</DialogTitle></DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div><Label className="text-xs text-muted-foreground">Vendor</Label><p className="font-medium">{order.vendor_name}</p></div>
                                    <div><Label className="text-xs text-muted-foreground">Status</Label><div>{getStatusBadge(order.status)}</div></div>
                                    <div><Label className="text-xs text-muted-foreground">Expected Delivery</Label><p>{order.expected_delivery || "—"}</p></div>
                                    <div><Label className="text-xs text-muted-foreground">Total</Label><p className="font-medium">{formatCurrency(order.total_amount || 0)}</p></div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-2 block">Line Items</Label>
                                    <div className="rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Material</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit Cost</TableHead>
                                            <TableHead>Total</TableHead>
                                            <TableHead>Received</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {(order.items || []).map((item, i) => (
                                            <TableRow key={i}>
                                              <TableCell>{item.material_name || item.material_id}</TableCell>
                                              <TableCell>
                                                <span className="text-xs">
                                                  {(item as any).item_type === "inventory_raw" ? "Raw Mat"
                                                   : (item as any).item_type === "inventory_accessory" ? "Accessory"
                                                   : (item as any).item_type === "equipment" ? "Equipment"
                                                   : (item as any).item_type === "supplies" ? "Supplies"
                                                   : "—"}
                                                </span>
                                              </TableCell>
                                              <TableCell>{item.quantity} {item.unit}</TableCell>
                                              <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                                              <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                                              <TableCell>{item.received_quantity || 0}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                  {order.notes && <div><Label className="text-xs text-muted-foreground">Notes</Label><p className="text-sm">{order.notes}</p></div>}
                                </div>
                              </DialogContent>
                            </Dialog>
                            {order.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => { setEditingPO(order); setIsCreateOpen(true); }} title="Edit" aria-label="Edit PO"><Edit className="h-4 w-4" /></Button>
                            )}
                            {order.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(order.id, "send")} title="Send" aria-label="Send PO"><Send className="h-4 w-4" /></Button>
                            )}
                            {order.status === "sent" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(order.id, "confirm")} title="Confirm" aria-label="Confirm PO"><CheckCircle className="h-4 w-4" /></Button>
                            )}
                            {(order.status === "draft" || order.status === "sent") && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(order.id, "cancel")} title="Cancel" aria-label="Cancel PO"><XCircle className="h-4 w-4 text-red-500" /></Button>
                            )}
                            {(order.status === "confirmed" || order.status === "partial") && (
                              <ReceiveGoodsDialog poId={order.id} items={order.items} />
                            )}
                            {order.status === "received" && (
                              <PayVendorDialog poId={order.id} vendorName={order.vendor_name} totalAmount={order.total_amount} paidAmount={order.paid_amount || 0} />
                            )}
                            {order.status === "partial" && (
                              <>
                                <ReceiveGoodsDialog poId={order.id} items={order.items} />
                                <PayVendorDialog poId={order.id} vendorName={order.vendor_name} totalAmount={order.total_amount} paidAmount={order.paid_amount || 0} />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

function POForm({ onClose, onCreated, editingPO }: { onClose: () => void; onCreated: () => void; editingPO?: any }) {
  const [vendors, setVendors] = useState<any[]>([])
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [vendorOpen, setVendorOpen] = useState(false)
  const [vendorSearch, setVendorSearch] = useState("")
  // Per-item material picker state: index → open/val pairs
  const [materialOpen, setMaterialOpen] = useState<Record<number, boolean>>({})
  const [materialSearch, setMaterialSearch] = useState<Record<number, string>>({})
  const [formData, setFormData] = useState({
    vendor_id: editingPO?.vendor_id || "",
    vendor_name: editingPO?.vendor_name || "",
    items: editingPO?.items?.map((item: any) => ({
      material_name: item.material_name || "",
      material_id: item.material_id || "",
      quantity: item.quantity || 1,
      unit: item.unit || "pcs",
      unit_cost: item.unit_cost || 0,
      item_type: item.item_type || "inventory_raw",
      asset_account: item.asset_account || ""
    })) || [{ material_name: "", material_id: "", quantity: 1, unit: "pcs", unit_cost: 0, item_type: "inventory_raw" as const, asset_account: "" }],
    expected_delivery: editingPO?.expected_delivery ? new Date(editingPO.expected_delivery).toISOString().split("T")[0] : "",
    shipping_address: editingPO?.shipping_address || "",
    shipping_cost: editingPO?.shipping_cost?.toString() || "0",
    apply_tax: editingPO ? (editingPO.tax_amount > 0) : true,
    tax_rate: editingPO ? (editingPO.subtotal > 0 ? Math.round((editingPO.tax_amount / editingPO.subtotal) * 100).toString() : "14") : "14",
    notes: editingPO?.notes || ""
  })

  useEffect(() => {
    fetch('/api/vendors').then(r => r.json()).then(d => setVendors(d.data || [])).catch(() => {})
    fetch('/api/inventory/items').then(r => r.json()).then(d => setInventoryItems(Array.isArray(d) ? d : (d.data || []))).catch(() => {})
  }, [])

  const subtotal = formData.items.reduce((sum: number, i: any) => sum + i.quantity * i.unit_cost, 0)
  const taxAmount = formData.apply_tax ? subtotal * (parseFloat(formData.tax_rate) / 100) : 0
  const shipping = parseFloat(formData.shipping_cost) || 0
  const total = subtotal + taxAmount + shipping

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.vendor_id || formData.items.length === 0) {
      toast.error("Vendor and at least one item required")
      return
    }
    try {
      const url = '/api/purchase-orders'
      const method = editingPO ? 'PUT' : 'POST'
      
      const payload: any = {
        vendor_id: formData.vendor_id,
        items: formData.items.map((i: any) => ({ 
          material_id: (i as any).material_id || (i as any).sku || i.material_name, 
          material_name: i.material_name, 
          sku: (i as any).sku,
          item_type: i.item_type, 
          asset_account: (i as any).asset_account || undefined, 
          quantity: i.quantity, 
          unit: i.unit, 
          unit_cost: i.unit_cost 
        })),
        expected_delivery: formData.expected_delivery || undefined,
        shipping_address: formData.shipping_address || undefined,
        shipping_cost: shipping || undefined,
        tax_rate: formData.apply_tax ? parseFloat(formData.tax_rate) / 100 : 0,
        notes: formData.notes || undefined
      }

      if (editingPO) {
        payload.id = editingPO.id
        payload.action = 'update'
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (response.ok) {
        toast.success(editingPO ? "Purchase order updated" : "Purchase order created")
        onCreated()
      } else {
        const err = await response.json()
        toast.error(err.error || `Failed to ${editingPO ? 'update' : 'create'} PO`)
      }
    } catch {
      toast.error(`Failed to ${editingPO ? 'update' : 'create'} PO`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Vendor *</Label>
        <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              {formData.vendor_name || "Select vendor..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0">
            <Command>
              <CommandInput placeholder="Search vendors..." value={vendorSearch} onValueChange={setVendorSearch} />
              <CommandList>
                <CommandEmpty>No vendors found.</CommandEmpty>
                <CommandGroup>
                  {vendors.filter(v => v.name?.toLowerCase().includes(vendorSearch.toLowerCase())).slice(0, 20).map(v => (
                    <CommandItem key={v.id} value={v.name} onSelect={() => {
                      setFormData({ ...formData, vendor_id: v.id, vendor_name: v.name })
                      setVendorOpen(false)
                    }}>
                      <Check className={cn("mr-2 h-4 w-4", formData.vendor_id === v.id ? "opacity-100" : "opacity-0")} />
                      <div><div className="font-medium">{v.name}</div><div className="text-xs text-muted-foreground">{v.payment_terms || ""}</div></div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2"><Label>Line Items</Label></div>
        {formData.items.map((item: any, idx: number) => (
          <div key={idx} className="border rounded-lg p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Item {idx + 1}</span>
              {formData.items.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="text-red-500 h-6"
                  onClick={() => setFormData({ ...formData, items: formData.items.filter((_: any, i: number) => i !== idx) })}>
                  Remove
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1">
                <Label className="text-xs">Type</Label>
                <Select value={(item as any).item_type || "inventory_raw"} onValueChange={(val) => {
                  const items = [...formData.items]; (items[idx] as any).item_type = val
                  setFormData({ ...formData, items })
                }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory_raw">Raw Material (1201)</SelectItem>
                    <SelectItem value="inventory_accessory">Accessories (1202)</SelectItem>
                    <SelectItem value="equipment">Equipment/Asset (130x)</SelectItem>
                    <SelectItem value="supplies">Supplies/Expense (600x)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(item as any).item_type === "equipment" && (
                <>
                <div className="flex-1">
                  <Label className="text-xs">Asset Account</Label>
                  <Select value={(item as any).asset_account || ""} onValueChange={(val) => {
                    const items = [...formData.items] as any[]; items[idx].asset_account = val
                    setFormData({ ...formData, items })
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="1304" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1301">1301 - Land</SelectItem>
                      <SelectItem value="1302">1302 - Buildings</SelectItem>
                      <SelectItem value="1304">1304 - Production Equipment</SelectItem>
                      <SelectItem value="1305">1305 - Office Equipment</SelectItem>
                      <SelectItem value="1306">1306 - Vehicles</SelectItem>
                      <SelectItem value="1307">1307 - Computers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  <Label className="text-xs">Life (Yrs)</Label>
                  <Input type="number" min="1" max="25" className="h-8 text-xs" value={(item as any).useful_life_years || 5}
                    onChange={(e) => {
                      const items = [...formData.items] as any[]; items[idx].useful_life_years = parseInt(e.target.value) || 5
                      setFormData({ ...formData, items })
                    }} />
                </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Material</Label>
                <Popover open={materialOpen[idx] || false} onOpenChange={(open) => setMaterialOpen(prev => ({ ...prev, [idx]: open }))}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-xs px-2">
                      {item.material_name || "Select or type..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search inventory or type custom name..."
                        value={materialSearch[idx] || ""}
                        onValueChange={(val) => {
                          setMaterialSearch(prev => ({ ...prev, [idx]: val }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (materialSearch[idx] || "").trim()) {
                            const items = [...formData.items] as any[]
                            items[idx].material_name = (materialSearch[idx] || "").trim()
                            items[idx].material_id = (materialSearch[idx] || "").trim()
                            setFormData({ ...formData, items })
                            setMaterialOpen(prev => ({ ...prev, [idx]: false }))
                          }
                        }}
                      />
                      <CommandList>
                        <CommandEmpty>No matches. Press Enter to use &ldquo;{materialSearch[idx] || '...'}&rdquo;</CommandEmpty>
                        <CommandGroup heading="Inventory Items">
                          {inventoryItems
                            .filter((inv: any) => !materialSearch[idx] || inv.name?.toLowerCase().includes((materialSearch[idx] || "").toLowerCase()) || inv.sku?.toLowerCase().includes((materialSearch[idx] || "").toLowerCase()))
                            .slice(0, 15)
                            .map((inv: any) => (
                              <CommandItem key={inv.id} value={inv.name} onSelect={() => {
                                const items = [...formData.items] as any[]
                                items[idx].material_id = inv.id
                                items[idx].material_name = inv.name
                                items[idx].sku = inv.sku || ''
                                items[idx].unit = inv.unit || items[idx].unit
                                items[idx].unit_cost = inv.cost_per_unit || items[idx].unit_cost
                                setFormData({ ...formData, items })
                                setMaterialOpen(prev => ({ ...prev, [idx]: false }))
                              }}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{inv.name}</span>
                                  <span className="text-xs text-muted-foreground">{inv.sku} · EGP {inv.cost_per_unit} · Stock: {inv.quantity_on_hand}</span>
                                </div>
                              </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-[10px] text-muted-foreground mt-1">Pick from inventory or type a new name + Enter</p>
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="1" value={item.quantity} onChange={(e) => {
                  const items = [...formData.items]; items[idx].quantity = parseInt(e.target.value) || 1
                  setFormData({ ...formData, items })
                }} />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={item.unit} onChange={(e) => {
                  const items = [...formData.items]; items[idx].unit = e.target.value
                  setFormData({ ...formData, items })
                }} />
              </div>
              <div>
                <Label className="text-xs">Unit Cost</Label>
                <Input type="number" min="0" value={item.unit_cost} onChange={(e) => {
                  const items = [...formData.items]; items[idx].unit_cost = parseFloat(e.target.value) || 0
                  setFormData({ ...formData, items })
                }} />
              </div>
            </div>
            <div className="text-xs text-right text-muted-foreground">Line total: {formatCurrency(item.quantity * item.unit_cost)}</div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() =>
          setFormData({ ...formData, items: [...formData.items, { material_name: "", material_id: "", quantity: 1, unit: "pcs", unit_cost: 0, item_type: "inventory_raw" as const, asset_account: "" }] })
        }>
          <Plus className="h-3 w-3 mr-1" /> Add Item
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Expected Delivery</Label>
          <Input type="date" value={formData.expected_delivery} onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })} />
        </div>
        <div>
          <Label>Shipping Address</Label>
          <Input value={formData.shipping_address} onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Shipping Cost</Label>
          <Input type="number" min="0" value={formData.shipping_cost} onChange={(e) => setFormData({ ...formData, shipping_cost: e.target.value })} />
        </div>
        <div>
          <Label>VAT Rate (%)</Label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.apply_tax}
              onChange={(e) => setFormData({ ...formData, apply_tax: e.target.checked })}
              className="h-4 w-4"
            />
            <Input
              type="number"
              min="0"
              max="100"
              disabled={!formData.apply_tax}
              value={formData.apply_tax ? formData.tax_rate : ""}
              onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div>
          <Label>VAT Amount</Label>
          <Input type="text" disabled value={formData.apply_tax ? formatCurrency(taxAmount) : "—"} />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
      </div>
      <div className="flex justify-between items-center border-t pt-3">
        <div className="text-sm space-y-1">
          <div>Subtotal: {formatCurrency(subtotal)}</div>
          {taxAmount > 0 && <div className="text-amber-600">VAT ({formData.tax_rate}%): {formatCurrency(taxAmount)}</div>}
          {shipping > 0 && <div className="text-muted-foreground">Shipping: {formatCurrency(shipping)}</div>}
        </div>
        <span className="font-medium text-lg">Total: {formatCurrency(total)}</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Create PO</Button>
      </div>
    </form>
  )
}
