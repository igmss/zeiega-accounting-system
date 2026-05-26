"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Search, Package, TrendingDown, TrendingUp, AlertTriangle, History } from "lucide-react"
import { InventoryMovements } from "./inventory-movements"
import { AddInventoryDialog } from "./add-inventory-dialog"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface InventoryItem {
  id: string
  sku: string
  name: string
  type: string
  unit?: string
  quantity_on_hand?: number
  cost_per_unit?: number
  reorder_level?: number
  supplier?: string
  location?: string
  description?: string
  createdAt?: Date
  updatedAt?: Date
}

export function InventoryManagement() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch inventory items from Firestore
  useEffect(() => {
    async function fetchInventoryItems() {
      try {
        const response = await fetch('/api/inventory')
        if (!response.ok) {
          throw new Error('Failed to fetch inventory items')
        }
        const inventoryData = await response.json()
        setItems(inventoryData)
      } catch (error) {
        console.error("Error loading inventory items:", error)
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchInventoryItems()
  }, [refreshKey])

  useEffect(() => {
    let filtered = items

    if (searchTerm) {
      filtered = filtered.filter(
        (item) =>
          item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.supplier || '').toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((item) => item.type === typeFilter)
    }

    setFilteredItems(filtered)
  }, [items, searchTerm, typeFilter])

  const getStockStatus = (item: InventoryItem) => {
    const quantity = item.quantity_on_hand || 0
    const reorderLevel = item.reorder_level || 0
    
    if (quantity <= 0) {
      return { status: "out-of-stock", label: "Out of Stock", variant: "destructive" as const }
    } else if (quantity <= reorderLevel) {
      return { status: "low-stock", label: "Low Stock", variant: "secondary" as const }
    } else {
      return { status: "in-stock", label: "In Stock", variant: "default" as const }
    }
  }

  const totalInventoryValue = items.reduce((sum, item) => {
    const quantity = item.quantity_on_hand || 0
    const cost = item.cost_per_unit || 0
    return sum + (quantity * cost)
  }, 0)
  const lowStockItems = items.filter((item) => (item.quantity_on_hand || 0) <= (item.reorder_level || 0))
  const outOfStockItems = items.filter((item) => (item.quantity_on_hand || 0) <= 0)

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item)
  }

  const handleDeleteItem = async (itemId: string) => {
    if (confirm('Are you sure you want to delete this inventory item?')) {
      try {
        const response = await fetch(`/api/inventory?id=${itemId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete inventory item')
        }

        setRefreshKey(prev => prev + 1)
      } catch (error) {
        console.error("Error deleting inventory item:", error)
        toast.error("Failed to delete inventory item")
      }
    }
  }

  const handleAdjustItem = (item: InventoryItem) => {
    setAdjustingItem(item)
  }


  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{items.length}</div>
                <div className="text-sm text-muted-foreground">Total Items</div>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</div>
                <div className="text-sm text-muted-foreground">Total Value</div>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-500 dark:text-orange-400">{lowStockItems.length}</div>
                <div className="text-sm text-muted-foreground">Low Stock</div>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-500 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStockItems.length}</div>
                <div className="text-sm text-muted-foreground">Out of Stock</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventory Items</TabsTrigger>
          <TabsTrigger value="movements">Inventory Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          {/* Filters and Actions */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <CardTitle>Inventory Items</CardTitle>
                <div className="flex gap-2">
                  <AddInventoryDialog />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items, SKUs, or suppliers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="raw">Raw Materials</SelectItem>
                    <SelectItem value="finished">Finished Goods</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const stockStatus = getStockStatus(item)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.id}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-muted-foreground">{item.location}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.type === "raw" ? "outline" : "secondary"}>
                            {item.type === "raw" ? "Raw Material" : "Finished Good"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.quantity_on_hand}</div>
                            <div className="text-xs text-muted-foreground">Reorder: {item.reorder_level}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.unit || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(item.cost_per_unit || 0)}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency((item.quantity_on_hand || 0) * (item.cost_per_unit || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                                  View Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Inventory Item Details</DialogTitle>
                                </DialogHeader>
                                {selectedItem && <InventoryItemDetails item={selectedItem} />}
                              </DialogContent>
                            </Dialog>
                            
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleEditItem(item)}
                            >
                              Edit
                            </Button>
                            
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              onClick={() => handleAdjustItem(item)}
                            >
                              Adjust
                            </Button>
                            
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <InventoryMovements />
        </TabsContent>
      </Tabs>
      
      {/* Edit Inventory Dialog */}
      {editingItem && (
        <EditInventoryDialog 
          item={editingItem} 
          onClose={() => setEditingItem(null)}
          onSave={() => {
            setEditingItem(null)
            setRefreshKey(prev => prev + 1)
          }}
        />
      )}
      
      {/* Adjust Inventory Dialog */}
      {adjustingItem && (
        <AdjustInventoryDialog 
          item={adjustingItem} 
          onClose={() => setAdjustingItem(null)}
          onSave={() => {
            setAdjustingItem(null)
            setRefreshKey(prev => prev + 1)
          }}
        />
      )}
    </div>
  )
}

function InventoryItemDetails({ item }: { item: InventoryItem }) {
  const [adjustmentQty, setAdjustmentQty] = useState("")
  const [adjustmentReason, setAdjustmentReason] = useState("")

  const quantity = item.quantity_on_hand || 0
  const reorderLevel = item.reorder_level || 0
  
  const stockStatus =
    quantity <= 0
      ? { status: "out-of-stock", label: "Out of Stock", variant: "destructive" as const }
      : quantity <= reorderLevel
        ? { status: "low-stock", label: "Low Stock", variant: "secondary" as const }
        : { status: "in-stock", label: "In Stock", variant: "default" as const }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Item Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">SKU:</span>
              <span className="font-medium">{item.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{item.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant={item.type === "raw" ? "outline" : "secondary"}>
                {item.type === "raw" ? "Raw Material" : "Finished Good"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supplier:</span>
              <span className="font-medium">{item.supplier || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Location:</span>
              <span className="font-medium">{item.location || 'N/A'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stock Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Stock:</span>
              <span className="font-medium">{item.quantity_on_hand || 0} {item.unit || ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reorder Level:</span>
              <span className="font-medium">{item.reorder_level || 0} {item.unit || ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Cost:</span>
              <span className="font-medium">{formatCurrency(item.cost_per_unit || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Value:</span>
              <span className="font-medium">{formatCurrency((item.quantity_on_hand || 0) * (item.cost_per_unit || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stock Adjustment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adjustment-qty">Adjustment Quantity</Label>
              <Input
                id="adjustment-qty"
                type="number"
                placeholder="Enter +/- quantity"
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-reason">Reason</Label>
              <Select value={adjustmentReason} onValueChange={setAdjustmentReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged Goods</SelectItem>
                  <SelectItem value="found">Stock Found</SelectItem>
                  <SelectItem value="lost">Stock Lost</SelectItem>
                  <SelectItem value="correction">Count Correction</SelectItem>
                  <SelectItem value="return">Customer Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full">
            <History className="h-4 w-4 mr-2" />
            Record Adjustment
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function EditInventoryDialog({ item, onClose, onSave }: { 
  item: InventoryItem, 
  onClose: () => void, 
  onSave: () => void 
}) {
  const [formData, setFormData] = useState({
    sku: item.sku || "",
    name: item.name || "",
    type: item.type || "",
    unit: item.unit || "",
    quantity_on_hand: item.quantity_on_hand?.toString() || "",
    cost_per_unit: item.cost_per_unit?.toString() || "",
    reorder_level: item.reorder_level?.toString() || "",
    supplier: item.supplier || "",
    location: item.location || "",
    description: item.description || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/inventory', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: item.id,
          ...formData,
          quantity_on_hand: parseFloat(formData.quantity_on_hand),
          cost_per_unit: parseFloat(formData.cost_per_unit),
          reorder_level: parseFloat(formData.reorder_level),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update inventory item')
      }

      onSave()
    } catch (error) {
      console.error("Error updating inventory item:", error)
      toast.error("Failed to update inventory item")
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Inventory Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input
                id="sku"
                value={formData.sku}
                onChange={(e) => handleInputChange("sku", e.target.value)}
                placeholder="e.g., FABRIC-COTTON-001"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Item Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="e.g., Cotton Fabric Blue"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw">Raw Material</SelectItem>
                  <SelectItem value="finished">Finished Good</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Select value={formData.unit} onValueChange={(value) => handleInputChange("unit", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">KG (Kilogram)</SelectItem>
                  <SelectItem value="meter">Meter</SelectItem>
                  <SelectItem value="piece">Piece</SelectItem>
                  <SelectItem value="spool">Spool / Cone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity_on_hand">Current Quantity *</Label>
              <Input
                id="quantity_on_hand"
                type="number"
                min="0"
                value={formData.quantity_on_hand}
                onChange={(e) => handleInputChange("quantity_on_hand", e.target.value)}
                placeholder="0"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_per_unit">Cost per Unit (EGP) *</Label>
              <Input
                id="cost_per_unit"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_per_unit}
                onChange={(e) => handleInputChange("cost_per_unit", e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorder_level">Reorder Level *</Label>
              <Input
                id="reorder_level"
                type="number"
                min="0"
                value={formData.reorder_level}
                onChange={(e) => handleInputChange("reorder_level", e.target.value)}
                placeholder="0"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => handleInputChange("supplier", e.target.value)}
                placeholder="e.g., Textile Supplier Co"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Storage Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange("location", e.target.value)}
                placeholder="e.g., Warehouse Section A"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange("description", e.target.value)}
              placeholder="Additional item details..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdjustInventoryDialog({ item, onClose, onSave }: { 
  item: InventoryItem, 
  onClose: () => void, 
  onSave: () => void 
}) {
  const [formData, setFormData] = useState({
    adjustmentType: 'set',
    adjustmentQty: item.quantity_on_hand?.toString() || '0',
    reason: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemId: item.id,
          adjustmentQty: parseFloat(formData.adjustmentQty),
          reason: formData.reason,
          adjustmentType: formData.adjustmentType
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to adjust inventory')
      }

      onSave()
    } catch (error) {
      console.error("Error adjusting inventory:", error)
      toast.error("Failed to adjust inventory")
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Inventory - {item.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current Quantity</Label>
            <div className="p-2 bg-muted rounded-md">
              {item.quantity_on_hand || 0} {item.unit || ''}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustmentType">Adjustment Type *</Label>
            <Select value={formData.adjustmentType} onValueChange={(value) => handleInputChange("adjustmentType", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select adjustment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Set to Quantity</SelectItem>
                <SelectItem value="add">Add Quantity</SelectItem>
                <SelectItem value="subtract">Subtract Quantity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustmentQty">
              {formData.adjustmentType === 'set' ? 'New Quantity' : 
               formData.adjustmentType === 'add' ? 'Quantity to Add' : 
               'Quantity to Subtract'} *
            </Label>
            <Input
              id="adjustmentQty"
              type="number"
              min="0"
              value={formData.adjustmentQty}
              onChange={(e) => handleInputChange("adjustmentQty", e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange("reason", e.target.value)}
              placeholder="e.g., Stock count correction, damaged goods..."
              rows={3}
              required
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Adjust Inventory</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
