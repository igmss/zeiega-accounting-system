import { supabase, TABLES, getServiceSupabase } from "../supabase"

export interface Vendor {
    id: string
    name: string
    contact_name?: string
    email?: string
    phone?: string
    address?: string
    payment_terms?: string
    lead_time_days?: number
    rating?: number
    notes?: string
    status: "active" | "inactive"
    total_orders?: number
    total_amount?: number
    last_order_date?: string
    created_at: string
    updated_at: string
}

export interface VendorFilter {
    status?: "active" | "inactive"
    search?: string
    minRating?: number
}

export class VendorService {

    static async createVendor(
        data: Omit<Vendor, "id" | "created_at" | "updated_at" | "total_orders" | "total_amount">
    ): Promise<{ success: boolean; vendorId?: string; error?: string }> {
        try {
            const now = new Date().toISOString()
            const vendorId = `VND-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`

            const vendor: Vendor = {
                ...data,
                id: vendorId,
                total_orders: 0,
                total_amount: 0,
                created_at: now,
                updated_at: now,
            }

            const { error } = await getServiceSupabase().from(TABLES.VENDORS).insert(vendor)
            if (error) throw error

            console.log(`✅ Created vendor ${vendor.name} (${vendorId})`)
            return { success: true, vendorId }
        } catch (error) {
            console.error("Error creating vendor:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to create vendor" }
        }
    }

    static async getVendor(vendorId: string): Promise<Vendor | null> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.VENDORS).select("*").eq("id", vendorId).single()
            if (error || !data) return null
            return data as Vendor
        } catch (error) {
            console.error("Error getting vendor:", error)
            return null
        }
    }

    static async getAllVendors(filter?: VendorFilter): Promise<Vendor[]> {
        try {
            let query = getServiceSupabase().from(TABLES.VENDORS).select("*")

            if (filter?.status) {
                query = query.eq("status", filter.status)
            }
            if (filter?.minRating) {
                query = query.gte("rating", filter.minRating)
            }

            const { data, error } = await query
            if (error) throw error
            let vendors = (data || []) as Vendor[]

            if (filter?.search) {
                const searchLower = filter.search.toLowerCase()
                vendors = vendors.filter((v: Vendor) =>
                    v.name.toLowerCase().includes(searchLower) ||
                    v.contact_name?.toLowerCase().includes(searchLower) ||
                    v.email?.toLowerCase().includes(searchLower)
                )
            }

            return vendors.sort((a: Vendor, b: Vendor) => {
                const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
                const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
                return bTime - aTime
            })
        } catch (error) {
            console.error("Error getting vendors:", error)
            return []
        }
    }

    static async updateVendor(
        vendorId: string,
        updates: Partial<Omit<Vendor, "id" | "created_at">>
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const existing = await this.getVendor(vendorId)
            if (!existing) {
                return { success: false, error: "Vendor not found" }
            }

            const { error } = await getServiceSupabase().from(TABLES.VENDORS).update({
                ...updates,
                updated_at: new Date().toISOString()
            }).eq("id", vendorId)
            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error("Error updating vendor:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to update vendor" }
        }
    }

    static async recordOrder(vendorId: string, amount: number): Promise<void> {
        try {
            const vendor = await this.getVendor(vendorId)
            if (!vendor) return

            const { error } = await getServiceSupabase().from(TABLES.VENDORS).update({
                total_orders: (vendor.total_orders || 0) + 1,
                total_amount: (vendor.total_amount || 0) + amount,
                last_order_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq("id", vendorId)
            if (error) console.error("Error recording vendor order:", error)
        } catch (error) {
            console.error("Error recording vendor order:", error)
        }
    }

    static async deactivateVendor(vendorId: string): Promise<{ success: boolean; error?: string }> {
        return this.updateVendor(vendorId, { status: "inactive" })
    }

    static async getVendorStats(): Promise<{
        total: number
        active: number
        inactive: number
        totalOrdersValue: number
    }> {
        try {
            const allVendors = await this.getAllVendors()

            return {
                total: allVendors.length,
                active: allVendors.filter(v => v.status === "active").length,
                inactive: allVendors.filter(v => v.status === "inactive").length,
                totalOrdersValue: allVendors.reduce((sum, v) => sum + (v.total_amount || 0), 0)
            }
        } catch (error) {
            console.error("Error getting vendor stats:", error)
            return { total: 0, active: 0, inactive: 0, totalOrdersValue: 0 }
        }
    }
}
