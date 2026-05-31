import { supabase, TABLES, getServiceSupabase } from "../supabase";
import { SizeCostService } from "./size-cost-service";
import { formatCurrency } from "@/lib/utils"
import type { 
  Design, 
  DesignFilter, 
  DesignStats, 
  Material, 
  Process, 
  DesignVariant,
  MaterialRequirement 
} from "../types/designs";

export class DesignService {
  private static readonly TABLE_NAME = TABLES.DESIGNS;

  static async getDesigns(
    filter?: DesignFilter,
    lastDocId?: string,
    pageSize: number = 50
  ): Promise<{ designs: Design[]; lastDoc?: any; hasMore: boolean }> {
    try {
      console.log("DesignService.getDesigns called with:", { filter, lastDocId, pageSize });
      console.log("Table name:", this.TABLE_NAME);
      
      let query = getServiceSupabase().from(this.TABLE_NAME).select("*").order("created_at", { ascending: false }).limit(pageSize);

      if (filter?.category) {
        query = query.eq("category", filter.category);
      }
      if (filter?.subcategory) {
        query = query.eq("subcategory", filter.subcategory);
      }
      if (filter?.status) {
        query = query.eq("status", filter.status);
      }
      if (filter?.complexity) {
        query = query.eq("complexity", filter.complexity);
      }

      if (lastDocId) {
        const { data: lastDoc } = await getServiceSupabase().from(this.TABLE_NAME).select("created_at").eq("id", lastDocId).single();
        if (lastDoc) {
          query = query.lt("created_at", lastDoc.created_at);
        }
      }

      const { data: rows, error } = await query;
      console.log("Query executed successfully, found", rows?.length || 0, "rows");
      
      if (error) throw error;

      const designs = (rows || []).map((row: any) => ({
        id: row.id,
        name: row.name || "",
        description: row.description || "",
        category: row.category || "",
        subcategory: row.subcategory || "",
        image: row.image || "",
        images: row.images || [],
        materialCost: row.material_cost || 0,
        laborCost: row.labor_cost || 0,
        overheadCost: row.overhead_cost || 0,
        totalCost: row.total_cost || 0,
        manufacturingTime: row.manufacturing_time || 0,
        complexity: row.complexity || "medium",
        status: row.status || "active",
        materials: row.materials || [],
        processes: row.processes || [],
        variants: row.variants || [],
        sizeCosts: row.size_costs || {},
        tags: row.tags || [],
        notes: row.notes || "",
        createdBy: row.created_by || "",
        updatedBy: row.updated_by || "",
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
      })) as Design[];

      let filteredDesigns = designs;
      if (filter?.minCost !== undefined) {
        filteredDesigns = filteredDesigns.filter(d => d.totalCost >= filter.minCost!);
      }
      if (filter?.maxCost !== undefined) {
        filteredDesigns = filteredDesigns.filter(d => d.totalCost <= filter.maxCost!);
      }

      console.log("Returning", filteredDesigns.length, "filtered designs");
      
      return {
        designs: filteredDesigns,
        lastDoc: (rows && rows.length > 0) ? rows[rows.length - 1] : null,
        hasMore: (rows || []).length === pageSize
      };
    } catch (error) {
      console.error("Error fetching designs:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`Failed to fetch designs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getDesign(id: string): Promise<Design | null> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE_NAME).select("*").eq("id", id).single();
      
      if (error || !data) {
        return null;
      }
      return {
        id: data.id,
        name: data.name || "",
        description: data.description || "",
        category: data.category || "",
        subcategory: data.subcategory || "",
        image: data.image || "",
        images: data.images || [],
        materialCost: data.material_cost || 0,
        laborCost: data.labor_cost || 0,
        overheadCost: data.overhead_cost || 0,
        totalCost: data.total_cost || 0,
        manufacturingTime: data.manufacturing_time || 0,
        complexity: data.complexity || "medium",
        status: data.status || "active",
        materials: data.materials || [],
        processes: data.processes || [],
        variants: data.variants || [],
        sizeCosts: data.size_costs || {},
        tags: data.tags || [],
        notes: data.notes || "",
        createdBy: data.created_by || "",
        updatedBy: data.updated_by || "",
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString(),
      } as Design;
    } catch (error) {
      console.error("Error fetching design:", error);
      throw new Error("Failed to fetch design");
    }
  }

  static async createDesign(designData: Omit<Design, "id" | "createdAt" | "updatedAt">): Promise<string> {
    try {
      const now = new Date().toISOString();
      if ((designData as any).productId) {
        const { data: dupRows } = await getServiceSupabase().from(this.TABLE_NAME)
          .select("id")
          .eq("productId", (designData as any).productId)
          .limit(1);
        if (dupRows && dupRows.length > 0) {
          const id = dupRows[0].id;
          console.log("Design already exists by productId, returning existing ID:", id);
          return id;
        }
      } else {
        const nameLower = (designData.name || "").trim().toLowerCase();
        const categoryLower = (designData.category || "").trim().toLowerCase();
        if (nameLower) {
          const { data: dupRows } = await getServiceSupabase().from(this.TABLE_NAME)
            .select("id")
            .eq("name_lower", nameLower)
            .eq("category_lower", categoryLower)
            .limit(1);
          if (dupRows && dupRows.length > 0) {
            const id = dupRows[0].id;
            console.log("Design already exists by name+category, returning existing ID:", id);
            return id;
          }
        }
      }
      const id = crypto.randomUUID();
      const designDoc = {
        id,
        name: designData.name,
        description: designData.description || null,
        category: designData.category || "General",
        subcategory: designData.subcategory || null,
        image: designData.image || null,
        images: designData.images || [],
        material_cost: designData.materialCost || 0,
        labor_cost: designData.laborCost || 0,
        overhead_cost: designData.overheadCost || 0,
        manufacturing_time: designData.manufacturingTime || 1,
        total_cost: this.calculateTotalCost(designData),
        size_costs: SizeCostService.generateSizeCosts(designData as Design),
        complexity: designData.complexity || "medium",
        status: designData.status || "active",
        created_by: designData.createdBy || null,
        updated_by: designData.updatedBy || null,
        tags: designData.tags || [],
        notes: designData.notes || null,
        variants: designData.variants || [],
        product_id: (designData as any).productId || null,
        name_lower: (designData.name || "").trim().toLowerCase(),
        category_lower: (designData.category || "").trim().toLowerCase(),
        materials: designData.materials || [],
        processes: designData.processes || [],
        size_configurations: designData.sizeConfigurations || [],
        size_ranges: designData.sizeRanges || [],
        default_size_multipliers: designData.defaultSizeMultipliers || {},
      };

      const { error } = await getServiceSupabase().from(this.TABLE_NAME).insert(designDoc);
      if (error) throw error;
      console.log("Design created with ID:", id);
      return id;
    } catch (error) {
      console.error("Error creating design:", error);
      throw new Error("Failed to create design");
    }
  }

  static async updateDesign(id: string, updates: Partial<Omit<Design, "id" | "createdAt" | "updatedAt">>): Promise<void> {
    try {
      const existingDesign = await this.getDesign(id);
      if (!existingDesign) {
        throw new Error("Design not found");
      }

      const costFields: Array<keyof Design> = [
        'materialCost', 
        'laborCost', 
        'overheadCost', 
        'manufacturingTime'
      ];
      const shouldRecalculate = costFields.some(field => field in updates);
      
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory;
      if (updates.image !== undefined) updateData.image = updates.image;
      if (updates.images !== undefined) updateData.images = updates.images;
      if (updates.materialCost !== undefined) updateData.material_cost = updates.materialCost;
      if (updates.laborCost !== undefined) updateData.labor_cost = updates.laborCost;
      if (updates.overheadCost !== undefined) updateData.overhead_cost = updates.overheadCost;
      if (updates.manufacturingTime !== undefined) updateData.manufacturing_time = updates.manufacturingTime;
      if (updates.complexity !== undefined) updateData.complexity = updates.complexity;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.updatedBy !== undefined) updateData.updated_by = updates.updatedBy;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.variants !== undefined) updateData.variants = updates.variants;
      if ((updates as any).materials !== undefined) updateData.materials = (updates as any).materials;
      if ((updates as any).processes !== undefined) updateData.processes = (updates as any).processes;

      if (shouldRecalculate) {
        const mergedDesign = { ...existingDesign, ...updates };
        updateData.totalCost = this.calculateTotalCost(mergedDesign);
        console.log(`Recalculated totalCost for design ${id}: ${formatCurrency(updateData.totalCost)}`);
      }

      const { error } = await getServiceSupabase().from(this.TABLE_NAME).update(updateData).eq("id", id);
      if (error) throw error;
      console.log("Design updated successfully:", id);
    } catch (error) {
      console.error("Error updating design:", error);
      throw new Error(`Failed to update design: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async deleteDesign(id: string): Promise<void> {
    try {
      const { error } = await getServiceSupabase().from(this.TABLE_NAME).delete().eq("id", id);
      if (error) throw error;
      console.log("Design deleted:", id);
    } catch (error) {
      console.error("Error deleting design:", error);
      throw new Error("Failed to delete design");
    }
  }

  static async getDesignStats(): Promise<DesignStats> {
    try {
      const { data: rows, error } = await getServiceSupabase().from(this.TABLE_NAME).select("*");
      if (error) throw error;
      const designs = (rows || []) as Design[];

      const activeDesigns = designs.filter(d => d.status === 'active');

      const stats: DesignStats = {
        totalDesigns: designs.length,
        activeDesigns: activeDesigns.length,
        inactiveDesigns: designs.filter(d => d.status === 'inactive').length,
        discontinuedDesigns: designs.filter(d => d.status === 'discontinued').length,
        averageCost: activeDesigns.reduce((sum, d) => sum + d.totalCost, 0) / activeDesigns.length || 0,
        totalCostValue: activeDesigns.reduce((sum, d) => sum + d.totalCost, 0),
        categoryBreakdown: {}
      };

      designs.forEach(design => {
        stats.categoryBreakdown[design.category] = (stats.categoryBreakdown[design.category] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error("Error fetching design stats:", error);
      throw new Error("Failed to fetch design statistics");
    }
  }

  static async importFromProducts(): Promise<{ imported: number; updated: number; skipped: number; errors: string[] }> {
    try {
      console.log("Starting import of designs from products collection...");
      
      const { data: products, error: prodErr } = await getServiceSupabase().from(TABLES.PRODUCTS)
        .select("*")
        .eq("isActive", true);
      if (prodErr) throw prodErr;

      console.log(`Found ${products?.length || 0} products to import`);

      console.log("Fetching existing designs for duplicate check...");
      const { data: existingDesigns, error: existErr } = await getServiceSupabase().from(this.TABLE_NAME).select("*");
      if (existErr) throw existErr;

      console.log(`Found ${existingDesigns?.length || 0} existing designs`);

      const byProductId = new Map<string, any>();
      const byNameCategory = new Map<string, any>();
      
      (existingDesigns || []).forEach((design: any) => {
        if (design.productId) {
          byProductId.set(design.productId, design);
        }
        const nameLower = (design.name_lower || (design.name || "").trim().toLowerCase());
        const categoryLower = (design.category_lower || (design.category || "").trim().toLowerCase());
        const key = `${nameLower}|||${categoryLower}`;
        if (!byNameCategory.has(key)) {
          byNameCategory.set(key, design);
        }
      });

      let imported = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const product of (products || [])) {
        try {
          const designData: Omit<Design, "id" | "createdAt" | "updatedAt"> = {
            name: product.name || "Unnamed Design",
            description: product.description || "",
            category: product.category || "General",
            subcategory: product.subcategory || "",
            image: product.image || "",
            images: product.images || [],
            materialCost: product.basePrice ? product.basePrice * 0.15 : 150,
            laborCost: product.basePrice ? product.basePrice * 0.1 : 100,
            overheadCost: product.basePrice ? product.basePrice * 0.05 : 50,
            totalCost: 0,
            manufacturingTime: 2,
            complexity: 'medium',
            materials: [],
            processes: [],
            status: 'active',
            createdBy: 'system-import',
            updatedBy: 'system-import',
            tags: product.tags || [],
            notes: `Imported from product: ${product.id}`,
            variants: []
          };
          (designData as any).productId = product.id;

          designData.totalCost = this.calculateTotalCost(designData);
          const now = new Date().toISOString();
          const payload = {
            name: designData.name,
            description: designData.description || null,
            category: designData.category || "General",
            subcategory: designData.subcategory || null,
            image: designData.image || null,
            images: designData.images || [],
            material_cost: designData.materialCost || 0,
            labor_cost: designData.laborCost || 0,
            overhead_cost: designData.overheadCost || 0,
            manufacturing_time: designData.manufacturingTime || 2,
            total_cost: this.calculateTotalCost(designData),
            size_costs: SizeCostService.generateSizeCosts(designData as Design),
            complexity: designData.complexity || "medium",
            status: designData.status || "active",
            created_by: designData.createdBy || "system-import",
            updated_by: designData.updatedBy || "system-import",
            tags: designData.tags || [],
            notes: designData.notes || null,
            variants: designData.variants || [],
            product_id: (designData as any).productId || null,
            materials: designData.materials || [],
            processes: designData.processes || [],
            size_configurations: designData.sizeConfigurations || [],
            size_ranges: designData.sizeRanges || [],
            default_size_multipliers: designData.defaultSizeMultipliers || {},
            name_lower: (designData.name || "").trim().toLowerCase(),
            category_lower: (designData.category || "").trim().toLowerCase(),
          };

          let existingDesign = byProductId.get(product.id as string);
          let duplicateReason = "";
          
          if (!existingDesign) {
            const key = `${payload.name_lower}|||${payload.category_lower}`;
            existingDesign = byNameCategory.get(key);
            if (existingDesign) {
              duplicateReason = `duplicate name+category: "${designData.name}" in "${designData.category}"`;
            }
          } else {
            duplicateReason = `duplicate productId: "${product.id}"`;
          }

          if (existingDesign) {
            if (existingDesign.id) {
              const { error: updErr } = await getServiceSupabase().from(this.TABLE_NAME)
                .upsert({ id: existingDesign.id, ...payload }, { onConflict: "id" });
              if (!updErr) updated++;
              if (duplicateReason && !duplicateReason.includes("productId")) {
                console.log(`  ⚠️  Product "${product.name}" (${product.id}): ${duplicateReason} - updating existing design`);
              }
            }
          } else {
            const newId = crypto.randomUUID();
            const { error: insErr } = await getServiceSupabase().from(this.TABLE_NAME)
              .insert({ id: newId, ...payload });
            if (!insErr) {
              imported++;
              byProductId.set(product.id as string, { id: newId, ...payload } as any);
              const key = `${payload.name_lower}|||${payload.category_lower}`;
              byNameCategory.set(key, { id: newId, ...payload } as any);
            }
          }
        } catch (error) {
          console.error(`Error importing product ${(product as any).id}:`, error);
          errors.push(`Product ${(product as any).id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const skipped = (products || []).length - imported - updated - errors.length;
      console.log(`Successfully imported ${imported} new designs, updated ${updated} existing designs`);
      if (skipped > 0) {
        console.log(`⚠️  ${skipped} products skipped (likely duplicates in source or missing data)`);
      }
      if (errors.length > 0) {
        console.log(`❌ ${errors.length} errors encountered`);
      }
      console.log(`📊 Summary: ${imported + updated} total designs processed out of ${products?.length || 0} products`);

      return { imported, updated, skipped, errors };
    } catch (error) {
      console.error("Error importing designs:", error);
      throw new Error("Failed to import designs from products");
    }
  }

  private static calculateTotalCost(design: Partial<Design>): number {
    const materialCost = design.materialCost || 0;
    const laborCostPerHour = design.laborCost || 0;
    const manufacturingTime = design.manufacturingTime || 0;
    const overheadCost = design.overheadCost || 0;
    const totalLaborCost = laborCostPerHour * manufacturingTime;
    return materialCost + totalLaborCost + overheadCost;
  }

  static async migrateToSizeCosts(designId: string): Promise<boolean> {
    try {
      const design = await this.getDesign(designId);
      if (!design) return false;

      const sizeCosts = SizeCostService.generateSizeCosts(design);
      const { error } = await getServiceSupabase().from(this.TABLE_NAME).update({
        size_costs: sizeCosts,
        updated_at: new Date().toISOString()
      }).eq("id", designId);
      if (error) throw error;
      console.log(`Migrated design ${designId} to per-size costs`);
      return true;
    } catch (error) {
      console.error("Error migrating design to size costs:", error);
      return false;
    }
  }

  static async updateSizeCost(
    designId: string,
    size: string,
    costs: { materialCost?: number; laborCostPerHour?: number; manufacturingTime?: number; overheadCost?: number }
  ): Promise<boolean> {
    try {
      const design = await this.getDesign(designId);
      if (!design) return false;

      const current = design.sizeCosts?.[size] || {
        materialCost: design.materialCost,
        laborCostPerHour: design.laborCost,
        manufacturingTime: design.manufacturingTime,
        overheadCost: design.overheadCost,
        totalCost: 0
      };

      const updated = {
        materialCost: costs.materialCost ?? current.materialCost,
        laborCostPerHour: costs.laborCostPerHour ?? current.laborCostPerHour,
        manufacturingTime: costs.manufacturingTime ?? current.manufacturingTime,
        overheadCost: costs.overheadCost ?? current.overheadCost,
        totalCost: 0
      };
      updated.totalCost = updated.materialCost + (updated.laborCostPerHour * updated.manufacturingTime) + updated.overheadCost;

      const sizeCosts = { ...design.sizeCosts, [size]: updated };
      const { error } = await getServiceSupabase().from(this.TABLE_NAME).update({
        size_costs: sizeCosts,
        updated_at: new Date().toISOString()
      }).eq("id", designId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Error updating size cost for ${size}:`, error);
      return false;
    }
  }

  static async migrateAllToSizeCosts(): Promise<{ migrated: number; skipped: number }> {
    const { data: rows, error } = await getServiceSupabase().from(this.TABLE_NAME).select("*");
    if (error) throw error;
    let migrated = 0;
    let skipped = 0;

    for (const row of (rows || [])) {
      if (!row.size_costs && !row.sizeCosts) {
        const design = { ...row } as Design;
        const sizeCosts = SizeCostService.generateSizeCosts(design);
        await getServiceSupabase().from(this.TABLE_NAME).update({ size_costs: sizeCosts, updated_at: new Date().toISOString() }).eq("id", row.id);
        migrated++;
      } else {
        skipped++;
      }
    }
    console.log(`Migrated ${migrated} designs to per-size costs, ${skipped} already had them`);
    return { migrated, skipped };
  }

  static async getCategories(): Promise<string[]> {
    try {
      const { data: rows, error } = await getServiceSupabase().from(this.TABLE_NAME).select("category");
      if (error) throw error;
      const categories = new Set<string>();
      (rows || []).forEach((row: any) => {
        if (row.category) {
          categories.add(row.category);
        }
      });
      return Array.from(categories).sort();
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  }

  static async getSubcategories(category: string): Promise<string[]> {
    try {
      const { data: rows, error } = await getServiceSupabase().from(this.TABLE_NAME)
        .select("subcategory")
        .eq("category", category);
      if (error) throw error;
      
      const subcategories = new Set<string>();
      (rows || []).forEach((row: any) => {
        if (row.subcategory) {
          subcategories.add(row.subcategory);
        }
      });
      return Array.from(subcategories).sort();
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      return [];
    }
  }

  static async getMaterialRequirements(designId: string, quantity: number = 1): Promise<MaterialRequirement[]> {
    try {
      const design = await this.getDesign(designId);
      if (!design) {
        throw new Error("Design not found");
      }

      const materialRequirements: MaterialRequirement[] = [];

      for (const material of design.materials) {
        if (material.inventoryItemId) {
          const { data: inventoryData, error } = await getServiceSupabase().from(TABLES.INVENTORY_ITEMS)
            .select("*")
            .eq("id", material.inventoryItemId)
            .single();

          if (!error && inventoryData) {
            const requiredQuantity = material.quantityPerUnit * quantity;
            const availableQuantity = inventoryData.quantity_on_hand || 0;
            const costPerUnit = inventoryData.cost_per_unit || material.costPerUnit;

            materialRequirements.push({
              inventoryItemId: material.inventoryItemId,
              inventoryItemName: material.inventoryItemName || material.name,
              inventoryItemSku: material.inventoryItemSku || '',
              requiredQuantity,
              unit: material.unit,
              costPerUnit,
              totalCost: requiredQuantity * costPerUnit,
              availableQuantity,
              isAvailable: availableQuantity >= requiredQuantity
            });
          }
        }
      }

      return materialRequirements;
    } catch (error) {
      console.error("Error getting material requirements:", error);
      throw new Error("Failed to get material requirements");
    }
  }

  static async checkMaterialAvailability(designId: string, quantity: number = 1): Promise<{
    isAvailable: boolean;
    unavailableMaterials: MaterialRequirement[];
    totalCost: number;
  }> {
    try {
      const requirements = await this.getMaterialRequirements(designId, quantity);
      
      const unavailableMaterials = requirements.filter(req => !req.isAvailable);
      const totalCost = requirements.reduce((sum, req) => sum + req.totalCost, 0);

      return {
        isAvailable: unavailableMaterials.length === 0,
        unavailableMaterials,
        totalCost
      };
    } catch (error) {
      console.error("Error checking material availability:", error);
      throw new Error("Failed to check material availability");
    }
  }
}
