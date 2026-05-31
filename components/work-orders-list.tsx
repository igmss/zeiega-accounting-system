"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Play, CheckCircle, Clock, Wrench, Trash } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { WorkOrderDetails } from "./work-order-details"

export function WorkOrdersList() {
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  useEffect(() => {
    async function fetchWorkOrders() {
      try {
        const response = await fetch('/api/work-orders')
        if (!response.ok) {
          throw new Error('Failed to fetch work orders')
        }
        const responseData = await response.json()
        const workOrdersData = responseData.success ? responseData.data : []
        setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
      } catch (error) {
        console.error("Error loading work orders:", error)
        toast.error("Failed to load work orders")
        setWorkOrders([])
      } finally {
        setLoading(false)
      }
    }

    fetchWorkOrders()

    const channel = supabase
      .channel("work-orders-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => fetchWorkOrders()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateData, setUpdateData] = useState({
    materials: [{ item_id: "", qty: 1, cost: 0 }],
    laborHours: 0,
    laborCost: 0,
    overheadCost: 0
  })
  const [inventoryItems, setInventoryItems] = useState<any[]>([])

  useEffect(() => {
    async function fetchInventory() {
      try {
        const response = await fetch('/api/inventory/items?type=raw')
        if (response.ok) {
          const res = await response.json()
          setInventoryItems(res.success ? res.data : [])
        }
      } catch (error) {
        console.error("Failed to load inventory items:", error)
      }
    }
    fetchInventory()
  }, [])

  useEffect(() => {
    if (selectedWorkOrder) {
      setUpdateData({
        materials: selectedWorkOrder.raw_materials_used && selectedWorkOrder.raw_materials_used.length > 0
          ? selectedWorkOrder.raw_materials_used.map((m: any) => ({
              item_id: m.item_id || "",
              qty: m.qty || 0,
              cost: m.cost || 0
            }))
          : [{ item_id: "", qty: 1, cost: 0 }],
        laborHours: selectedWorkOrder.labor_hours || 0,
        laborCost: selectedWorkOrder.labor_cost || 0,
        overheadCost: selectedWorkOrder.overhead_cost || 0
      })
    }
  }, [selectedWorkOrder])

  const handleUpdateMaterials = async () => {
    if (!selectedWorkOrder) return

    try {
      const response = await fetch('/api/work-orders/update-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder.id,
          materials: updateData.materials,
          laborHours: updateData.laborHours,
          laborCost: updateData.laborCost,
          overheadCost: updateData.overheadCost
        })
      })

      if (response.ok) {
        const workOrdersResponse = await fetch('/api/work-orders')
        if (workOrdersResponse.ok) {
          const responseData = await workOrdersResponse.json()
          const workOrdersData = responseData.success ? responseData.data : []
          setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
        }
        setIsUpdateDialogOpen(false)
        toast.success('Materials, labor and overhead updated successfully!')
      } else {
        console.error('Failed to update materials')
        toast.error('Failed to update materials')
      }
    } catch (error) {
      console.error('Error updating materials:', error)
      toast.error('Failed to update materials')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="destructive">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case "in_progress":
        return (
          <Badge variant="secondary">
            <Wrench className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        )
      case "completed":
        return (
          <Badge variant="default">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        )
      default:
        return <Badge>{status}</Badge>
    }
  }

  const handleStartWorkOrder = async (workOrderId: string) => {
    try {
      const response = await fetch('/api/work-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: workOrderId,
          status: "in_progress",
          started_at: new Date().toISOString()
        })
      })

      if (response.ok) {
        setWorkOrders((prev) =>
          prev.map((wo) =>
            wo.id === workOrderId ? { ...wo, status: "in_progress" as const, started_at: new Date().toISOString() } : wo,
          ),
        )
      } else {
        console.error('Failed to update work order status')
        toast.error('Failed to update work order status')
      }
    } catch (error) {
      console.error('Error updating work order:', error)
      toast.error('Failed to update work order')
    }
  }

  const handleCompleteWorkOrder = async (workOrderId: string) => {
    try {
      const response = await fetch('/api/work-orders/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workOrderId: workOrderId
        })
      })

      if (response.ok) {
        const workOrder = (Array.isArray(workOrders) ? workOrders : []).find(wo => wo.id === workOrderId)
        if (workOrder && workOrder.sales_order_id) {
          const completeResponse = await fetch('/api/workflow/complete-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderId: workOrder.sales_order_id
            })
          })

          if (completeResponse.ok) {
            const result = await completeResponse.json()
            console.log('Order completed:', result)
            toast.success('Work order completed and WIP transferred to Finished Goods!')
          } else {
            console.error('Failed to complete order workflow')
            toast.warning('Work order completed but failed to trigger billing/revenue workflow')
          }
        }

        const workOrdersResponse = await fetch('/api/work-orders')
        if (workOrdersResponse.ok) {
          const responseData = await workOrdersResponse.json()
          const workOrdersData = responseData.success ? responseData.data : []
          setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to complete work order:', errorData.error)
        toast.error(`Failed to complete work order: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error completing work order:', error)
      toast.error('Failed to complete work order')
    }
  }

  const totalMaterialCost = (materials: Array<{ item_id: string; qty: number; cost: number }>) => {
    return materials.reduce((sum, material) => sum + material.qty * material.cost, 0)
  }

  const getEstimatedMaterialCost = (workOrder: any) => {
    if (workOrder.item_costs && workOrder.item_costs.length > 0) {
      return workOrder.item_costs.reduce((sum: number, item: any) => sum + (item.materialCost || 0), 0);
    }
    return workOrder.estimated_cost ? (workOrder.estimated_cost * 0.4) : 0;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{(Array.isArray(workOrders) ? workOrders : []).filter((wo) => wo.status === "pending").length}</div>
            <div className="text-sm text-muted-foreground">Pending Work Orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{(Array.isArray(workOrders) ? workOrders : []).filter((wo) => wo.status === "in_progress").length}</div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{(Array.isArray(workOrders) ? workOrders : []).filter((wo) => wo.status === "completed").length}</div>
            <div className="text-sm text-muted-foreground">Completed Today</div>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Work Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Order ID</TableHead>
                <TableHead>Sales Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Value</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Material Cost</TableHead>
                <TableHead>Labor Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Array.isArray(workOrders) ? workOrders : []).map((workOrder) => (
                <TableRow key={workOrder.id}>
                  <TableCell className="font-medium">{workOrder.id}</TableCell>
                  <TableCell>{workOrder.sales_order_id}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{workOrder.customer_name || "Unknown Customer"}</div>
                      {workOrder.customer_email && (
                        <div className="text-sm text-muted-foreground">{workOrder.customer_email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(workOrder.total_amount || 0)}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{workOrder.completionPercentage || workOrder.completion_percentage || 0}%</span>
                      </div>
                      <Progress value={workOrder.completionPercentage || workOrder.completion_percentage || 0} className="w-20" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {workOrder.raw_materials_used && workOrder.raw_materials_used.length > 0
                        ? (
                          <>
                            <span>{formatCurrency(totalMaterialCost(workOrder.raw_materials_used))}</span>
                            <span className="text-xs text-green-600 dark:text-green-400">Actual</span>
                          </>
                        )
                        : (
                          <>
                            <span>{formatCurrency(getEstimatedMaterialCost(workOrder))}</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">Estimated</span>
                          </>
                        )
                      }
                    </div>
                  </TableCell>
                  <TableCell>
                    {workOrder.labor_hours || (workOrder.labor_cost ? Math.round(workOrder.labor_cost / 50) : 0)}h
                  </TableCell>
                  <TableCell>{getStatusBadge(workOrder.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedWorkOrder(workOrder)}>
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Work Order Details</DialogTitle>
                          </DialogHeader>
                          {selectedWorkOrder && <WorkOrderDetails workOrder={selectedWorkOrder} />}
                        </DialogContent>
                      </Dialog>

                      {workOrder.status === "pending" && (
                        <Button size="sm" onClick={() => handleStartWorkOrder(workOrder.id)} aria-label="Start work order">
                          <Play className="h-4 w-4" />
                        </Button>
                      )}

                      {workOrder.status === "in_progress" && (
                        <Button size="sm" onClick={() => handleCompleteWorkOrder(workOrder.id)} aria-label="Complete work order">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}

                      {workOrder.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedWorkOrder(workOrder)
                            setIsUpdateDialogOpen(true)
                          }}
                          aria-label="Manage work order"
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Update Materials Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update Materials & Labor</DialogTitle>
          </DialogHeader>

          {selectedWorkOrder && (
            <div className="space-y-4">
              <div>
                <Label>Work Order: {selectedWorkOrder.id}</Label>
                <p className="text-sm text-muted-foreground">
                  Sales Order: {selectedWorkOrder.sales_order_id}
                </p>
              </div>

              <div>
                <Label>Materials Used</Label>
                {updateData.materials.map((material: any, index: number) => (
                  <div key={index} className="flex gap-2 mb-2 items-center">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={material.item_id}
                      onChange={(e) => {
                        const itemId = e.target.value
                        const selectedItem = inventoryItems.find(item => item.id === itemId)
                        const newMaterials = [...updateData.materials]
                        newMaterials[index].item_id = itemId
                        newMaterials[index].cost = selectedItem ? (selectedItem.cost_per_unit || selectedItem.unit_cost || 0) : 0
                        setUpdateData({ ...updateData, materials: newMaterials })
                      }}
                    >
                      <option value="">Select Material</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.sku} ({item.quantity_on_hand || item.qty_on_hand || 0} available)
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={material.qty}
                      onChange={(e) => {
                        const newMaterials = [...updateData.materials]
                        newMaterials[index].qty = Number(e.target.value)
                        setUpdateData({ ...updateData, materials: newMaterials })
                      }}
                      className="w-32"
                    />
                    <Input
                      type="number"
                      placeholder="Cost per unit"
                      value={material.cost}
                      onChange={(e) => {
                        const newMaterials = [...updateData.materials]
                        newMaterials[index].cost = Number(e.target.value)
                        setUpdateData({ ...updateData, materials: newMaterials })
                      }}
                      className="w-32"
                    />
                    {updateData.materials.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newMaterials = updateData.materials.filter((_, i) => i !== index)
                          setUpdateData({ ...updateData, materials: newMaterials })
                        }}
                      >
                        <Trash className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUpdateData({
                      ...updateData,
                      materials: [...updateData.materials, { item_id: "", qty: 1, cost: 0 }]
                    })
                  }}
                >
                  Add Material
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Labor Hours</Label>
                  <Input
                    type="number"
                    value={updateData.laborHours}
                    onChange={(e) => setUpdateData({ ...updateData, laborHours: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Labor Cost (EGP)</Label>
                  <Input
                    type="number"
                    value={updateData.laborCost}
                    onChange={(e) => setUpdateData({ ...updateData, laborCost: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Overhead Cost (EGP)</Label>
                  <Input
                    type="number"
                    value={updateData.overheadCost}
                    onChange={(e) => setUpdateData({ ...updateData, overheadCost: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsUpdateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateMaterials}>
                  Update Materials & Labor
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
