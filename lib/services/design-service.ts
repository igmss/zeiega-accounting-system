import { db, COLLECTIONS } from "../firebase";
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
  private static readonly COLLECTION_NAME = COLLECTIONS.DESIGNS;

  /**
   * Get all designs with optional filtering and pagination
   */
  static async getDesigns(
    filter?: DesignFilter,
    lastDocId?: string,
    pageSize: number = 50
  ): Promise<{ designs: Design[]; lastDoc?: any; hasMore: boolean }> {
    try {
      console.log("DesignService.getDesigns called with:", { filter, lastDocId, pageSize });
      console.log("Collection name:", this.COLLECTION_NAME);
      
      let query = db.collection(this.COLLECTION_NAME).orderBy("createdAt", "desc").limit(pageSize);

      // Apply filters
      if (filter?.category) {
        query = query.where("category", "==", filter.category);
      }
      if (filter?.subcategory) {
        query = query.where("subcategory", "==", filter.subcategory);
      }
      if (filter?.status) {
        query = query.where("status", "==", filter.status);
      }
      if (filter?.complexity) {
        query = query.where("complexity", "==", filter.complexity);
      }

      // Add pagination
      if (lastDocId) {
        const lastDoc = await db.collection(this.COLLECTION_NAME).doc(lastDocId).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.get();
      console.log("Query executed successfully, found", snapshot.docs.length, "documents");
      
      const designs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt || new Date())
        };
      }) as Design[];

      // Apply client-side filters for cost ranges
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
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize
      };
    } catch (error) {
      console.error("Error fetching designs:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`Failed to fetch designs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a single design by ID
   */
  static async getDesign(id: string): Promise<Design | null> {
    try {
      const docRef = db.collection(this.COLLECTION_NAME).doc(id);
      const docSnap = await docRef.get();
      
          if (docSnap.exists) {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              ...data,
              createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : (data?.createdAt || new Date()),
              updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : (data?.updatedAt || new Date())
            } as Design;
          }
      return null;
    } catch (error) {
      console.error("Error fetching design:", error);
      throw new Error("Failed to fetch design");
    }
  }

  /**
   * Create a new design
   */
  static async createDesign(designData: Omit<Design, "id" | "createdAt" | "updatedAt">): Promise<string> {
    try {
      const now = new Date();
      // Duplicate prevention: check by productId if present, else by normalized name+category
      if ((designData as any).productId) {
        const dupByProduct = await db.collection(this.COLLECTION_NAME)
          .where("productId", "==", (designData as any).productId)
          .limit(1)
          .get();
        if (!dupByProduct.empty) {
          const id = dupByProduct.docs[0].id;
          console.log("Design already exists by productId, returning existing ID:", id);
          return id;
        }
      } else {
        const nameLower = (designData.name || "").trim().toLowerCase();
        const categoryLower = (designData.category || "").trim().toLowerCase();
        if (nameLower) {
          const dupByName = await db.collection(this.COLLECTION_NAME)
            .where("name_lower", "==", nameLower)
            .where("category_lower", "==", categoryLower)
            .limit(1)
            .get();
          if (!dupByName.empty) {
            const id = dupByName.docs[0].id;
            console.log("Design already exists by name+category, returning existing ID:", id);
            return id;
          }
        }
      }
      const designDoc = {
        ...designData,
        totalCost: this.calculateTotalCost(designData),
        createdAt: now,
        updatedAt: now,
        // store normalized fields to enable fast duplicate lookups
        name_lower: (designData.name || "").trim().toLowerCase(),
        category_lower: (designData.category || "").trim().toLowerCase()
      };

      const docRef = await db.collection(this.COLLECTION_NAME).add(designDoc);
      console.log("Design created with ID:", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("Error creating design:", error);
      throw new Error("Failed to create design");
    }
  }

  /**
   * Update an existing design
   */
  static async updateDesign(id: string, updates: Partial<Omit<Design, "id" | "createdAt" | "updatedAt">>): Promise<void> {
    try {
      const docRef = db.collection(this.COLLECTION_NAME).doc(id);
      
      // Fetch existing design to prevent cost corruption on partial updates
      const existingDesign = await this.getDesign(id);
      if (!existingDesign) {
        throw new Error("Design not found");
      }

      // Check if any cost-related fields are being updated
      const costFields: Array<keyof Design> = [
        'materialCost', 
        'laborCost', 
        'overheadCost', 
        'manufacturingTime'
      ];
      const shouldRecalculate = costFields.some(field => field in updates);
      
      const updateData: any = {
        ...updates,
        updatedAt: new Date()
      };

      if (shouldRecalculate) {
        // Merge with existing data for comprehensive cost calculation
        const mergedDesign = { ...existingDesign, ...updates };
        updateData.totalCost = this.calculateTotalCost(mergedDesign);
        console.log(`Recalculated totalCost for design ${id}: EGP ${updateData.totalCost}`);
      }

      await docRef.update(updateData);
      console.log("Design updated successfully:", id);
    } catch (error) {
      console.error("Error updating design:", error);
      throw new Error(`Failed to update design: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a design
   */
  static async deleteDesign(id: string): Promise<void> {
    try {
      const docRef = db.collection(this.COLLECTION_NAME).doc(id);
      await docRef.delete();
      console.log("Design deleted:", id);
    } catch (error) {
      console.error("Error deleting design:", error);
      throw new Error("Failed to delete design");
    }
  }

  /**
   * Get design statistics
   */
  static async getDesignStats(): Promise<DesignStats> {
    try {
      const snapshot = await db.collection(this.COLLECTION_NAME).get();
      const designs = snapshot.docs.map(doc => doc.data()) as Design[];

      const stats: DesignStats = {
        totalDesigns: designs.length,
        activeDesigns: designs.filter(d => d.status === 'active').length,
        inactiveDesigns: designs.filter(d => d.status === 'inactive').length,
        discontinuedDesigns: designs.filter(d => d.status === 'discontinued').length,
        averageCost: designs.reduce((sum, d) => sum + d.totalCost, 0) / designs.length || 0,
        totalCostValue: designs.reduce((sum, d) => sum + (d.totalCost * 10), 0), // Assuming 10 units average
        categoryBreakdown: {}
      };

      // Calculate category breakdown
      designs.forEach(design => {
        stats.categoryBreakdown[design.category] = (stats.categoryBreakdown[design.category] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error("Error fetching design stats:", error);
      throw new Error("Failed to fetch design statistics");
    }
  }

  /**
   * Import designs from main website products collection
   */
  static async importFromProducts(): Promise<{ imported: number; updated: number; skipped: number; errors: string[] }> {
    try {
      console.log("Starting import of designs from products collection...");
      
      // Fetch active products from main website
      const productsSnapshot = await db.collection(COLLECTIONS.PRODUCTS)
        .where("isActive", "==", true)
        .get();
      const products = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any));

      console.log(`Found ${products.length} products to import`);

      // Pre-fetch ALL existing designs once for fast duplicate checking
      console.log("Fetching existing designs for duplicate check...");
      const existingDesignsSnapshot = await db.collection(this.COLLECTION_NAME).get();
      const existingDesigns = existingDesignsSnapshot.docs.map(doc => ({
        id: doc.id,
        ref: doc.ref,
        ...doc.data()
      } as any));

      console.log(`Found ${existingDesigns.length} existing designs`);

      // Build lookup maps for fast duplicate detection
      const byProductId = new Map<string, any>();
      const byNameCategory = new Map<string, any>();
      
      existingDesigns.forEach((design: any) => {
        // Map by productId (most reliable)
        if ((design as any).productId) {
          byProductId.set((design as any).productId, design);
        }
        
        // Map by normalized name+category (handle both normalized fields and original fields)
        const nameLower = (design.name_lower || (design.name || "").trim().toLowerCase());
        const categoryLower = (design.category_lower || (design.category || "").trim().toLowerCase());
        const key = `${nameLower}|||${categoryLower}`;
        if (!byNameCategory.has(key)) {
          byNameCategory.set(key, design);
        }
      });

      const batch = db.batch();
      let imported = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const product of products) {
        try {
          // Convert product to design format
          const designData: Omit<Design, "id" | "createdAt" | "updatedAt"> = {
            name: product.name || "Unnamed Design",
            description: product.description || "",
            category: product.category || "General",
            subcategory: product.subcategory || "",
            image: product.image || "",
            images: product.images || [],
            
            // Default cost configuration (to be updated manually)
            materialCost: product.basePrice ? product.basePrice * 0.15 : 150,
            laborCost: product.basePrice ? product.basePrice * 0.1 : 100,
            overheadCost: product.basePrice ? product.basePrice * 0.05 : 50,
            totalCost: 0, // Will be calculated
            
            // Manufacturing details
            manufacturingTime: 2, // Default 2 hours
            complexity: 'medium',
            materials: [],
            processes: [],
            
            // Status
            status: 'active',
            createdBy: 'system-import',
            updatedBy: 'system-import',
            
            // Additional fields
            tags: product.tags || [],
            notes: `Imported from product: ${product.id}`,
            variants: []
          };
          // include productId for exact mapping
          (designData as any).productId = product.id;

          // Calculate total cost
          designData.totalCost = this.calculateTotalCost(designData);
          const payload = {
            ...designData,
            name_lower: (designData.name || "").trim().toLowerCase(),
            category_lower: (designData.category || "").trim().toLowerCase(),
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Fast duplicate check using pre-built maps (no database queries in loop!)
          let existingDesign = byProductId.get(product.id);
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
            // This is either an existing design from DB or a duplicate within the same import batch
            if (existingDesign.ref) {
              // Update existing design (merge to preserve manual cost edits)
              batch.set(existingDesign.ref, payload, { merge: true });
              updated++;
              if (duplicateReason && !duplicateReason.includes("productId")) {
                // Only log if it's not a productId duplicate (those are expected from database)
                console.log(`  ⚠️  Product "${product.name}" (${product.id}): ${duplicateReason} - updating existing design`);
              }
            }
          } else {
            // Create new design
            const designRef = db.collection(this.COLLECTION_NAME).doc();
            batch.set(designRef, payload);
            imported++;
            
            // Add to lookup maps for future checks in this batch (to prevent duplicates within same import)
            byProductId.set(product.id, { id: designRef.id, ref: designRef, ...payload } as any);
            const key = `${payload.name_lower}|||${payload.category_lower}`;
            byNameCategory.set(key, { id: designRef.id, ref: designRef, ...payload } as any);
          }
        } catch (error) {
          console.error(`Error importing product ${product.id}:`, error);
          errors.push(`Product ${product.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await batch.commit();
      const skipped = products.length - imported - updated - errors.length;
      console.log(`Successfully imported ${imported} new designs, updated ${updated} existing designs`);
      if (skipped > 0) {
        console.log(`⚠️  ${skipped} products skipped (likely duplicates in source or missing data)`);
      }
      if (errors.length > 0) {
        console.log(`❌ ${errors.length} errors encountered`);
      }
      console.log(`📊 Summary: ${imported + updated} total designs processed out of ${products.length} products`);

      return { imported, updated, skipped, errors };
    } catch (error) {
      console.error("Error importing designs:", error);
      throw new Error("Failed to import designs from products");
    }
  }

  /**
   * Calculate total cost for a design
   */
  private static calculateTotalCost(design: Partial<Design>): number {
    const materialCost = design.materialCost || 0;
    const laborCostPerHour = design.laborCost || 0;
    const manufacturingTime = design.manufacturingTime || 0;
    const overheadCost = design.overheadCost || 0;
    
    // Labor cost = cost per hour × manufacturing time
    const totalLaborCost = laborCostPerHour * manufacturingTime;
    
    return materialCost + totalLaborCost + overheadCost;
  }


  /**
   * Get categories for filtering
   */
  static async getCategories(): Promise<string[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION_NAME).get();
      const categories = new Set<string>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.category) {
          categories.add(data.category);
        }
      });

      return Array.from(categories).sort();
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  }

  /**
   * Get subcategories for a given category
   */
  static async getSubcategories(category: string): Promise<string[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION_NAME)
        .where("category", "==", category)
        .get();
      
      const subcategories = new Set<string>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.subcategory) {
          subcategories.add(data.subcategory);
        }
      });

      return Array.from(subcategories).sort();
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      return [];
    }
  }

  /**
   * Get material requirements for a design (for work order creation)
   */
  static async getMaterialRequirements(designId: string, quantity: number = 1): Promise<MaterialRequirement[]> {
    try {
      const design = await this.getDesign(designId);
      if (!design) {
        throw new Error("Design not found");
      }

      const materialRequirements: MaterialRequirement[] = [];

      for (const material of design.materials) {
        if (material.inventoryItemId) {
          // Get current inventory data
          const inventoryDoc = await db.collection(COLLECTIONS.INVENTORY_ITEMS)
            .doc(material.inventoryItemId)
            .get();

          if (inventoryDoc.exists) {
            const inventoryData = inventoryDoc.data();
            const requiredQuantity = material.quantityPerUnit * quantity;
            const availableQuantity = inventoryData?.quantity_on_hand || 0;
            const costPerUnit = inventoryData?.cost_per_unit || material.costPerUnit;

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

  /**
   * Check if materials are available for a design
   */
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
