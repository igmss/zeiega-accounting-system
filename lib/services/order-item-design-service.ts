import { db, COLLECTIONS } from "../firebase";
import { DesignService } from "./design-service";
import { SizeCostService } from "./size-cost-service";
import { BOMService } from "./bom-service";
import { formatCurrency } from "@/lib/utils"

export class OrderItemDesignService {
  /**
   * Map order items to designs and calculate total costs
   */
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
        
        // Try to find design by product ID or name
        const design = await this.findDesignForItem(item);
        
        if (design) {
          console.log(`Found design: ${design.name} for item: ${item.name}`);
          
          const quantity = item.quantity || 1;
          const size = item.size || 'M'; // Default size if not specified
          
          // Get actual material requirements and calculate real material cost from current inventory prices
          let actualMaterialCost = 0;
          try {
            // Check if there's an active BOM for this design (BOMs include waste factors)
            const activeBOM = await BOMService.getActiveBOMForDesign(design.id);
            
            if (activeBOM) {
              console.log(`Using active BOM ${activeBOM.id} for design ${design.name} (includes waste factors)`);
              const bomRequirements = await BOMService.calculateMaterialRequirements(activeBOM.id, quantity);
              if (bomRequirements.success && bomRequirements.requirements) {
                // Sum the total_cost which includes quantity_with_waste
                actualMaterialCost = bomRequirements.requirements.reduce((sum, req) => sum + req.total_cost, 0);
              }
            } else {
              // Fallback to simple material requirements if no active BOM
              const materialRequirements = await DesignService.getMaterialRequirements(design.id, quantity);
              actualMaterialCost = materialRequirements.reduce((sum, req) => sum + req.totalCost, 0);
            }
            
            console.log(`Actual material cost for ${design.name}: ${formatCurrency(actualMaterialCost)}`);
          } catch (error) {
            console.warn(`Failed to get material requirements for design ${design.id}, using stored materialCost fallback:`, error);
          }
          
          // Calculate size-specific costs
          const sizeSpecificCosts = SizeCostService.calculateSizeSpecificCosts(
            design, 
            size, 
            quantity
          );
          
          // Use actual material cost from requirements if available, otherwise use size-specific calculation
          let finalMaterialCost = sizeSpecificCosts.materialCost;
          let finalEstimatedCost = sizeSpecificCosts.totalCost;
          
          if (actualMaterialCost > 0) {
            // Use actual material cost from current inventory directly
            // No size multiplier is applied to actual inventory costs as per requirements
            finalMaterialCost = actualMaterialCost;
            
            // Recalculate total with actual material cost + size-specific labor/overhead
            finalEstimatedCost = finalMaterialCost + sizeSpecificCosts.laborCost + sizeSpecificCosts.overheadCost;
            
                console.log(`Using actual inventory material cost ${formatCurrency(finalMaterialCost)} instead of size-multiplied estimate ${formatCurrency(sizeSpecificCosts.materialCost)}`);
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
          
          // Fallback to 0 if no design found - don't guess costs silently
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
            quantity
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

  /**
   * Calculate costs for multiple items of the same design with different sizes
   */
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

  /**
   * Find design for an order item
   */
  private static async findDesignForItem(item: any): Promise<any | null> {
    try {
      // Method 1: Try to find by productId
      if (item.productId) {
        const designByProductId = await this.findDesignByProductId(item.productId);
        if (designByProductId) return designByProductId;
      }

      // Method 2: Try to find by product name
      if (item.name) {
        const designByName = await this.findDesignByName(item.name);
        if (designByName) return designByName;
      }

      // Method 3: Try to find by category
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

  /**
   * Find design by product ID
   */
  private static async findDesignByProductId(productId: string): Promise<any | null> {
    try {
      const snapshot = await db.collection(COLLECTIONS.DESIGNS)
        .where("productId", "==", productId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      return null;
    } catch (error) {
      console.error("Error finding design by product ID:", error);
      return null;
    }
  }

  /**
   * Find design by name (fuzzy matching)
   */
  private static async findDesignByName(itemName: string): Promise<any | null> {
    try {
      const term = itemName.toLowerCase().trim();
      
      // 1. Try exact match on normalized name
      const exactSnapshot = await db.collection(COLLECTIONS.DESIGNS)
        .where("name_lower", "==", term)
        .limit(1)
        .get();
      
      if (!exactSnapshot.empty) {
        const doc = exactSnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      
      // 2. Fallback to prefix match (starts with) using range query
      const prefixSnapshot = await db.collection(COLLECTIONS.DESIGNS)
        .where("name_lower", ">=", term)
        .where("name_lower", "<=", term + "\uf8ff")
        .limit(1)
        .get();
        
      if (!prefixSnapshot.empty) {
        const doc = prefixSnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      return null;
    } catch (error) {
      console.error("Error finding design by name:", error);
      return null;
    }
  }

  /**
   * Find design by category
   */
  private static async findDesignByCategory(category: string): Promise<any | null> {
    try {
      const snapshot = await db.collection(COLLECTIONS.DESIGNS)
        .where("category", "==", category)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      return null;
    } catch (error) {
      console.error("Error finding design by category:", error);
      return null;
    }
  }

  /**
   * Create work order with automatic cost calculation from designs
   */
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

      // Calculate costs from designs
      const costCalculation = await this.calculateOrderCostsFromDesigns(orderItems);
      
      if (!costCalculation.success) {
        throw new Error(costCalculation.error || 'Failed to calculate costs');
      }

      // Create work order with calculated costs
      const workOrder = {
        id: `WO-${salesOrderId.split("-").slice(-1)[0]}-${Date.now()}`,
        sales_order_id: salesOrderId,
        raw_materials_used: [],
        materials_issued: [],
        labor_hours: costCalculation.itemCosts.reduce((sum, item) => 
          sum + (item.laborCost / 50), 0), // Assuming EGP 50/hour labor rate
        labor_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0),
        overhead_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0),
        total_cost: 0, // Will be updated when materials are issued
        estimated_cost: costCalculation.totalEstimatedCost,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
        completionPercentage: 0,
        notes: `Auto-generated work order with design-based costs (${formatCurrency(costCalculation.totalEstimatedCost)})`,
        items: orderItems,
        item_costs: costCalculation.itemCosts, // Store item-level cost breakdown
        ...additionalData
      };

      // Save work order to database
      const workOrderRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(workOrder);

      console.log(`✅ Created work order ${workOrderRef.id} with auto-calculated cost ${formatCurrency(costCalculation.totalEstimatedCost)}`);

      return {
        success: true,
        workOrderId: workOrderRef.id,
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
