"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Search, Edit, Trash2, Mail, Phone, MapPin } from "lucide-react"
import { useState, useEffect } from "react"
import { formatCurrency } from "@/lib/utils"

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  type: "individual" | "business"
  status: "active" | "inactive"
  totalOrders: number
  totalSpent: number
  lastOrderDate: string
  createdAt: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  // Fetch customers from Firestore
  useEffect(() => {
    async function fetchCustomers() {
      try {
        const response = await fetch('/api/customers')
        if (!response.ok) {
          throw new Error('Failed to fetch customers')
        }
        const result = await response.json()
        setCustomers(result.data || [])
      } catch (error) {
        console.error("Error loading customers:", error)
        // Set empty array on error
        setCustomers([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchCustomers()
  }, [])

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer)
    setIsDialogOpen(true)
  }

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      const response = await fetch(`/api/customers?id=${customerId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setCustomers(customers.filter(c => c.id !== customerId))
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Customers</h1>
              <p className="text-muted-foreground">Manage your customer database</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Customers</h1>
            <p className="text-muted-foreground">Manage your customer database</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer ? "Edit Customer" : "Add New Customer"}
                </DialogTitle>
                <DialogDescription>
                  {editingCustomer ? "Update customer information" : "Enter customer details"}
                </DialogDescription>
              </DialogHeader>
              <CustomerForm 
                customer={editingCustomer}
                onClose={() => {
                  setIsDialogOpen(false)
                  setEditingCustomer(null)
                }}
                onSave={async (customerData) => {
                  try {
                    if (editingCustomer) {
                      // Update existing customer
                      const response = await fetch('/api/customers', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: editingCustomer.id, ...customerData })
                      })
                      if (response.ok) {
                        const updatedCustomer = await response.json()
                        setCustomers(customers.map(c => c.id === editingCustomer.id ? { ...c, ...updatedCustomer } : c))
                      }
                    } else {
                      // Create new customer
                      const response = await fetch('/api/customers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(customerData)
                      })
                      if (response.ok) {
                        const newCustomer = await response.json()
                        setCustomers([...customers, newCustomer])
                      }
                    }
                    setIsDialogOpen(false)
                    setEditingCustomer(null)
                  } catch (error) {
                    console.error('Error saving customer:', error)
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">
                {customers.filter(c => (c.status || "active") === "active").length} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Business Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {customers.filter(c => (c.type || "individual") === "business").length}
              </div>
              <p className="text-xs text-muted-foreground">
                {Math.round((customers.filter(c => (c.type || "individual") === "business").length / customers.length) * 100)}% of total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0))}
              </div>
              <p className="text-xs text-muted-foreground">
                From all customers
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(
                  customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / 
                  customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0) || 0
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Per customer
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <CardDescription>
              Search and manage your customers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Customer Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">{customer.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.type === "business" ? "default" : "secondary"}>
                          {customer.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.totalOrders || 0}</TableCell>
                      <TableCell>{formatCurrency(customer.totalSpent || 0)}</TableCell>
                      <TableCell>{customer.lastOrderDate ? formatDate(customer.lastOrderDate) : "Never"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

// Customer Form Component
function CustomerForm({ 
  customer, 
  onClose, 
  onSave 
}: { 
  customer: Customer | null
  onClose: () => void
  onSave: (data: Partial<Customer>) => void 
}) {
  const [formData, setFormData] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    type: customer?.type || "individual",
    status: customer?.status || "active",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as "individual" | "business" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as "active" | "inactive" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          {customer ? "Update" : "Create"} Customer
        </Button>
      </div>
    </form>
  )
}
