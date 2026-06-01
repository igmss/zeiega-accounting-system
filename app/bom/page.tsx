"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Eye, CheckCircle, Archive, Trash2, Box } from "lucide-react"
import { useState, useEffect } from "react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface BOMItem {
  material_id: string
  material_name: string
  quantity: number
  unit: string
  unit_cost: number
  total_cost: number
  waste_factor: number
  notes?: string
}

interface BOM {
  id: string
  design_id: string
  design_name: string
  name: string
  version: string
  items: BOMItem[]
  labor_hours: number
  labor_rate: number
  labor_cost: number
  overhead_percentage: number
  total_material_cost: number
  total_labor_cost: number
  total_overhead_cost: number
  total_cost: number
  notes?: string
  status: "draft" | "active" | "archived"
  created_at: string
}

export default function BOMPage() {
  const [boms, setBoms] = useState<BOM[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedBOM, setSelectedBOM] = useState<BOM | null>(null)

  useEffect(() => {
    async function fetchBOMs() {
      try {
        const params = new URLSearchParams()
        if (statusFilter !== "all") params.set("status", statusFilter)
        const response = await fetch(`/api/bom?${params}`)
        if (response.ok) {
          const result = await response.json()
          setBoms(result.data || [])
        }
      } catch (error) {
        console.error("Error loading BOMs:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchBOMs()
  }, [statusFilter])

  const filteredBOMs = boms.filter(b =>
    searchTerm === "" ||
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.design_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAction = async (id: string, action: string) => {
    try {
      const response = await fetch('/api/bom', {
        method: action === "delete" ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: action === "delete" ? undefined : JSON.stringify({ id, action })
      })
      if (response.ok) {
        toast.success(`BOM ${action === "activate" ? "activated" : action === "delete" ? "deleted" : "updated"}`)
        fetchBOMs()
      } else {
        const err = await response.json()
        toast.error(err.error || `Failed`)
      }
    } catch {
      toast.error("Failed")
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      draft: "secondary", active: "default", archived: "outline"
    }
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>
  }

  const activeCount = boms.filter(b => b.status === "active").length
  const draftCount = boms.filter(b => b.status === "draft").length

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6"><h1 className="text-3xl font-bold">BOM Management</h1>
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
            <h1 className="text-3xl font-bold">BOM Management</h1>
            <p className="text-muted-foreground">Bills of Materials for all designs</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total BOMs</CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{boms.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active BOMs</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{draftCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(boms.length > 0 ? boms.reduce((s, b) => s + b.total_cost, 0) / boms.length : 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>BOMs ({filteredBOMs.length})</CardTitle>
            <CardDescription>View and manage Bills of Materials</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search BOMs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Design</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBOMs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No BOMs found. Create designs with materials to populate BOMs.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBOMs.map((bom) => (
                      <TableRow key={bom.id}>
                        <TableCell className="font-medium">{bom.id?.slice(0, 8)}</TableCell>
                        <TableCell>{bom.name}</TableCell>
                        <TableCell>{bom.design_name}</TableCell>
                        <TableCell><Badge variant="outline">{(bom.items || []).length} materials</Badge></TableCell>
                        <TableCell>{formatCurrency(bom.total_cost || 0)}</TableCell>
                        <TableCell>{getStatusBadge(bom.status)}</TableCell>
                        <TableCell>{bom.created_at ? new Date(bom.created_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedBOM(bom)}><Eye className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>{bom.name} (v{bom.version})</DialogTitle></DialogHeader>
                                {selectedBOM && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div><Label className="text-xs text-muted-foreground">Design</Label><p className="font-medium">{bom.design_name}</p></div>
                                      <div><Label className="text-xs text-muted-foreground">Status</Label><div>{getStatusBadge(bom.status)}</div></div>
                                      <div><Label className="text-xs text-muted-foreground">Labor</Label><p>{bom.labor_hours}h @ {formatCurrency(bom.labor_rate)}/hr = {formatCurrency(bom.total_labor_cost)}</p></div>
                                      <div><Label className="text-xs text-muted-foreground">Overhead</Label><p>{bom.overhead_percentage}% = {formatCurrency(bom.total_overhead_cost)}</p></div>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground mb-2 block">Materials ({bom.items?.length || 0})</Label>
                                      <div className="rounded-md border">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Material</TableHead>
                                              <TableHead>Qty</TableHead>
                                              <TableHead>Unit Cost</TableHead>
                                              <TableHead>Waste</TableHead>
                                              <TableHead>Total</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {(bom.items || []).map((item, i) => (
                                              <TableRow key={i}>
                                                <TableCell>{item.material_name || item.material_id}</TableCell>
                                                <TableCell>{item.quantity} {item.unit}</TableCell>
                                                <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                                                <TableCell>{((item.waste_factor || 0) * 100).toFixed(0)}%</TableCell>
                                                <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Materials</div><div className="font-bold">{formatCurrency(bom.total_material_cost)}</div></div>
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Labor</div><div className="font-bold">{formatCurrency(bom.total_labor_cost)}</div></div>
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Total</div><div className="font-bold">{formatCurrency(bom.total_cost)}</div></div>
                                    </div>
                                    {bom.notes && <div><Label className="text-xs text-muted-foreground">Notes</Label><p className="text-sm">{bom.notes}</p></div>}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            {bom.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(bom.id, "activate")} title="Activate"><CheckCircle className="h-4 w-4" /></Button>
                            )}
                            {bom.status === "active" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(bom.id, "archive")} title="Archive"><Archive className="h-4 w-4" /></Button>
                            )}
                            {bom.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this BOM?")) handleAction(bom.id, "delete") }} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
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
