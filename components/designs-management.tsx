"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Package, Search, Filter, Loader2, Upload } from "lucide-react";
import type { Design, DesignFilter, DesignStats } from "@/lib/types/designs";

export default function DesignsManagement() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [stats, setStats] = useState<DesignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DesignFilter>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bomMap, setBomMap] = useState<Record<string, any>>({});
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadDesigns();
    loadStats();
    loadCategories();
    loadBOMs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadDesigns(false), 300);
    return () => clearTimeout(timer);
  }, [filter.category, filter.subcategory, filter.status]);

  const loadBOMs = async () => {
    try {
      const res = await fetch("/api/bom?limit=1000");
      const result = await res.json();
      const boms = result.data || [];
      const map: Record<string, any> = {};
      for (const b of boms) {
        if (b.design_id) map[b.design_id] = b;
      }
      setBomMap(map);
    } catch {}
  };

  const loadDesigns = async (loadMore = false) => {
    try {
      if (loadMore) setLoadingMore(true); else setLoading(true);
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") params.append(k, String(v)); });
      if (loadMore && designs.length > 0) params.append("lastDocId", designs[designs.length - 1].id);
      params.append("pageSize", "50");
      const res = await fetch(`/api/designs?${params}`);
      const result = await res.json();
      if (result.success) {
        setDesigns(loadMore ? [...designs, ...result.data] : result.data);
        setHasMore(result.pagination?.hasMore || false);
      }
    } catch { toast.error("Failed to load designs"); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  const loadStats = async () => {
    try {
      const res = await fetch("/api/designs/stats");
      const result = await res.json();
      if (result.success) setStats(result.data);
    } catch {}
  };

  const loadCategories = async () => {
    try {
      const res = await fetch("/api/designs/categories");
      const result = await res.json();
      if (result.success) setCategories(result.data);
    } catch {}
  };

  const handleImportDesigns = async () => {
    if (isImporting) return;
    try {
      setIsImporting(true);
      const res = await fetch("/api/designs/import", { method: "POST" });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message || "Designs imported successfully");
        loadDesigns();
        loadStats();
      } else {
        toast.error(result.error || "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const filteredDesigns = designs.filter(d =>
    searchTerm === "" ||
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const v: Record<string, "default" | "secondary" | "outline"> = { active: "default", inactive: "secondary", discontinued: "outline" };
    return <Badge variant={v[status] || "outline"}>{status}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Designs</h1>
          <p className="text-muted-foreground">Product designs synced from the website</p>
        </div>
        <Button onClick={handleImportDesigns} variant="outline" disabled={isImporting}>
          {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : <><Upload className="h-4 w-4 mr-2" />Import from Products</>}
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Designs</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDesigns}</div>
              <p className="text-xs text-muted-foreground">{stats.activeDesigns} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With BOM</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(bomMap).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categories.length}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={filter.category || "all"} onValueChange={(v) => setFilter({ ...filter, category: v === "all" ? undefined : v })}>
                <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={filter.status || "all"} onValueChange={(v) => setFilter({ ...filter, status: v === "all" ? undefined : v as any })}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search designs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Designs ({filteredDesigns.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDesigns.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No designs found</TableCell></TableRow>
                ) : filteredDesigns.map((design) => {
                  const bom = bomMap[design.id];
                  return (
                    <TableRow key={design.id}>
                      <TableCell className="font-medium">{design.name}</TableCell>
                      <TableCell><Badge variant="outline">{design.category}</Badge></TableCell>
                      <TableCell>
                        {bom ? (
                          <Badge variant={bom.status === "active" ? "default" : "secondary"}>
                            {bom.status === "active" ? "Active BOM" : bom.status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>{getStatusBadge(design.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {design.createdAt ? new Date(design.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {hasMore && filteredDesigns.length > 0 && (
            <div className="flex justify-center mt-6">
              <Button onClick={() => loadDesigns(true)} disabled={loadingMore} variant="outline" className="min-w-[180px]">
                {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</> : "Load More"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DesignDialog design={selectedDesign} isOpen={isEditOpen} onClose={() => { setIsEditOpen(false); setSelectedDesign(null); }} onSave={() => { loadDesigns(); loadStats(); }} />
    </div>
  );
}

function DesignDialog({ design, isOpen, onClose, onSave }: { design: Design | null; isOpen: boolean; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = useState<Partial<Design>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (design) {
      setFormData({
        name: design.name || "",
        description: design.description || "",
        category: design.category || "",
        subcategory: design.subcategory || "",
        status: design.status || "active",
      });
    } else {
      setFormData({ name: "", description: "", category: "", subcategory: "", status: "active" });
    }
  }, [design]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const url = design ? `/api/designs/${design.id}` : "/api/designs";
      const method = design ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      const result = await res.json();
      if (result.success) { toast.success(design ? "Updated" : "Created"); onSave(); onClose(); }
      else { toast.error("Failed to save"); }
    } catch { toast.error("Error saving"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{design ? "Edit Design" : "Create Design"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={formData.category || ""} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={formData.status || "active"} onValueChange={(v) => setFormData({ ...formData, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
