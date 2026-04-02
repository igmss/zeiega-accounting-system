import { db, COLLECTIONS } from "../firebase"
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
    expected_delivery?: Date
    actual_delivery?: Date
    shipping_address?: string
    notes?: string
    status: "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled"
    created_at: Date
    updated_at: Date
    created_by: string
    approved_by?: string
    approved_at?: Date
}

export interface GoodsReceipt {
    purchase_order_id: string
    items: Array<{
        material_id: string
        quantity_received: number
        actual_unit_cost?: number
    }>
    receipt_date: Date
    notes?: string
}

/**
 * Purchase Order Management Service
 */
export class PurchaseOrderService {

    /**
     * Create a new purchase order
     */
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
            // Get vendor info
            const vendor = await VendorService.getVendor(vendorId)
            if (!vendor) {
                return { success: false, error: "Vendor not found" }
            }

            // Calculate costs
            const processedItems: PurchaseOrderItem[] = items.map(item => ({
                ...item,
                total_cost: item.quantity * item.unit_cost,
                received_quantity: 0
            }))

            const subtotal = processedItems.reduce((sum, item) => sum + item.total_cost, 0)
            const taxRate = options?.taxRate ?? 0.14 // Default 14% VAT in Egypt
            const taxAmount = subtotal * taxRate
            const shippingCost = options?.shippingCost ?? 0
            const totalAmount = subtotal + taxAmount + shippingCost

            const now = new Date()
            const poId = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`

            const purchaseOrder: PurchaseOrder = {
                id: poId,
                vendor_id: vendorId,
                vendor_name: vendor.name,
                items: processedItems,
                subtotal,
                tax_amount: taxAmount,
                shipping_cost: shippingCost,
                total_amount: totalAmount,
                expected_delivery: options?.expectedDelivery,
                shipping_address: options?.shippingAddress,
                notes: options?.notes,
                status: "draft",
                created_at: now,
                updated_at: now,
                created_by: "system"
            }

            await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(poId).set(purchaseOrder)

            console.log(`✅ Created PO ${poId} for vendor ${vendor.name}`)
            return { success: true, purchaseOrderId: poId }
        } catch (error) {
            console.error("Error creating purchase order:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to create PO" }
        }
    }

    /**
     * Get purchase order by ID
     */
    static async getPurchaseOrder(poId: string): Promise<PurchaseOrder | null> {
        try {
            const doc = await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(poId).get()
            if (!doc.exists) return null
            return doc.data() as PurchaseOrder
        } catch (error) {
            console.error("Error getting PO:", error)
            return null
        }
    }

    /**
     * Get all purchase orders with optional filtering
     */
    static async getAllPurchaseOrders(options?: {
        vendorId?: string
        status?: PurchaseOrder["status"]
        limit?: number
    }): Promise<PurchaseOrder[]> {
        try {
            let query = db.collection(COLLECTIONS.PURCHASE_ORDERS) as any

            if (options?.vendorId) {
                query = query.where("vendor_id", "==", options.vendorId)
            }
            if (options?.status) {
                query = query.where("status", "==", options.status)
            }

            query = query.orderBy("created_at", "desc")

            if (options?.limit) {
                query = query.limit(options.limit)
            }

            const snapshot = await query.get()
            return snapshot.docs.map((doc: any) => doc.data() as PurchaseOrder)
        } catch (error) {
            console.error("Error getting POs:", error)
            return []
        }
    }

    /**
     * Send purchase order to vendor
     */
    static async sendPurchaseOrder(poId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (po.status !== "draft") {
                return { success: false, error: "Can only send draft purchase orders" }
            }

            await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(poId).update({
                status: "sent",
                updated_at: new Date()
            })

            return { success: true }
        } catch (error) {
            console.error("Error sending PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to send PO" }
        }
    }

    /**
     * Confirm purchase order (vendor confirmed)
     */
    static async confirmPurchaseOrder(poId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (po.status !== "sent") {
                return { success: false, error: "Can only confirm sent purchase orders" }
            }

            await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(poId).update({
                status: "confirmed",
                updated_at: new Date()
            })

            return { success: true }
        } catch (error) {
            console.error("Error confirming PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to confirm PO" }
        }
    }

    /**
     * Receive goods from purchase order
     */
    static async receiveGoods(receipt: GoodsReceipt): Promise<{ success: boolean; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(receipt.purchase_order_id)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (!["confirmed", "partial"].includes(po.status)) {
                return { success: false, error: "Can only receive goods for confirmed purchase orders" }
            }

            // Update received quantities
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

            // Calculate total cost for received goods
            let receiptTotalCost = 0
            for (const receivedItem of receipt.items) {
                const poItem = po.items.find(item => item.material_id === receivedItem.material_id)
                receiptTotalCost += (receivedItem.quantity_received * (poItem?.unit_cost || 0))
            }

            // Create journal entry for goods receipt (on final receipt only for PO total - Fix-M9)
            if (allReceived) {
                // Idempotency check: Don't post twice if receipt is called multiple times
                const existingEntriesSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                    .where("reference_doc", "==", receipt.purchase_order_id)
                    .where("type", "==", JournalEntryType.MATERIAL_RECEIPT)
                    .limit(1)
                    .get();

                if (!existingEntriesSnapshot.empty) {
                    console.log(`[Idempotency] Skipping duplicate MATERIAL_RECEIPT for PO ${receipt.purchase_order_id}`);
                } else if (po.total_amount > 0) {
                    // Post for entire PO total as requested for financial unification
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
                            accountCode: ACCOUNTS.INVENTORY_RAW_MATERIALS, // 1201
                            accountName: "Raw Materials - Fabric",
                            debit: fabricCost,
                            credit: 0,
                            description: `RM Fabric received: PO ${receipt.purchase_order_id}`
                        })
                    }
                    
                    const accessoryTotal = accessoryCost + (po.tax_amount || 0) + (po.shipping_cost || 0)
                    if (accessoryTotal > 0) {
                        lines.push({
                            accountCode: "1202", // Raw Materials - Accessories
                            accountName: "Raw Materials - Accessories",
                            debit: accessoryTotal,
                            credit: 0,
                            description: `RM Accessories/Tax/Shipping received: PO ${receipt.purchase_order_id}`
                        })
                    }

                    lines.push({
                        accountCode: ACCOUNTS.ACCOUNTS_PAYABLE, // 2101
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
            }

            // Update PO
            await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(receipt.purchase_order_id).update({
                items: updatedItems,
                status: allReceived ? "received" : "partial",
                actual_delivery: allReceived ? receipt.receipt_date : null,
                updated_at: new Date()
            })

            // Update vendor statistics
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

    /**
     * Cancel purchase order
     */
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

            await db.collection(COLLECTIONS.PURCHASE_ORDERS).doc(poId).update({
                status: "cancelled",
                notes: reason ? `${po.notes || ""}\n\nCancellation reason: ${reason}` : po.notes,
                updated_at: new Date()
            })

            return { success: true }
        } catch (error) {
            console.error("Error cancelling PO:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to cancel PO" }
        }
    }

    /**
     * Get purchase order statistics
     */
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
