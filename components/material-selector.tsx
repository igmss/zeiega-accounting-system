"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import type { Material } from "@/lib/types/designs";

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  type: string;
  unit?: string;
  quantity_on_hand?: number;
  cost_per_unit?: number;
  description?: string;
}

interface MaterialSelectorProps {
  materials: Material[];
  onMaterialsChange: (materials: Material[]) => void;
}

export function MaterialSelector({ materials, onMaterialsChange }: MaterialSelectorProps) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);

  // Load inventory items
  useEffect(() => {
    loadInventoryItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, searchTerm]);

  const loadInventoryItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (selectedType !== "all") {
        params.append('type', selectedType);
      }
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await fetch(`/api/inventory/items?${params}`);
      const result = await response.json();

      if (result.success) {
        setInventoryItems(result.data);
      } else {
        toast.error("Failed to load inventory items");
      }
    } catch (error) {
      console.error("Error loading inventory items:", error);
      toast.error("Failed to load inventory items");
    } finally {
      setLoading(false);
    }
  };

  const addMaterial = (inventoryItem: InventoryItem) => {
    const newMaterial: Material = {
      id: `material_${Date.now()}`,
      name: inventoryItem.name,
      type: inventoryItem.type as any,
      unit: inventoryItem.unit as any || 'piece',
      quantityPerUnit: 1,
      costPerUnit: inventoryItem.cost_per_unit || 0,
      supplier: '',
      specifications: inventoryItem.description || '',
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      inventoryItemSku: inventoryItem.sku,
      availableQuantity: inventoryItem.quantity_on_hand || 0
    };

    onMaterialsChange([...materials, newMaterial]);
    setIsAddingMaterial(false);
    toast.success(`Added ${inventoryItem.name} to materials`);
  };

  const removeMaterial = (materialId: string) => {
    onMaterialsChange(materials.filter(m => m.id !== materialId));
    toast.success("Material removed");
  };

  const updateMaterial = (materialId: string, updates: Partial<Material>) => {
    onMaterialsChange(materials.map(m => 
      m.id === materialId ? { ...m, ...updates } : m
    ));
  };

  const calculateTotalMaterialCost = () => {
    return materials.reduce((total, material) => 
      total + (material.quantityPerUnit * material.costPerUnit), 0
    );
  };

  return (
    <div className="space-y-6">
      {/* Current Materials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materials Required ({materials.length})
              <Badge variant="secondary">Total Cost: {formatCurrency(calculateTotalMaterialCost())}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {materials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No materials added yet. Click &quot;Add Material&quot; to select from inventory.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{material.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {material.inventoryItemSku}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{material.inventoryItemSku}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={material.quantityPerUnit}
                        onChange={(e) => updateMaterial(material.id, {
                          quantityPerUnit: parseFloat(e.target.value) || 0
                        })}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>{material.unit}</TableCell>
                    <TableCell>{formatCurrency(material.costPerUnit)}</TableCell>
                    <TableCell>{formatCurrency(material.quantityPerUnit * (material.costPerUnit || 0))}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={(material.availableQuantity || 0) >= material.quantityPerUnit ? "default" : "destructive"}
                      >
                        {material.availableQuantity || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMaterial(material.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Material */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Material from Inventory
            </span>
            <Button
              variant="outline"
              onClick={() => setIsAddingMaterial(!isAddingMaterial)}
            >
              {isAddingMaterial ? "Cancel" : "Add Material"}
            </Button>
          </CardTitle>
        </CardHeader>
        
        {isAddingMaterial && (
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Materials</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, SKU, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <Label htmlFor="type">Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="raw">Raw Materials</SelectItem>
                    <SelectItem value="finished">Finished Goods</SelectItem>
                    <SelectItem value="wip">Work in Progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Inventory Items */}
            {loading ? (
              <div className="text-center py-8">Loading inventory items...</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Cost/Unit</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.type}</Badge>
                        </TableCell>
                        <TableCell>{item.quantity_on_hand || 0}</TableCell>
                        <TableCell>{formatCurrency(item.cost_per_unit)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => addMaterial(item)}
                            disabled={!item.quantity_on_hand || item.quantity_on_hand <= 0}
                          >
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {inventoryItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No inventory items found matching your criteria.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
