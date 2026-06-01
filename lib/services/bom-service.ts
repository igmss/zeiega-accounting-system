import { supabase, TABLES, getServiceSupabase } from "../supabase"

export interface BOMItem {
    material_id: string
    material_name: string
    quantity: number
    unit: string
    unit_cost: number
    total_cost: number
    waste_factor: number
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
    created_at: string
    updated_at: string
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

const BOM_TABLE = TABLES.BOM

export class BOMService {

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
            const { data: designData, error: designErr } = await getServiceSupabase().from(TABLES.DESIGNS).select("*").eq("id", designId).single()
            if (designErr || !designData) {
                return { success: false, error: `Design ${designId} not found` }
            }

            const designName = (designData as any).name || "Unknown Design"

            const processedItems: BOMItem[] = items.map(item => {
                const wf = Number(item.waste_factor) || 0
                const qty = Number(item.quantity) || 0
                const uc = Number(item.unit_cost) || 0
                const quantityWithWaste = qty * (1 + wf)
                const totalCost = quantityWithWaste * uc
                return {
                    ...item,
                    waste_factor: wf,
                    quantity: qty,
                    unit_cost: uc,
                    total_cost: isNaN(totalCost) ? 0 : totalCost
                }
            })

            const lh = Number(laborHours) || 0
            const lr = Number(laborRate) || 0
            const op = Number(overheadPercentage) || 0
            const totalMaterialCost = processedItems.reduce((sum, item) => sum + item.total_cost, 0)
            const totalLaborCost = lh * lr
            const totalOverheadCost = (totalMaterialCost + totalLaborCost) * (op / 100)
            const totalCost = totalMaterialCost + totalLaborCost + totalOverheadCost

            const now = new Date().toISOString()

            const bomData = {
                design_id: designId,
                design_name: designName,
                name,
                version: "1.0",
                items: processedItems as any,
                labor_hours: laborHours,
                labor_rate: laborRate,
                labor_cost: totalLaborCost,
                overhead_percentage: overheadPercentage,
                total_material_cost: totalMaterialCost,
                total_labor_cost: totalLaborCost,
                total_overhead_cost: totalOverheadCost,
                total_cost: totalCost,
                notes: notes || null,
                status: "draft",
                created_at: now,
                updated_at: now,
            }

            const { data: inserted, error } = await getServiceSupabase().from(BOM_TABLE).insert(bomData).select("id").single()
            if (error) throw error

            console.log(`Created BOM ${inserted.id} for design ${designName}`)
            return { success: true, bomId: inserted.id }

        } catch (error) {
            console.error("Error creating BOM:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create BOM"
            }
        }
    }

    static async getBOM(bomId: string): Promise<BOM | null> {
        try {
            const { data, error } = await getServiceSupabase().from(BOM_TABLE).select("*").eq("id", bomId).single()
            if (error || !data) return null
            return data as BOM
        } catch (error) {
            console.error("Error getting BOM:", error)
            return null
        }
    }

    static async getActiveBOMForDesign(designId: string): Promise<BOM | null> {
        try {
            const { data, error } = await getServiceSupabase().from(BOM_TABLE)
                .select("*")
                .eq("design_id", designId)
                .eq("status", "active")
                .limit(1)
                .maybeSingle()

            if (error || !data) return null
            return data as BOM
        } catch (error) {
            console.error("Error getting BOM for design:", error)
            return null
        }
    }

    static async getAllBOMs(options?: {
        designId?: string
        status?: "draft" | "active" | "archived"
        limit?: number
    }): Promise<BOM[]> {
        try {
            let query = getServiceSupabase().from(BOM_TABLE).select("*")

            if (options?.designId) {
                query = query.eq("design_id", options.designId)
            }
            if (options?.status) {
                query = query.eq("status", options.status)
            }
            if (options?.limit) {
                query = query.limit(options.limit)
            }

            const { data, error } = await query
            if (error) throw error
            return (data || []) as BOM[]
        } catch (error) {
            console.error("Error getting BOMs:", error)
            return []
        }
    }

    static async updateBOM(
        bomId: string,
        updates: Partial<Omit<BOM, "id" | "created_at" | "created_by">>
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const existing = await this.getBOM(bomId)
            if (!existing) {
                return { success: false, error: "BOM not found" }
            }

            if (updates.items) {
                const processedItems: BOMItem[] = updates.items.map(item => {
                    const wf = Number(item.waste_factor) || 0
                    const qty = Number(item.quantity) || 0
                    const uc = Number(item.unit_cost) || 0
                    const quantityWithWaste = qty * (1 + wf)
                    const totalCost = quantityWithWaste * uc
                    return { ...item, waste_factor: wf, quantity: qty, unit_cost: uc, total_cost: isNaN(totalCost) ? 0 : totalCost }
                })

                updates.items = processedItems
                updates.total_material_cost = processedItems.reduce((sum, item) => sum + item.total_cost, 0)

                const laborHours = Number(updates.labor_hours ?? existing.labor_hours) || 0
                const laborRate = Number(updates.labor_rate ?? existing.labor_rate) || 0
                updates.total_labor_cost = laborHours * laborRate

                const overheadPct = Number(updates.overhead_percentage ?? existing.overhead_percentage) || 0
                updates.total_overhead_cost = (updates.total_material_cost + updates.total_labor_cost) * (overheadPct / 100)
                updates.total_cost = updates.total_material_cost + updates.total_labor_cost + updates.total_overhead_cost
            }

            const { error } = await (getServiceSupabase() as any).from(BOM_TABLE).update({
                ...updates,
                updated_at: new Date().toISOString()
            }).eq("id", bomId)
            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error("Error updating BOM:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to update BOM"
            }
        }
    }

    static async activateBOM(bomId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            const now = new Date().toISOString()
            const { data: existingActive } = await getServiceSupabase().from(BOM_TABLE)
                .select("id")
                .eq("design_id", bom.design_id)
                .eq("status", "active")

            for (const row of ((existingActive || []) as any[])) {
                await (getServiceSupabase() as any).from(BOM_TABLE).update({ status: "archived", updated_at: now }).eq("id", row.id)
            }

            const { error } = await (getServiceSupabase() as any).from(BOM_TABLE).update({
                status: "active",
                updated_at: now
            }).eq("id", bomId)
            if (error) throw error

            console.log(`✅ Activated BOM ${bomId}`)
            return { success: true }
        } catch (error) {
            console.error("Error activating BOM:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to activate BOM" }
        }
    }

    static async calculateMaterialRequirements(
        bomId: string,
        quantity: number
    ): Promise<{ success: boolean; requirements?: MaterialRequirement[]; totalCost?: number; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            const qty = Number(quantity) || 0
            const requirements: MaterialRequirement[] = []
            let totalCost = 0

            for (const item of bom.items) {
                const itemQty = Number(item.quantity) || 0
                const wf = Number(item.waste_factor) || 0
                const storedUnitCost = Number(item.unit_cost) || 0

                const { data: invData } = await getServiceSupabase()
                    .from(TABLES.INVENTORY_ITEMS)
                    .select("quantity_on_hand, cost_per_unit")
                    .eq("id", item.material_id)
                    .maybeSingle()

                const availableQty = Number(invData?.quantity_on_hand) || 0
                const liveUnitCost = Number(invData?.cost_per_unit) || 0
                const unitCost = liveUnitCost > 0 ? liveUnitCost : storedUnitCost

                const quantityNeeded = itemQty * qty
                const quantityWithWaste = quantityNeeded * (1 + wf)
                const itemCost = isNaN(quantityWithWaste * unitCost) ? 0 : quantityWithWaste * unitCost
                const shortage = Math.max(0, quantityWithWaste - availableQty)

                requirements.push({
                    material_id: item.material_id,
                    material_name: item.material_name,
                    quantity_needed: quantityNeeded,
                    quantity_with_waste: quantityWithWaste,
                    unit: item.unit,
                    unit_cost: unitCost,
                    total_cost: itemCost,
                    available_quantity: availableQty,
                    shortage
                })

                totalCost += itemCost
            }

            const laborHours = Number(bom.labor_hours) || 0
            const laborRate = Number(bom.labor_rate) || 0
            const laborCost = laborHours * qty * laborRate
            const overheadPct = Number(bom.overhead_percentage) || 0
            const overheadCost = (totalCost + laborCost) * (overheadPct / 100)
            totalCost = totalCost + laborCost + overheadCost

            return { success: true, requirements, totalCost }
        } catch (error) {
            console.error("Error calculating material requirements:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to calculate requirements" }
        }
    }

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

    static async deleteBOM(bomId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const bom = await this.getBOM(bomId)
            if (!bom) {
                return { success: false, error: "BOM not found" }
            }

            if (bom.status !== "draft") {
                return { success: false, error: "Can only delete draft BOMs" }
            }

            const { error } = await getServiceSupabase().from(BOM_TABLE).delete().eq("id", bomId)
            if (error) throw error
            return { success: true }
        } catch (error) {
            console.error("Error deleting BOM:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to delete BOM" }
        }
    }
}
