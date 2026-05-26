import { db, COLLECTIONS } from "../firebase"

// Add BOM collection to COLLECTIONS if not exists
const BOM_COLLECTION = "acc_bom"

export interface BOMItem {
    material_id: string
    material_name: string
    quantity: number
    unit: string
    unit_cost: number
    total_cost: number
    waste_factor: number // 0-1 representing 0-100%
    notes?: string
}

export interface BOM {
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
    created_at: Date
    updated_at: Date
    created_by: string
}

export interface MaterialRequirement {
    material_id: string
    material_name: string
    quantity_needed: number
    quantity_with_waste: number
    unit: string
    unit_cost: number
    total_cost: number
    available_quantity: number
    shortage: number
}

/**
 * Bill of Materials Management Service
 * Handles BOM creation, calculation, and material requirements planning
 */
export class BOMService {

    /**
     * Create a new Bill of Materials
     */
    static async createBOM(
        designId: string,
        name: string,
        items: Omit<BOMItem, "total_cost">[],
        laborHours: number,
        laborRate: number = 50,
        overheadPercentage: number = 15,
        notes?: string
    ): Promise<{ success: boolean; bomId?: string; error?: string }> {
        try {
            // Get design info
            const designDoc = await db.collection(COLLECTIONS.DESIGNS).doc(designId).get()
            if (!designDoc.exists) {
                return { success: false, error: `Design ${designId} not found` }
            }

            const designData = designDoc.data()
            const designName = designData?.name || "Unknown Design"

            // Calculate costs
            const processedItems: BOMItem[] = items.map(item => {
                const quantityWithWaste = item.quantity * (1 + item.waste_factor)
                const totalCost = quantityWithWaste * item.unit_cost
                return {
                    ...item,
                    total_cost: totalCost
                }
            })

            const totalMaterialCost = processedItems.reduce((sum, item) => sum + item.total_cost, 0)
            const totalLaborCost = laborHours * laborRate
            const totalOverheadCost = (totalMaterialCost + totalLaborCost) * (overheadPercentage / 100)
            const totalCost = totalMaterialCost + totalLaborCost + totalOverheadCost

            const now = new Date()
            const bomId = `BOM-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`

            const bom: BOM = {
                id: bomId,
                design_id: designId,
                design_name: designName,
                name,
                version: "1.0",
                items: processedItems,
                labor_hours: laborHours,
                labor_rate: laborRate,
                labor_cost: totalLaborCost,
                overhead_percentage: overheadPercentage,
                total_material_cost: totalMaterialCost,
                total_labor_cost: totalLaborCost,
                total_overhead_cost: totalOverheadCost,
                total_cost: totalCost,
                notes,
                status: "draft",
                created_at: now,
                updated_at: now,
                created_by: "system"
            }

            await db.collection(BOM_COLLECTION).doc(bomId).set(bom)

            console.log(`✅ Created BOM ${bomId} for design ${designName}`)
            return { success: true, bomId }

        } catch (error) {
            console.error("Error creating BOM:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create BOM"
            }
        }
    }

    /**
     * Get BOM by ID
     */
    static async getBOM(bomId: string): Promise<BOM | null> {
        try {
            const doc = await db.collection(BOM_COLLECTION).doc(bomId).get()
            if (!doc.exists) return null
            return doc.data() as BOM
        } catch (error) {
            console.error("Error getting BOM:", error)
            return null
        }
    }

    /**
     * Get active BOM for a design
     */
    static async getActiveBOMForDesign(designId: string): Promise<BOM | null> {
        try {
            const snapshot = await db.collection(BOM_COLLECTION)
                .where("design_id", "==", designId)
                .where("status", "==", "active")
                .limit(1)
                .get()

            if (snapshot.empty) return null
            return snapshot.docs[0].data() as BOM
        } catch (error) {
            console.error("Error getting BOM for design:", error)
            return null
        }
    }

    /**
     * Get all BOMs with optional filtering
     */
    static async getAllBOMs(options?: {
        designId?: string
        status?: "draft" | "active" | "archived"
        limit?: number
    }): Promise<BOM[]> {
        try {
            let query = db.collection(BOM_COLLECTION) as any

            if (options?.designId) {
                query = query.where("design_id", "==", options.designId)
            }
            if (options?.status) {
                query = query.where("status", "==", options.status)
            }
            if (options?.limit) {
                query = query.limit(options.limit)
            }

            const snapshot = await query.get()
            return snapshot.docs.map((doc: any) => doc.data() as BOM)
        } catch (error) {
            console.error("Error getting BOMs:", error)
            return []
        }
    }

    /**
     * Update BOM
     */
    static async updateBOM(
        bomId: string,
        updates: Partial<Omit<BOM, "id" | "created_at" | "created_by">>
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const existing = await this.getBOM(bomId)
            if (!existing) {
                return { success: false, error: "BOM not found" }
            }

            // Recalculate totals if items are updated
            if (updates.items) {
                const processedItems: BOMItem[] = updates.items.map(item => {
                    const quantityWithWaste = item.quantity * (1 + item.waste_factor)
                    const totalCost = quantityWithWaste * item.unit_cost
                    return { ...item, total_cost: totalCost }
                })

                updates.items = processedItems
                updates.total_material_cost = processedItems.reduce((sum, item) => sum + item.total_cost, 0)

                const laborHours = updates.labor_hours ?? existing.labor_hours
                const laborRate = updates.labor_rate ?? existing.labor_rate
                updates.total_labor_cost = laborHours * laborRate

                const overheadPct = updates.overhead_percentage ?? existing.overhead_percentage
                updates.total_overhead_cost = (updates.total_material_cost + updates.total_labor_cost) * (overheadPct / 100)
                updates.total_cost = updates.total_material_cost + updates.total_labor_cost + updates.total_overhead_cost
            }

            await db.collection(BOM_COLLECTION).doc(bomId).update({
                ...updates,
                updated_at: new Date()
            })

            return { success: true }
        } catch (error) {
            console.error("Error updating BOM:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to update BOM"
            }
        }
    }

    /**
     * Activate a BOM (archives other active BOMs for same design)
     */
    static async activateBOM(bomId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            // Archive any existing active BOMs for this design
            const existingActive = await db.collection(BOM_COLLECTION)
                .where("design_id", "==", bom.design_id)
                .where("status", "==", "active")
                .get()

            const batch = db.batch()

            for (const doc of existingActive.docs) {
                batch.update(doc.ref, { status: "archived", updated_at: new Date() })
            }

            // Activate this BOM
            batch.update(db.collection(BOM_COLLECTION).doc(bomId), {
                status: "active",
                updated_at: new Date()
            })

            await batch.commit()

            console.log(`✅ Activated BOM ${bomId}`)
            return { success: true }
        } catch (error) {
            console.error("Error activating BOM:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to activate BOM" }
        }
    }

    /**
     * Calculate material requirements for production
     */
    static async calculateMaterialRequirements(
        bomId: string,
        quantity: number
    ): Promise<{ success: boolean; requirements?: MaterialRequirement[]; totalCost?: number; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            const requirements: MaterialRequirement[] = []
            let totalCost = 0

            for (const item of bom.items) {
                // Get current inventory level
                const inventoryDoc = await db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(item.material_id).get()
                const availableQty = inventoryDoc.exists ? (inventoryDoc.data()?.quantity_on_hand || 0) : 0

                const quantityNeeded = item.quantity * quantity
                const quantityWithWaste = quantityNeeded * (1 + item.waste_factor)
                const itemCost = quantityWithWaste * item.unit_cost
                const shortage = Math.max(0, quantityWithWaste - availableQty)

                requirements.push({
                    material_id: item.material_id,
                    material_name: item.material_name,
                    quantity_needed: quantityNeeded,
                    quantity_with_waste: quantityWithWaste,
                    unit: item.unit,
                    unit_cost: item.unit_cost,
                    total_cost: itemCost,
                    available_quantity: availableQty,
                    shortage
                })

                totalCost += itemCost
            }

            // Add labor and overhead costs
            const laborCost = bom.labor_hours * quantity * bom.labor_rate
            const overheadCost = (totalCost + laborCost) * (bom.overhead_percentage / 100)
            totalCost = totalCost + laborCost + overheadCost

            return { success: true, requirements, totalCost }
        } catch (error) {
            console.error("Error calculating material requirements:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to calculate requirements" }
        }
    }

    /**
     * Check if materials are available for production
     */
    static async checkMaterialAvailability(
        bomId: string,
        quantity: number
    ): Promise<{
        available: boolean
        shortages: Array<{ material: string; needed: number; available: number; shortage: number }>
    }> {
        const result = await this.calculateMaterialRequirements(bomId, quantity)

        if (!result.success || !result.requirements) {
            return { available: false, shortages: [] }
        }

        const shortages = result.requirements
            .filter(r => r.shortage > 0)
            .map(r => ({
                material: r.material_name,
                needed: r.quantity_with_waste,
                available: r.available_quantity,
                shortage: r.shortage
            }))

        return {
            available: shortages.length === 0,
            shortages
        }
    }

    /**
     * Delete a BOM (only if draft status)
     */
    static async deleteBOM(bomId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            if (bom.status !== "draft") {
                return { success: false, error: "Can only delete draft BOMs" }
            }

            await db.collection(BOM_COLLECTION).doc(bomId).delete()
            return { success: true }
        } catch (error) {
            console.error("Error deleting BOM:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to delete BOM" }
        }
    }
}
