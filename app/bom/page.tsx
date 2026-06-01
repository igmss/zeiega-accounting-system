"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Eye } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"

export default function BOMPage() {
  const [bomEntries, setBomEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    async function fetchBOM() {
      try {
        const response = await fetch('/api/bom')
        if (response.ok) {
          const result = await response.json()
          setBomEntries(result.data || [])
        }
      } catch (error) {
        console.error("Error loading BOM:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchBOM()
  }, [])

  const filteredBOM = bomEntries.filter(b =>
    b.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.design_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">BOM Management</h1>
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
            <h1 className="text-3xl font-bold">BOM Management</h1>
            <p className="text-muted-foreground">Bills of Materials for all designs</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bill of Materials</CardTitle>
            <CardDescription>View and manage material requirements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search BOM entries..."
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
                    <TableHead>BOM ID</TableHead>
                    <TableHead>Design</TableHead>
                    <TableHead>Materials Count</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBOM.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No BOM entries found. Create designs with materials to populate BOM.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBOM.map((bom) => (
                      <TableRow key={bom.id}>
                        <TableCell className="font-medium">{bom.id}</TableCell>
                        <TableCell>{bom.design_name || bom.design_id || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{(bom.materials || []).length} materials</Badge>
                        </TableCell>
                        <TableCell>{bom.created_at ? new Date(bom.created_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => toast.info("BOM details coming soon")}>
                            <Eye className="h-4 w-4" />
                          </Button>
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
