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
import { Play, CheckCircle, Clock, Wrench } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"
import { WorkOrderDetails } from "./work-order-details"

export function WorkOrdersList() {
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  // Fetch work orders from Firestore
  useEffect(() => {
    async function fetchWorkOrders() {
      try {
        const response = await fetch('/api/work-orders')
        if (!response.ok) {
          throw new Error('Failed to fetch work orders')
        }
        const responseData = await response.json()
        // Handle the API response structure: { success: true, data: workOrders, count: number }
        const workOrdersData = responseData.success ? responseData.data : []
        setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
      } catch (error) {
        console.error("Error loading work orders:", error)
        setWorkOrders([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchWorkOrders()
  }, [])
  
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateData, setUpdateData] = useState({
    materials: [{ item_id: "", qty: 1, cost: 0 }],
    laborHours: 0,
    laborCost: 0
  })

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
          laborCost: updateData.laborCost
        })
      })

      if (response.ok) {
        // Refresh work orders
        const workOrdersResponse = await fetch('/api/work-orders')
        if (workOrdersResponse.ok) {
          const responseData = await workOrdersResponse.json()
          const workOrdersData = responseData.success ? responseData.data : []
          setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
        }
        setIsUpdateDialogOpen(false)
        toast.success('Materials and labor updated successfully!')
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
      // Update work order status in database
      const response = await fetch('/api/work-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: workOrderId,
          status: "in_progress",
          started_at: new Date()
        })
      })

      if (response.ok) {
        // Update local state
        setWorkOrders((prev) =>
          prev.map((wo) =>
            wo.id === workOrderId ? { ...wo, status: "in_progress" as const, started_at: new Date() } : wo,
          ),
        )
      } else {
        console.error('Failed to update work order status')
      }
    } catch (error) {
      console.error('Error updating work order:', error)
    }
  }

  const handleCompleteWorkOrder = async (workOrderId: string) => {
    try {
      // Update work order status in database
      const response = await fetch('/api/work-orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: workOrderId,
          status: "completed",
          completionPercentage: 100,
          completed_at: new Date()
        })
      })

      if (response.ok) {
        // Get the work order to find the sales order ID
        const workOrder = (Array.isArray(workOrders) ? workOrders : []).find(wo => wo.id === workOrderId)
        if (workOrder && workOrder.sales_order_id) {
          // Trigger complete order workflow
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
            toast.success('Work order completed!')
          } else {
            console.error('Failed to complete order workflow')
            toast.warning('Work order completed but failed to complete order workflow')
          }
        }

        // Update local state
        setWorkOrders((prev) =>
          prev.map((wo) =>
            wo.id === workOrderId
              ? {
                  ...wo,
                  status: "completed" as const,
                  completionPercentage: 100,
                  completed_at: new Date(),
                }
              : wo,
          ),
        )

        // Refresh work orders to get updated data
        const workOrdersResponse = await fetch('/api/work-orders')
        if (workOrdersResponse.ok) {
          const responseData = await workOrdersResponse.json()
          const workOrdersData = responseData.success ? responseData.data : []
          setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
        }
      } else {
        console.error('Failed to update work order status')
        toast.error('Failed to complete work order')
      }
    } catch (error) {
      console.error('Error completing work order:', error)
      toast.error('Failed to complete work order')
    }
  }

  const totalMaterialCost = (materials: Array<{ item_id: string; qty: number; cost: number }>) => {
    return materials.reduce((sum, material) => sum + material.qty * material.cost, 0)
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
                            <span>{formatCurrency(workOrder.estimated_cost || 0)}</span>
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
                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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

                      {workOrder.status === "pending" && (
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
        <DialogContent className="max-w-2xl">
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
                  <div key={index} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Item ID"
                      value={material.item_id}
                      onChange={(e) => {
                        const newMaterials = [...updateData.materials]
                        newMaterials[index].item_id = e.target.value
                        setUpdateData({ ...updateData, materials: newMaterials })
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={material.qty}
                      onChange={(e) => {
                        const newMaterials = [...updateData.materials]
                        newMaterials[index].qty = Number(e.target.value)
                        setUpdateData({ ...updateData, materials: newMaterials })
                      }}
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
                    />
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

              <div className="grid grid-cols-2 gap-4">
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

