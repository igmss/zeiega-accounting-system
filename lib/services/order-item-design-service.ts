import { supabase, TABLES, getServiceSupabase } from "../supabase";
import { DesignService } from "./design-service";
import { SizeCostService } from "./size-cost-service";
import { BOMService } from "./bom-service";
import { formatCurrency } from "@/lib/utils"

export class OrderItemDesignService {

  private static normalizeDesignFields(raw: any): any {
    if (!raw) return raw
    return {
      ...raw,
      materialCost: raw.materialCost ?? raw.material_cost ?? 0,
      laborCost: raw.laborCost ?? raw.labor_cost ?? 0,
      overheadCost: raw.overheadCost ?? raw.overhead_cost ?? 0,
      totalCost: raw.totalCost ?? raw.total_cost ?? 0,
      manufacturingTime: raw.manufacturingTime ?? raw.manufacturing_time ?? 0,
      complexity: raw.complexity ?? 'medium',
    }
  }

  static async calculateOrderCostsFromDesigns(orderItems: any[]): Promise<{
    success: boolean;
    totalEstimatedCost: number;
    itemCosts: any[];
    warnings?: string[];
    error?: string;
  }> {
    try {
      console.log(`Calculating costs for ${orderItems.length} order items from designs...`);
      
      const itemCosts = [];
      const warnings: string[] = [];
      let totalEstimatedCost = 0;

      for (const item of orderItems) {
        console.log(`Processing item: ${item.name} (${item.productId})`);
        
        const design = await this.findDesignForItem(item);
        
        if (design) {
          console.log(`Found design: ${design.name} for item: ${item.name}`);
          
          const quantity = item.quantity || 1;
          const size = item.size || 'M';
          
          let actualMaterialCost = 0;
          try {
            const activeBOM = await BOMService.getActiveBOMForDesign(design.id);
            
            if (activeBOM) {
              console.log(`Using active BOM ${activeBOM.id} for design ${design.name} (includes waste factors)`);
              const bomRequirements = await BOMService.calculateMaterialRequirements(activeBOM.id, quantity);
              if (bomRequirements.success && bomRequirements.requirements) {
                actualMaterialCost = bomRequirements.requirements.reduce((sum, req) => sum + req.total_cost, 0);
              }
            } else {
              const materialRequirements = await DesignService.getMaterialRequirements(design.id, quantity);
              actualMaterialCost = materialRequirements.reduce((sum, req) => sum + req.totalCost, 0);
            }
            
            console.log(`Actual material cost for ${design.name}: ${formatCurrency(actualMaterialCost)}`);
          } catch (error) {
            console.warn(`Failed to get material requirements for design ${design.id}, using stored materialCost fallback:`, error);
          }
          
          let sizeSpecificCosts;
          try {
            sizeSpecificCosts = SizeCostService.calculateSizeSpecificCosts(
              design, 
              size, 
              quantity
            );
          } catch (sizeError) {
            console.warn(`Size cost calculation failed for ${design.name}, using design defaults:`, sizeError);
            sizeSpecificCosts = {
              materialCost: design.materialCost || 0,
              laborCost: design.laborCost || 0,
              overheadCost: design.overheadCost || 0,
              totalCost: design.totalCost || 0,
            };
          }
          
          let finalMaterialCost = sizeSpecificCosts.materialCost;
          let finalEstimatedCost = sizeSpecificCosts.totalCost;
          
          if (actualMaterialCost > 0) {
            finalMaterialCost = actualMaterialCost;
            finalEstimatedCost = finalMaterialCost + sizeSpecificCosts.laborCost + sizeSpecificCosts.overheadCost;
            console.log(`[DEBUG:COST] sizeSpecificCosts.totalCost=${sizeSpecificCosts.totalCost}, materialCost=${sizeSpecificCosts.materialCost}, laborCost=${sizeSpecificCosts.laborCost}, overheadCost=${sizeSpecificCosts.overheadCost}`);
            console.log(`[DEBUG:COST] actualMaterialCost=${actualMaterialCost}, finalMaterialCost=${finalMaterialCost}, finalEstimatedCost=${finalEstimatedCost}`);
            console.log(`Using actual inventory material cost ${formatCurrency(finalMaterialCost)} instead of size-multiplied estimate ${formatCurrency(sizeSpecificCosts.materialCost)}`);
          } else {
            console.log(`[DEBUG:COST] actualMaterialCost=${actualMaterialCost} (not > 0), using size cost: totalCost=${sizeSpecificCosts.totalCost}`);
          }
          
          itemCosts.push({
            item,
            designId: design.id,
            designName: design.name,
            image: design.image || design.images?.[0] || item.image || null,
            estimatedCost: finalEstimatedCost,
            materialCost: finalMaterialCost,
            laborCost: sizeSpecificCosts.laborCost,
            overheadCost: sizeSpecificCosts.overheadCost,
            quantity,
            size: size,
            manufacturingTime: sizeSpecificCosts.manufacturingTime,
            complexity: sizeSpecificCosts.complexity,
            source: sizeSpecificCosts.source
          });
          
          totalEstimatedCost += finalEstimatedCost;
          
          console.log(`Item ${item.name} (Size ${size}): Estimated cost ${formatCurrency(finalEstimatedCost)} (Material: ${formatCurrency(finalMaterialCost)}, Labor: ${formatCurrency(sizeSpecificCosts.laborCost)}, Overhead: ${formatCurrency(sizeSpecificCosts.overheadCost)})`);
        } else {
          console.warn(`No design found for item: ${item.name} (${item.productId})`);
          
          const quantity = item.quantity || 1;
          const defaultCost = 0;
          
          itemCosts.push({
            item,
            designId: undefined,
            designName: undefined,
            designMatched: false,
            estimatedCost: defaultCost,
            materialCost: 0,
            laborCost: 0,
            overheadCost: 0,
            quantity,
            size: item.size || "M",
            manufacturingTime: 0,
            complexity: "medium",
            image: null,
            source: "default"
          });
          
          warnings.push(`Unmatched design for item: ${item.name} (SKU/ID: ${item.productId})`);
          totalEstimatedCost += defaultCost;
          
          console.log(`Item ${item.name}: Using 0 fallback cost (unmatched design)`);
        }
      }

      console.log(`Total estimated cost for order: ${formatCurrency(totalEstimatedCost)}`);

      return {
        success: true,
        totalEstimatedCost,
        itemCosts,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      console.error("Error calculating order costs from designs:", error);
      return {
        success: false,
        totalEstimatedCost: 0,
        itemCosts: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async calculateMultiSizeDesignCosts(
    designId: string,
    sizeQuantities: Array<{ size: string; quantity: number }>
  ): Promise<{
    success: boolean;
    totalEstimatedCost: number;
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    totalManufacturingTime: number;
    sizeBreakdown: Array<{
      size: string;
      quantity: number;
      materialCost: number;
      laborCost: number;
      overheadCost: number;
      totalCost: number;
      manufacturingTime: number;
    }>;
    error?: string;
  }> {
    try {
      console.log(`Calculating multi-size costs for design ${designId}...`);
      
      const design = await DesignService.getDesign(designId);
      if (!design) {
        return {
          success: false,
          totalEstimatedCost: 0,
          totalMaterialCost: 0,
          totalLaborCost: 0,
          totalOverheadCost: 0,
          totalManufacturingTime: 0,
          sizeBreakdown: [],
          error: "Design not found"
        };
      }

      const result = SizeCostService.calculateMultiSizeOrderCosts(design, sizeQuantities);
      
      console.log(`Multi-size calculation complete. Total cost: ${formatCurrency(result.totalCost)}`);
      
      return {
        success: true,
        totalEstimatedCost: result.totalCost,
        totalMaterialCost: result.totalMaterialCost,
        totalLaborCost: result.totalLaborCost,
        totalOverheadCost: result.totalOverheadCost,
        totalManufacturingTime: result.totalManufacturingTime,
        sizeBreakdown: result.itemBreakdown
      };

    } catch (error) {
      console.error("Error calculating multi-size design costs:", error);
      return {
        success: false,
        totalEstimatedCost: 0,
        totalMaterialCost: 0,
        totalLaborCost: 0,
        totalOverheadCost: 0,
        totalManufacturingTime: 0,
        sizeBreakdown: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async findDesignForItem(item: any): Promise<any | null> {
    try {
      if (item.productId) {
        const designByProductId = await this.findDesignByProductId(item.productId);
        if (designByProductId) return designByProductId;
      }

      if (item.name) {
        const designByName = await this.findDesignByName(item.name);
        if (designByName) return designByName;
      }

      if (item.category) {
        const designByCategory = await this.findDesignByCategory(item.category);
        if (designByCategory) return designByCategory;
      }

      return null;
    } catch (error) {
      console.error("Error finding design for item:", error);
      return null;
    }
  }

  private static async findDesignByProductId(productId: string): Promise<any | null> {
    try {
      const { data, error } = await getServiceSupabase().from(TABLES.DESIGNS)
        .select("*")
        .eq("productId", productId)
        .limit(1)
        .single();

      if (error || !data) return null;
      return this.normalizeDesignFields(data);
    } catch (error) {
      console.error("Error finding design by product ID:", error);
      return null;
    }
  }

  private static async findDesignByName(itemName: string): Promise<any | null> {
    try {
      const term = itemName.toLowerCase().trim();
      
      const { data: exactData } = await getServiceSupabase().from(TABLES.DESIGNS)
        .select("*")
        .eq("name_lower", term)
        .limit(1)
        .single();
      
      if (exactData) {
        return this.normalizeDesignFields(exactData);
      }
      
      const { data: prefixData } = await getServiceSupabase().from(TABLES.DESIGNS)
        .select("*")
        .gte("name_lower", term)
        .lte("name_lower", term + "\uf8ff")
        .limit(1)
        .single();
        
      if (prefixData) {
        return this.normalizeDesignFields(prefixData);
      }

      return null;
    } catch (error) {
      console.error("Error finding design by name:", error);
      return null;
    }
  }

  private static async findDesignByCategory(category: string): Promise<any | null> {
    try {
      const { data, error } = await getServiceSupabase().from(TABLES.DESIGNS)
        .select("*")
        .eq("category", category)
        .limit(1)
        .single();

      if (error || !data) return null;
      return this.normalizeDesignFields(data);
    } catch (error) {
      console.error("Error finding design by category:", error);
      return null;
    }
  }

  static async createWorkOrderWithAutoCosts(
    salesOrderId: string,
    orderItems: any[],
    additionalData: any = {}
  ): Promise<{
    success: boolean;
    workOrderId?: string;
    totalEstimatedCost?: number;
    itemCosts?: any[];
    error?: string;
  }> {
    try {
      console.log(`Creating work order with auto costs for sales order ${salesOrderId}...`);

      const costCalculation = await this.calculateOrderCostsFromDesigns(orderItems);
      
      if (!costCalculation.success) {
        throw new Error(costCalculation.error || 'Failed to calculate costs');
      }

      const workOrderId = `WO-${salesOrderId.split("-").slice(-1)[0]}-${Date.now()}`;
      const now = new Date().toISOString()
      const year = new Date().getFullYear()
      const random = Math.random().toString(36).slice(2, 6).toUpperCase()

      const firstMatch = costCalculation.itemCosts[0] || {}
      const designId = firstMatch.designId || undefined
      const materialCost = costCalculation.itemCosts.reduce((sum: number, item: any) => sum + (item.materialCost || 0), 0)
      const laborCost = costCalculation.itemCosts.reduce((sum: number, item: any) => sum + (item.laborCost || 0), 0)
      const overheadCost = costCalculation.itemCosts.reduce((sum: number, item: any) => sum + (item.overheadCost || 0), 0)

      const workOrder = {
        id: workOrderId,
        wo_number: `WO-${year}-${random}`,
        sales_order_id: salesOrderId,
        design_id: designId,
        design_name: firstMatch.designName || undefined,
        raw_materials_used: [],
        materials_issued: [],
        labor_hours: laborCost / 50,
        labor_cost: laborCost,
        overhead_cost: overheadCost,
        material_cost: materialCost,
        total_cost: 0,
        estimated_cost: costCalculation.totalEstimatedCost,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completion_percentage: 0,
        notes: `Auto-generated work order with design-based costs (${formatCurrency(costCalculation.totalEstimatedCost)})`,
        items: orderItems,
        item_costs: costCalculation.itemCosts,
        ...additionalData
      };

      const { error } = await getServiceSupabase().from(TABLES.WORK_ORDERS).insert(workOrder);
      if (error) throw error;

      console.log(`✅ Created work order ${workOrderId} with auto-calculated cost ${formatCurrency(costCalculation.totalEstimatedCost)}`);

      return {
        success: true,
        workOrderId,
        totalEstimatedCost: costCalculation.totalEstimatedCost,
        itemCosts: costCalculation.itemCosts
      };

    } catch (error) {
      console.error("Error creating work order with auto costs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
