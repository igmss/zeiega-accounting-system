"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Plus, Mail, Phone } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
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
    fetchVendors()
  }, [])

  const filteredVendors = vendors.filter(v =>
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Vendors</h1>
          <div className="animate-pulse h-32 bg-muted rounded" />
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
          <Button onClick={() => toast.info("Vendor creation form coming soon")}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
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
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No vendors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>{vendor.contact_name || "—"}</TableCell>
                        <TableCell>
                          {vendor.email && (
                            <span className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" /> {vendor.email}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {vendor.phone && (
                            <span className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" /> {vendor.phone}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={vendor.status === "active" ? "default" : "secondary"}>
                            {vendor.status || "active"}
                          </Badge>
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
