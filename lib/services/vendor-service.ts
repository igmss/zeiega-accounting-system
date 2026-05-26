import { db, COLLECTIONS } from "../firebase"



export interface Vendor {
    id: string
    name: string
    contact_name?: string
    email?: string
    phone?: string
    address?: string
    payment_terms?: string // e.g., "Net 30"
    lead_time_days?: number
    rating?: number // 1-5 stars
    notes?: string
    status: "active" | "inactive"
    total_orders?: number
    total_amount?: number
    last_order_date?: Date
    created_at: Date
    updated_at: Date
}

export interface VendorFilter {
    status?: "active" | "inactive"
    search?: string
    minRating?: number
}

/**
 * Vendor Management Service
 */
export class VendorService {

    /**
     * Create a new vendor
     */
    static async createVendor(
        data: Omit<Vendor, "id" | "created_at" | "updated_at" | "total_orders" | "total_amount">
    ): Promise<{ success: boolean; vendorId?: string; error?: string }> {
        try {
            const now = new Date()
            const vendorId = `VND-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`

            const vendor: Vendor = {
                ...data,
                id: vendorId,
                total_orders: 0,
                total_amount: 0,
                created_at: now,
                updated_at: now,
            }

            await db.collection(COLLECTIONS.VENDORS).doc(vendorId).set(vendor)

            console.log(`✅ Created vendor ${vendor.name} (${vendorId})`)
            return { success: true, vendorId }
        } catch (error) {
            console.error("Error creating vendor:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to create vendor" }
        }
    }

    /**
     * Get vendor by ID
     */
    static async getVendor(vendorId: string): Promise<Vendor | null> {
        try {
            const doc = await db.collection(COLLECTIONS.VENDORS).doc(vendorId).get()
            if (!doc.exists) return null
            return doc.data() as Vendor
        } catch (error) {
            console.error("Error getting vendor:", error)
            return null
        }
    }

    /**
     * Get all vendors with optional filtering
     */
    static async getAllVendors(filter?: VendorFilter): Promise<Vendor[]> {
        try {
            let query = db.collection(COLLECTIONS.VENDORS) as any

            if (filter?.status) {
                query = query.where("status", "==", filter.status)
            }
            if (filter?.minRating) {
                query = query.where("rating", ">=", filter.minRating)
            }

            const snapshot = await query.get()
            let vendors = snapshot.docs.map((doc: any) => doc.data() as Vendor)

            // Client-side search filter
            if (filter?.search) {
                const searchLower = filter.search.toLowerCase()
                vendors = vendors.filter((v: Vendor) =>
                    v.name.toLowerCase().includes(searchLower) ||
                    v.contact_name?.toLowerCase().includes(searchLower) ||
                    v.email?.toLowerCase().includes(searchLower)
                )
            }

            return vendors.sort((a: Vendor, b: Vendor) => {
                const aTime = a.updated_at instanceof Date ? a.updated_at.getTime() : 0
                const bTime = b.updated_at instanceof Date ? b.updated_at.getTime() : 0
                return bTime - aTime
            })
        } catch (error) {
            console.error("Error getting vendors:", error)
            return []
        }
    }

    /**
     * Update vendor
     */
    static async updateVendor(
        vendorId: string,
        updates: Partial<Omit<Vendor, "id" | "created_at">>
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const existing = await this.getVendor(vendorId)
            if (!existing) {
                return { success: false, error: "Vendor not found" }
            }

            await db.collection(COLLECTIONS.VENDORS).doc(vendorId).update({
                ...updates,
                updated_at: new Date()
            })

            return { success: true }
        } catch (error) {
            console.error("Error updating vendor:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to update vendor" }
        }
    }

    /**
     * Update vendor statistics (called when PO is completed)
     */
    static async recordOrder(vendorId: string, amount: number): Promise<void> {
        try {
            const vendor = await this.getVendor(vendorId)
            if (!vendor) return

            await db.collection(COLLECTIONS.VENDORS).doc(vendorId).update({
                total_orders: (vendor.total_orders || 0) + 1,
                total_amount: (vendor.total_amount || 0) + amount,
                last_order_date: new Date(),
                updated_at: new Date()
            })
        } catch (error) {
            console.error("Error recording vendor order:", error)
        }
    }

    /**
     * Deactivate vendor
     */
    static async deactivateVendor(vendorId: string): Promise<{ success: boolean; error?: string }> {
        return this.updateVendor(vendorId, { status: "inactive" })
    }

    /**
     * Get vendor statistics
     */
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
