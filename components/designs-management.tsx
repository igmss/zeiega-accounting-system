"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Download, 
  Upload, 
  Search, 
  Filter,
  DollarSign,
  Clock,
  Package,
  TrendingUp,
  Loader2
} from "lucide-react";
import type { Design, DesignFilter, DesignStats } from "@/lib/types/designs";
import { MaterialSelector } from "./material-selector";

export default function DesignsManagement() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [stats, setStats] = useState<DesignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DesignFilter>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Load initial data
  useEffect(() => {
    loadDesigns();
    loadStats();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load subcategories when category changes
  useEffect(() => {
    if (filter.category) {
      loadSubcategories(filter.category);
    } else {
      setSubcategories([]);
    }
  }, [filter.category]);

  const loadDesigns = async (loadMore: boolean = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const params = new URLSearchParams();
      
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value.toString());
        }
      });

      // Add pagination parameters
      if (loadMore && designs.length > 0) {
        params.append('lastDocId', designs[designs.length - 1].id);
      }
      params.append('pageSize', '50'); // Increased from 20 to 50

      const response = await fetch(`/api/designs?${params}`);
      const result = await response.json();

      if (result.success) {
        if (loadMore) {
          setDesigns(prevDesigns => [...prevDesigns, ...result.data]);
        } else {
          setDesigns(result.data);
        }
        setHasMore(result.pagination?.hasMore || false);
      } else {
        toast.error("Failed to load designs");
      }
    } catch (error) {
      console.error("Error loading designs:", error);
      toast.error("Failed to load designs");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch("/api/designs/stats");
      const result = await response.json();

      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/designs/categories");
      const result = await response.json();

      if (result.success) {
        setCategories(result.data);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  const loadSubcategories = async (category: string) => {
    try {
      const response = await fetch(`/api/designs/categories?category=${category}`);
      const result = await response.json();

      if (result.success) {
        setSubcategories(result.data);
      }
    } catch (error) {
      console.error("Error loading subcategories:", error);
    }
  };

  const handleImportDesigns = async () => {
    if (isImporting) return; // Prevent multiple clicks
    
    try {
      setIsImporting(true);
      const response = await fetch("/api/designs/import", { method: "POST" });
      const result = await response.json();

      if (result.success) {
        const data = result.data || {};
        let message = result.message;
        if (!message) {
          if (data.updated && data.updated > 0) {
            message = `Imported ${data.imported || 0} new designs, updated ${data.updated} existing designs`;
          } else {
            message = `Successfully imported ${data.imported || 0} designs`;
          }
          if (data.errors && data.errors.length > 0) {
            message += ` (${data.errors.length} errors)`;
          }
        }
        toast.success(message);
        loadDesigns();
        loadStats();
      } else {
        toast.error(result.error || "Failed to import designs");
      }
    } catch (error) {
      console.error("Error importing designs:", error);
      toast.error("Failed to import designs");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteDesign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this design?")) return;

    try {
      const response = await fetch(`/api/designs/${id}`, { method: "DELETE" });
      const result = await response.json();

      if (result.success) {
        toast.success("Design deleted successfully");
        loadDesigns();
        loadStats();
      } else {
        toast.error("Failed to delete design");
      }
    } catch (error) {
      console.error("Error deleting design:", error);
      toast.error("Failed to delete design");
    }
  };

  const handleEditDesign = (design: Design) => {
    setSelectedDesign(design);
    setIsEditDialogOpen(true);
  };

  const handleCreateDesign = () => {
    setSelectedDesign(null);
    setIsCreateDialogOpen(true);
  };

  const filteredDesigns = designs.filter(design =>
    searchTerm === "" ||
    design.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    design.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    design.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Design Management</h1>
          <p className="text-muted-foreground">Manage product designs and cost configurations</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleImportDesigns} 
            variant="outline"
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import from Products
              </>
            )}
          </Button>
          <Button onClick={handleCreateDesign}>
            <Plus className="h-4 w-4 mr-2" />
            Add Design
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Designs</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDesigns}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeDesigns} active
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.averageCost)}</div>
              <p className="text-xs text-muted-foreground">Per design</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalCostValue)}</div>
              <p className="text-xs text-muted-foreground">Sum of active design costs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search designs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={filter.category || "all"}
                onValueChange={(value) => setFilter({ ...filter, category: value === "all" ? undefined : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                value={filter.subcategory || "all"}
                onValueChange={(value) => setFilter({ ...filter, subcategory: value === "all" ? undefined : value })}
                disabled={!filter.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subcategories</SelectItem>
                  {subcategories.map(subcategory => (
                    <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={filter.status || "all"}
                onValueChange={(value) => setFilter({ ...filter, status: value === "all" ? undefined : value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
            <Button onClick={() => loadDesigns(false)}>
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Designs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Designs ({filteredDesigns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading designs...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDesigns.map((design) => (
                  <TableRow key={design.id}>
                    <TableCell className="font-medium">{design.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{design.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={design.status === 'active' ? 'default' : 'secondary'}
                      >
                        {design.status}
                      </Badge>
                    </TableCell>
                     <TableCell>{formatCurrency(design.totalCost)}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          design.complexity === 'high' ? 'destructive' :
                          design.complexity === 'medium' ? 'default' : 'secondary'
                        }
                      >
                        {design.complexity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditDesign(design)}
                          aria-label="Edit design"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteDesign(design.id)}
                          aria-label="Delete design"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {/* Load More Button */}
          {hasMore && filteredDesigns.length > 0 && (
            <div className="flex justify-center mt-6">
              <Button
                onClick={() => loadDesigns(true)}
                disabled={loadingMore}
                variant="outline"
                className="min-w-[180px]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load More (${filteredDesigns.length} of ${stats?.totalDesigns || 0})`
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <DesignDialog
        design={selectedDesign}
        isOpen={isEditDialogOpen || isCreateDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setIsCreateDialogOpen(false);
          setSelectedDesign(null);
        }}
        onSave={() => {
          loadDesigns();
          loadStats();
        }}
      />
    </div>
  );
}

// Design Dialog Component
function DesignDialog({ 
  design, 
  isOpen, 
  onClose, 
  onSave 
}: { 
  design: Design | null; 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: () => void; 
}) {
  const [formData, setFormData] = useState<Partial<Design>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (design) {
      const matCost = (design.materials || []).reduce((sum: number, m: any) =>
        sum + ((m.quantityPerUnit || 0) * (m.costPerUnit || 0)), 0)
      setFormData({
        name: design.name || "",
        description: design.description || "",
        category: design.category || "",
        subcategory: design.subcategory || "",
        materialCost: matCost || design.materialCost || 0,
        laborCost: design.laborCost || 0,
        overheadCost: design.overheadCost || 0,
        manufacturingTime: design.manufacturingTime || 0,
        complexity: design.complexity || "medium",
        status: design.status || "active",
        materials: design.materials || [],
        processes: design.processes || [],
        variants: design.variants || [],
      });
      setFormData({
        name: "",
        description: "",
        category: "",
        subcategory: "",
        materialCost: 0,
        laborCost: 0,
        overheadCost: 0,
        manufacturingTime: 0,
        complexity: "medium",
        status: "active",
        materials: [],
        processes: [],
        variants: []
      });
    }
  }, [design]);

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const url = design ? `/api/designs/${design.id}` : "/api/designs";
      const method = design ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(design ? "Design updated successfully" : "Design created successfully");
        onSave();
        onClose();
      } else {
        toast.error("Failed to save design");
      }
    } catch (error) {
      console.error("Error saving design:", error);
      toast.error("Failed to save design");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {design ? "Edit Design" : "Create New Design"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category || ""}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="materialCost">Material Cost</Label>
              <Input
                id="materialCost"
                type="number"
                value={formData.materialCost || 0}
                onChange={(e) => setFormData({ ...formData, materialCost: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="laborCost">Labor Cost</Label>
              <Input
                id="laborCost"
                type="number"
                value={formData.laborCost || 0}
                onChange={(e) => setFormData({ ...formData, laborCost: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="overheadCost">Overhead Cost</Label>
              <Input
                id="overheadCost"
                type="number"
                value={formData.overheadCost || 0}
                onChange={(e) => setFormData({ ...formData, overheadCost: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="manufacturingTime">Manufacturing Time (hours)</Label>
              <Input
                id="manufacturingTime"
                type="number"
                value={formData.manufacturingTime || 0}
                onChange={(e) => setFormData({ ...formData, manufacturingTime: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="complexity">Complexity</Label>
              <Select
                value={formData.complexity || "medium"}
                onValueChange={(value) => setFormData({ ...formData, complexity: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || "active"}
                onValueChange={(value) => setFormData({ ...formData, status: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        
        {/* Material Configuration */}
        <div className="mt-6">
          <MaterialSelector
            materials={formData.materials || []}
            onMaterialsChange={(materials) => {
              setFormData({ ...formData, materials });
              // Auto-calculate material cost from selected materials
              const totalMaterialCost = materials.reduce((total, material) => 
                total + (material.quantityPerUnit * material.costPerUnit), 0
              );
              setFormData(prev => ({ ...prev, materials, materialCost: totalMaterialCost }));
            }}
          />
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
