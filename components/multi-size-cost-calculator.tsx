"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, Package, Clock, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface SizeQuantity {
  size: string;
  quantity: number;
}

interface CostBreakdown {
  size: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  manufacturingTime: number;
}

interface MultiSizeCostResult {
  totalEstimatedCost: number;
  totalMaterialCost: number;
  totalLaborCost: number;
  totalOverheadCost: number;
  totalManufacturingTime: number;
  sizeBreakdown: CostBreakdown[];
}

const STANDARD_SIZES = [
  '2Y', '3Y', '4Y', '5Y', '6Y', '7Y', '8Y', '9Y', 
  '10Y', '11Y', '12Y', '13Y', '14Y', '15Y', '16Y'
];

export default function MultiSizeCostCalculator() {
  const [designId, setDesignId] = useState("");
  const [sizeQuantities, setSizeQuantities] = useState<SizeQuantity[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultiSizeCostResult | null>(null);

  const addSizeQuantity = () => {
    setSizeQuantities([...sizeQuantities, { size: "8Y", quantity: 1 }]);
  };

  const updateSizeQuantity = (index: number, field: keyof SizeQuantity, value: string | number) => {
    const updated = [...sizeQuantities];
    updated[index] = { ...updated[index], [field]: value };
    setSizeQuantities(updated);
  };

  const removeSizeQuantity = (index: number) => {
    setSizeQuantities(sizeQuantities.filter((_, i) => i !== index));
  };

  const calculateCosts = async () => {
    if (!designId.trim()) {
      toast.error("Please enter a design ID");
      return;
    }

    if (sizeQuantities.length === 0) {
      toast.error("Please add at least one size quantity");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/designs/multi-size-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId,
          sizeQuantities
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setResult(data.data);
        toast.success("Cost calculation completed successfully");
      } else {
        toast.error(data.error || "Failed to calculate costs");
      }
    } catch (error) {
      console.error("Error calculating costs:", error);
      toast.error("Failed to calculate costs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Multi-Size Cost Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="designId">Design ID</Label>
            <Input
              id="designId"
              value={designId}
              onChange={(e) => setDesignId(e.target.value)}
              placeholder="Enter design ID"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Size Quantities</Label>
              <Button onClick={addSizeQuantity} size="sm">
                Add Size
              </Button>
            </div>
            
            <div className="space-y-2">
              {sizeQuantities.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={item.size}
                    onValueChange={(value) => updateSizeQuantity(index, "size", value)}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SIZES.map(size => (
                        <SelectItem key={size} value={size}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateSizeQuantity(index, "quantity", parseInt(e.target.value) || 0)}
                    className="w-20"
                    min="1"
                  />
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeSizeQuantity(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button 
            onClick={calculateCosts} 
            disabled={loading}
            className="w-full"
          >
            {loading ? "Calculating..." : "Calculate Costs"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Cost Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{formatCurrency(result.totalEstimatedCost)}</div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
              </div>
              <div className="text-center">
                  <div className="text-xl font-semibold">{formatCurrency(result.totalMaterialCost)}</div>
                <p className="text-sm text-muted-foreground">Material</p>
              </div>
              <div className="text-center">
                  <div className="text-xl font-semibold">{formatCurrency(result.totalLaborCost)}</div>
                <p className="text-sm text-muted-foreground">Labor</p>
              </div>
              <div className="text-center">
                  <div className="text-xl font-semibold">{formatCurrency(result.totalOverheadCost)}</div>
                <p className="text-sm text-muted-foreground">Overhead</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Size Breakdown</h4>
              {result.sizeBreakdown.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{item.size}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Qty: {item.quantity}
                    </span>
                  </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>Material: {formatCurrency(item.materialCost)}</span>
                      <span>Labor: {formatCurrency(item.laborCost)}</span>
                      <span>Overhead: {formatCurrency(item.overheadCost)}</span>
                      <span className="font-semibold">Total: {formatCurrency(item.totalCost)}</span>
                    </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="h-4 w-4" />
                <span className="font-medium">Total Manufacturing Time:</span>
                <span>{result.totalManufacturingTime.toFixed(1)} hours</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
