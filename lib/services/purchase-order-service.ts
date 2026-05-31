import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { VendorService } from "./vendor-service"
import { EnhancedAccountingService, ACCOUNTS, JournalEntryType } from "./enhanced-accounting-service"

export interface PurchaseOrderItem {
    material_id: string
    material_name: string
    quantity: number
    unit: string
    unit_cost: number
    total_cost: number
    received_quantity?: number
}

export interface PurchaseOrder {
    id: string
    vendor_id: string
    vendor_name: string
    items: PurchaseOrderItem[]
    subtotal: number
    tax_amount: number
    shipping_cost: number
    total_amount: number
    expected_delivery?: string
    actual_delivery?: string
    shipping_address?: string
    notes?: string
    status: "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled"
    created_at: string
    updated_at: string
    created_by?: string | null
    approved_by?: string
    approved_at?: string
}

export interface GoodsReceipt {
    purchase_order_id: string
    items: Array<{
        material_id: string
        quantity_received: number
        actual_unit_cost?: number
    }>
    receipt_date: string
    notes?: string
}

export class PurchaseOrderService {

    static async createPurchaseOrder(
        vendorId: string,
        items: Omit<PurchaseOrderItem, "total_cost" | "received_quantity">[],
        options?: {
            expectedDelivery?: Date
            shippingAddress?: string
            shippingCost?: number
            taxRate?: number
            notes?: string
        }
    ): Promise<{ success: boolean; purchaseOrderId?: string; error?: string }> {
        try {
            const vendor = await VendorService.getVendor(vendorId)
            if (!vendor) {
                return { success: false, error: "Vendor not found" }
            }

            const processedItems: PurchaseOrderItem[] = items.map(item => ({
                ...item,
                total_cost: item.quantity * item.unit_cost,
                received_quantity: 0
            }))

            const subtotal = processedItems.reduce((sum, item) => sum + item.total_cost, 0)
            const taxRate = options?.taxRate ?? 0.14
            const taxAmount = subtotal * taxRate
            const shippingCost = options?.shippingCost ?? 0
            const totalAmount = subtotal + taxAmount + shippingCost

            const now = new Date().toISOString()

            const poData = {
                vendor_id: vendorId,
                vendor_name: vendor.name,
                items: processedItems as any,
                total_amount: totalAmount,
                expected_delivery: options?.expectedDelivery?.toISOString().split("T")[0] || null,
                shipping_address: options?.shippingAddress || null,
                notes: options?.notes || null,
                status: "draft" as const,
                created_at: now,
                updated_at: now,
            }

            const { data: inserted, error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS)
                .insert(poData).select("id").single()
            if (error) throw error

            console.log(`Created PO ${inserted.id} for vendor ${vendor.name} (${totalAmount} total)`)
            return { success: true, purchaseOrderId: inserted.id }
        } catch (error) {
            console.error("Error creating purchase order:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to create PO" }
        }
    }

    static async getPurchaseOrder(poId: string): Promise<PurchaseOrder | null> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).select("*").eq("id", poId).single()
            if (error || !data) return null
            return data as PurchaseOrder
        } catch (error) {
            console.error("Error getting PO:", error)
            return null
        }
    }

    static async getAllPurchaseOrders(options?: {
        vendorId?: string
        status?: PurchaseOrder["status"]
        limit?: number
    }): Promise<PurchaseOrder[]> {
        try {
            let query = getServiceSupabase().from(TABLES.PURCHASE_ORDERS).select("*")

            if (options?.vendorId) {
                query = query.eq("vendor_id", options.vendorId)
            }
            if (options?.status) {
                query = query.eq("status", options.status)
            }

            query = query.order("created_at", { ascending: false })

            if (options?.limit) {
                query = query.limit(options.limit)
            }

            const { data, error } = await query
            if (error) throw error
            return (data || []) as PurchaseOrder[]
        } catch (error) {
            console.error("Error getting POs:", error)
            return []
        }
    }

    static async sendPurchaseOrder(poId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (po.status !== "draft") {
                return { success: false, error: "Can only send draft purchase orders" }
            }

            const { error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).update({
                status: "sent",
                updated_at: new Date().toISOString()
            }).eq("id", poId)
            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error("Error sending PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to send PO" }
        }
    }

    static async confirmPurchaseOrder(poId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (po.status !== "sent") {
                return { success: false, error: "Can only confirm sent purchase orders" }
            }

            const { error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).update({
                status: "confirmed",
                updated_at: new Date().toISOString()
            }).eq("id", poId)
            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error("Error confirming PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to confirm PO" }
        }
    }

    static async receiveGoods(receipt: GoodsReceipt): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(receipt.purchase_order_id)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (!["confirmed", "partial"].includes(po.status)) {
                return { success: false, error: "Can only receive goods for confirmed purchase orders" }
            }

            let allReceived = true
            const updatedItems = po.items.map(item => {
                const receivedItem = receipt.items.find(r => r.material_id === item.material_id)
                const newReceivedQty = (item.received_quantity || 0) + (receivedItem?.quantity_received || 0)

                if (newReceivedQty < item.quantity) {
                    allReceived = false
                }

                return {
                    ...item,
                    received_quantity: newReceivedQty
                }
            })

            if (allReceived) {
                const { data: existingEntries } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
                    .select("id")
                    .eq("reference_id", receipt.purchase_order_id)
                    .eq("type", JournalEntryType.MATERIAL_RECEIPT)
                    .limit(1)

                if (!existingEntries || existingEntries.length === 0) {
                    if (po.total_amount > 0) {
                        let fabricCost = 0
                        let accessoryCost = 0

                        po.items.forEach(item => {
                            const name = (item.material_name || "").toLowerCase()
                            if (name.includes("fabric") || name.includes("cloth") || name.includes("textile")) {
                                fabricCost += item.total_cost
                            } else {
                                accessoryCost += item.total_cost
                            }
                        })

                        const lines = []
                        
                        if (fabricCost > 0) {
                            lines.push({
                                accountCode: ACCOUNTS.INVENTORY_RAW_MATERIALS,
                                accountName: "Raw Materials - Fabric",
                                debit: fabricCost,
                                credit: 0,
                                description: `RM Fabric received: PO ${receipt.purchase_order_id}`
                            })
                        }
                        
                        const accessoryTotal = accessoryCost + (po.tax_amount || 0) + (po.shipping_cost || 0)
                        if (accessoryTotal > 0) {
                            lines.push({
                                accountCode: "1202",
                                accountName: "Raw Materials - Accessories",
                                debit: accessoryTotal,
                                credit: 0,
                                description: `RM Accessories/Tax/Shipping received: PO ${receipt.purchase_order_id}`
                            })
                        }

                        lines.push({
                            accountCode: ACCOUNTS.ACCOUNTS_PAYABLE,
                            accountName: "Accounts Payable",
                            debit: 0,
                            credit: po.total_amount,
                            description: `Liability for PO received: ${receipt.purchase_order_id}`
                        })

                        await EnhancedAccountingService.createJournalEntry(
                            JournalEntryType.MATERIAL_RECEIPT,
                            lines,
                            receipt.purchase_order_id,
                            `Materials received for PO: ${receipt.purchase_order_id}`
                        )
                    }
                } else {
                    console.log(`[Idempotency] Skipping duplicate MATERIAL_RECEIPT for PO ${receipt.purchase_order_id}`)
                }
            }

            const now = new Date().toISOString()
            const { error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).update({
                items: updatedItems,
                status: allReceived ? "received" : "partial",
                actual_delivery: allReceived ? receipt.receipt_date : null,
                updated_at: now
            }).eq("id", receipt.purchase_order_id)
            if (error) throw error

            if (allReceived) {
                await VendorService.recordOrder(po.vendor_id, po.total_amount)
            }

            console.log(`✅ Received goods for PO ${receipt.purchase_order_id}`)
            return { success: true }
        } catch (error) {
            console.error("Error receiving goods:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to receive goods" }
        }
    }

    static async cancelPurchaseOrder(
        poId: string,
        reason?: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (po.status === "received") {
                return { success: false, error: "Cannot cancel received purchase orders" }
            }

            const { error } = await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).update({
                status: "cancelled",
                notes: reason ? `${po.notes || ""}\n\nCancellation reason: ${reason}` : po.notes,
                updated_at: new Date().toISOString()
            }).eq("id", poId)
            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error("Error cancelling PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to cancel PO" }
        }
    }

    static async getPurchaseOrderStats(): Promise<{
        total: number
        draft: number
        pending: number
        received: number
        totalValue: number
        pendingValue: number
    }> {
        try {
            const allPOs = await this.getAllPurchaseOrders()

            return {
                total: allPOs.length,
                draft: allPOs.filter(po => po.status === "draft").length,
                pending: allPOs.filter(po => ["sent", "confirmed", "partial"].includes(po.status)).length,
                received: allPOs.filter(po => po.status === "received").length,
                totalValue: allPOs.filter(po => po.status !== "cancelled")
                    .reduce((sum, po) => sum + po.total_amount, 0),
                pendingValue: allPOs.filter(po => ["sent", "confirmed", "partial"].includes(po.status))
                    .reduce((sum, po) => sum + po.total_amount, 0)
            }
        } catch (error) {
            console.error("Error getting PO stats:", error)
            return { total: 0, draft: 0, pending: 0, received: 0, totalValue: 0, pendingValue: 0 }
        }
    }
}
