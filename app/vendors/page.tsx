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
import { Search, Plus, Mail, Phone, Edit, Trash2 } from "lucide-react"
import { useState, useEffect } from "react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface Vendor {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  payment_terms?: string
  lead_time_days?: number
  notes?: string
  status: "active" | "inactive"
  total_orders?: number
  total_amount?: number
  created_at: string
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)

  useEffect(() => {
    fetchVendors()
  }, [])

  async function fetchVendors() {
    try {
      const response = await fetch('/api/vendors')
      if (response.ok) {
        const result = await response.json()
        setVendors(result.data || [])
      }
    } catch (error) {
      console.error("Error loading vendors:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredVendors = vendors.filter(v =>
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setIsDialogOpen(true)
  }

  const handleDelete = async (vendorId: string) => {
    if (!confirm("Deactivate this vendor?")) return
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, { method: 'DELETE' })
      if (response.ok) {
        setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, status: "inactive" as const } : v))
        toast.success("Vendor deactivated")
      } else {
        toast.error("Failed to deactivate vendor")
      }
    } catch (error) {
      toast.error("Failed to deactivate vendor")
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Vendors</h1>
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
            <h1 className="text-3xl font-bold">Vendors</h1>
            <p className="text-muted-foreground">Manage supplier relationships</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingVendor(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingVendor(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
                <DialogDescription>
                  {editingVendor ? "Update vendor information" : "Enter vendor details"}
                </DialogDescription>
              </DialogHeader>
              <VendorForm
                vendor={editingVendor}
                onClose={() => { setIsDialogOpen(false); setEditingVendor(null) }}
                onSave={async (data) => {
                  try {
                    if (editingVendor) {
                      const response = await fetch(`/api/vendors/${editingVendor.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                      })
                      if (response.ok) {
                        setVendors(prev => prev.map(v => v.id === editingVendor.id ? { ...v, ...data } : v))
                        toast.success("Vendor updated")
                      } else {
                        toast.error("Failed to update vendor")
                      }
                    } else {
                      const response = await fetch('/api/vendors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                      })
                      if (response.ok) {
                        toast.success("Vendor created")
                        fetchVendors()
                      } else {
                        toast.error("Failed to create vendor")
                      }
                    }
                    setIsDialogOpen(false)
                    setEditingVendor(null)
                  } catch (error) {
                    toast.error("Failed to save vendor")
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vendors.length}</div>
              <p className="text-xs text-muted-foreground">
                {vendors.filter(v => v.status === "active").length} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {vendors.filter(v => v.status === "inactive").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {vendors.reduce((sum, v) => sum + (v.total_orders || 0), 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(vendors.reduce((sum, v) => sum + (v.total_amount || 0), 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vendor List</CardTitle>
            <CardDescription>Search and manage your vendors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No vendors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">
                          <div>{vendor.name}</div>
                          {vendor.contact_name && <div className="text-xs text-muted-foreground">{vendor.contact_name}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {vendor.email && (
                              <span className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" /> {vendor.email}
                              </span>
                            )}
                            {vendor.phone && (
                              <span className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" /> {vendor.phone}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{vendor.payment_terms || "—"}</TableCell>
                        <TableCell>{vendor.total_orders || 0}</TableCell>
                        <TableCell>{formatCurrency(vendor.total_amount || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={vendor.status === "active" ? "default" : "secondary"}>
                            {vendor.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(vendor)} aria-label="Edit vendor">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDelete(vendor.id)} aria-label="Delete vendor">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

function VendorForm({
  vendor,
  onClose,
  onSave
}: {
  vendor: Vendor | null
  onClose: () => void
  onSave: (data: Partial<Vendor>) => void
}) {
  const [formData, setFormData] = useState({
    name: vendor?.name || "",
    contact_name: vendor?.contact_name || "",
    email: vendor?.email || "",
    phone: vendor?.phone || "",
    address: vendor?.address || "",
    payment_terms: vendor?.payment_terms || "",
    lead_time_days: vendor?.lead_time_days || 0,
    notes: vendor?.notes || "",
    status: vendor?.status || "active",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_name">Contact Person</Label>
          <Input id="contact_name" value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="payment_terms">Payment Terms</Label>
          <Input id="payment_terms" value={formData.payment_terms} onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })} placeholder="Net 30" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead_time_days">Lead Time (days)</Label>
          <Input id="lead_time_days" type="number" value={formData.lead_time_days} onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as "active" | "inactive" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{vendor ? "Update" : "Create"} Vendor</Button>
      </div>
    </form>
  )
}
