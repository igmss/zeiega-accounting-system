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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Search, Eye, CheckCircle, Archive, Trash2, Box, Plus, ChevronsUpDown, Check } from "lucide-react"
import { useState, useEffect } from "react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

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
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [designs, setDesigns] = useState<any[]>([])
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [designSearch, setDesignSearch] = useState("")
  const [designSelectOpen, setDesignSelectOpen] = useState(false)
  const [newBOM, setNewBOM] = useState({
    design_id: "",
    name: "",
    items: [{ material_id: "", material_name: "", quantity: 1, unit: "m", unit_cost: 0, waste_factor: 0 }] as Array<Omit<BOMItem, "total_cost"> & { waste_factor_str?: string }>,
    labor_hours: 0,
    labor_rate: 50,
    overhead_percentage: 15,
    notes: ""
  })
  const [creating, setCreating] = useState(false)

  const fetchBOMs = async () => {
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

  useEffect(() => {
    fetchBOMs()
  }, [statusFilter])

  const filteredDesigns = designSearch
    ? designs.filter((d: any) =>
        d.name?.toLowerCase().includes(designSearch.toLowerCase()) ||
        d.category?.toLowerCase().includes(designSearch.toLowerCase()) ||
        d.id?.toString().includes(designSearch)
      )
    : designs

  const getSelectedDesignName = () => {
    if (!newBOM.design_id) return ""
    const d = designs.find((d: any) => d.id === newBOM.design_id)
    return d?.name || ""
  }

  const filteredBOMs = boms.filter(b =>
    searchTerm === "" ||
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.design_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAction = async (id: string, action: string) => {
    try {
      const url = action === "delete" ? `/api/bom?id=${id}` : '/api/bom'
      const response = await fetch(url, {
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
          <Button onClick={async () => {
            setIsCreateOpen(true)
            if (designs.length === 0) {
              fetch("/api/designs?pageSize=1000").then(r => r.json()).then(d => setDesigns(d.data || d || [])).catch(() => {})
              fetch("/api/inventory/items?limit=1000").then(r => r.json()).then(d => setInventoryItems(d.data || d || [])).catch(() => {})
            }
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Create BOM
          </Button>
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
                                <Button variant="outline" size="sm" onClick={() => setSelectedBOM(bom)} aria-label="View BOM"><Eye className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>{bom.name} (v{bom.version})</DialogTitle></DialogHeader>
                                {selectedBOM && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div><Label className="text-xs text-muted-foreground">Design</Label><p className="font-medium">{selectedBOM.design_name}</p></div>
                                      <div><Label className="text-xs text-muted-foreground">Status</Label><div>getStatusBadge(selectedBOM.status)</div></div>
                                      <div><Label className="text-xs text-muted-foreground">Labor</Label><p>{selectedBOM.labor_hours}h @ {formatCurrency(selectedBOM.labor_rate)}/hr = {formatCurrency(selectedBOM.total_labor_cost)}</p></div>
                                      <div><Label className="text-xs text-muted-foreground">Overhead</Label><p>{selectedBOM.overhead_percentage}% = {formatCurrency(selectedBOM.total_overhead_cost)}</p></div>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground mb-2 block">Materials ({selectedBOM.items?.length || 0})</Label>
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
                                            {(selectedBOM.items || []).map((item, i) => (
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
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Materials</div><div className="font-bold">{formatCurrency(selectedBOM.total_material_cost)}</div></div>
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Labor</div><div className="font-bold">{formatCurrency(selectedBOM.total_labor_cost)}</div></div>
                                      <div className="text-center p-3 bg-muted rounded"><div className="text-sm text-muted-foreground">Total</div><div className="font-bold">{formatCurrency(selectedBOM.total_cost)}</div></div>
                                    </div>
                                    {selectedBOM.notes && <div><Label className="text-xs text-muted-foreground">Notes</Label><p className="text-sm">{selectedBOM.notes}</p></div>}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            {bom.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(bom.id, "activate")} title="Activate" aria-label="Activate BOM"><CheckCircle className="h-4 w-4" /></Button>
                            )}
                            {bom.status === "active" && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(bom.id, "archive")} title="Archive" aria-label="Archive BOM"><Archive className="h-4 w-4" /></Button>
                            )}
                            {bom.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this BOM?")) handleAction(bom.id, "delete") }} title="Delete" aria-label="Delete BOM"><Trash2 className="h-4 w-4 text-red-500" /></Button>
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

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New BOM</DialogTitle>
              <DialogDescription>Link a design and define materials, labor, and overhead.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Design</Label>
                <Popover open={designSelectOpen} onOpenChange={setDesignSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={designSelectOpen} className="w-full justify-between mt-1.5">
                      {getSelectedDesignName() || "Select a design..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Search designs by name or category..." value={designSearch} onValueChange={setDesignSearch} />
                      <CommandList>
                        <CommandEmpty>No design found.</CommandEmpty>
                        <CommandGroup>
                          {filteredDesigns.map((d: any) => (
                            <CommandItem
                              key={d.id}
                              value={d.id}
                              onSelect={() => {
                                setNewBOM({
                                  ...newBOM,
                                  design_id: d.id,
                                  name: !newBOM.name || newBOM.name === getSelectedDesignName()
                                    ? `BOM - ${d.name}`
                                    : newBOM.name
                                })
                                setDesignSelectOpen(false)
                                setDesignSearch("")
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", newBOM.design_id === d.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{d.name}</span>
                                <span className="text-xs text-muted-foreground">{d.category || "—"} · ID: {d.id?.toString().slice(0, 8)}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="bom-name">BOM Name</Label>
                <Input id="bom-name" value={newBOM.name} onChange={(e) => setNewBOM({...newBOM, name: e.target.value})} placeholder="e.g. Standard BOM v1" />
              </div>
              <div>
                <Label className="mb-2 block">Materials</Label>
                {newBOM.items.map((item, idx) => (
                  <div key={idx} className="border rounded p-3 mb-2 space-y-2">
                    <div className="flex gap-2">
                      <Select value={item.material_id} onValueChange={(v) => {
                        const inv = inventoryItems.find((i: any) => i.id === v)
                        const newItems = [...newBOM.items]
                        newItems[idx] = { ...newItems[idx], material_id: v, material_name: inv?.name || "", unit: inv?.unit || "pcs", unit_cost: inv?.cost_per_unit || 0 }
                        setNewBOM({...newBOM, items: newItems})
                      }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Pick material..." /></SelectTrigger>
                        <SelectContent>
                          {inventoryItems.map((inv: any) => (
                            <SelectItem key={inv.id} value={inv.id}>{inv.name} ({inv.sku})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" min="0.01" step="0.1" value={item.quantity} onChange={(e) => { const ni = [...newBOM.items]; ni[idx] = {...ni[idx], quantity: parseFloat(e.target.value) || 0}; setNewBOM({...newBOM, items: ni}) }} className="w-20" placeholder="Qty" />
                      <Input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => { const ni = [...newBOM.items]; ni[idx] = {...ni[idx], unit_cost: parseFloat(e.target.value) || 0}; setNewBOM({...newBOM, items: ni}) }} className="w-24" placeholder="Cost" />
                      <Input type="number" min="0" max="100" step="1" value={item.waste_factor} onChange={(e) => { const ni = [...newBOM.items]; ni[idx] = {...ni[idx], waste_factor: parseFloat(e.target.value) || 0}; setNewBOM({...newBOM, items: ni}) }} className="w-20" placeholder="Waste %" />
                      {newBOM.items.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => setNewBOM({...newBOM, items: newBOM.items.filter((_, i) => i !== idx)})} className="text-red-500 h-9 px-2">✕</Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setNewBOM({...newBOM, items: [...newBOM.items, { material_id: "", material_name: "", quantity: 1, unit: "m", unit_cost: 0, waste_factor: 0 }]})}><Plus className="h-3 w-3 mr-1" /> Add Material</Button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Labor Hours</Label><Input type="number" min="0" step="0.5" value={newBOM.labor_hours} onChange={(e) => setNewBOM({...newBOM, labor_hours: parseFloat(e.target.value) || 0})} /></div>
                <div><Label>Labor Rate (EGP/hr)</Label><Input type="number" min="0" value={newBOM.labor_rate} onChange={(e) => setNewBOM({...newBOM, labor_rate: parseFloat(e.target.value) || 0})} /></div>
                <div><Label>Overhead %</Label><Input type="number" min="0" max="100" value={newBOM.overhead_percentage} onChange={(e) => setNewBOM({...newBOM, overhead_percentage: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div><Label htmlFor="bom-notes">Notes</Label><Input id="bom-notes" value={newBOM.notes} onChange={(e) => setNewBOM({...newBOM, notes: e.target.value})} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button disabled={creating || !newBOM.design_id || !newBOM.name || newBOM.items.length === 0 || !newBOM.items[0].material_id} onClick={async () => {
                  setCreating(true)
                  try {
                    const res = await fetch('/api/bom', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        design_id: newBOM.design_id,
                        name: newBOM.name,
                        items: newBOM.items.map(i => ({ material_id: i.material_id, material_name: i.material_name, quantity: i.quantity, unit: i.unit, unit_cost: i.unit_cost, waste_factor: (i.waste_factor || 0) / 100, notes: "" })),
                        labor_hours: newBOM.labor_hours,
                        labor_rate: newBOM.labor_rate,
                        overhead_percentage: newBOM.overhead_percentage,
                        notes: newBOM.notes
                      })
                    })
                    if (res.ok) {
                      toast.success("BOM created")
                      setIsCreateOpen(false)
                      setNewBOM({ design_id: "", name: "", items: [{ material_id: "", material_name: "", quantity: 1, unit: "m", unit_cost: 0, waste_factor: 0 }], labor_hours: 0, labor_rate: 50, overhead_percentage: 15, notes: "" })
                      fetchBOMs()
                    } else {
                      const err = await res.json()
                      toast.error(err.error || "Failed to create BOM")
                    }
                  } catch {
                    toast.error("Network error")
                  } finally {
                    setCreating(false)
                  }
                }}>{creating ? "Creating..." : "Create BOM"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
