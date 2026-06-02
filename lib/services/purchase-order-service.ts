import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { VendorService } from "./vendor-service"
import { EnhancedAccountingService, ACCOUNTS, JournalEntryType } from "./enhanced-accounting-service"

export interface PurchaseOrderItem {
    material_id: string
    material_name: string
    item_type: "inventory_raw" | "inventory_accessory" | "equipment" | "supplies"
    quantity: number
    unit: string
    unit_cost: number
    total_cost: number
    asset_account?: string       // for equipment POs: 1301-1307 or 1401+
    useful_life_years?: number   // for equipment POs: depreciation life
    supplies_account?: string    // for supplies POs: 6001-6012
    received_quantity?: number
}

export interface PurchaseOrder {
    id: string
    po_number?: string
    vendor_id: string
    vendor_name: string
    items: PurchaseOrderItem[]
    subtotal: number
    tax_amount: number
    shipping_cost: number
    total_amount: number
    paid_amount?: number
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
        items: (Omit<PurchaseOrderItem, "total_cost" | "received_quantity" | "item_type" | "asset_account" | "supplies_account"> & {
            item_type?: PurchaseOrderItem["item_type"]
            asset_account?: string
            supplies_account?: string
        })[],
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
                item_type: item.item_type || "inventory_raw",
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
                subtotal,
                tax_amount: taxAmount,
                shipping_cost: shippingCost,
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

    static async receiveGoods(receipt: GoodsReceipt): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(receipt.purchase_order_id)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (!["confirmed", "partial"].includes(po.status)) {
                return { success: false, error: "Can only receive goods for confirmed purchase orders" }
            }

            // Compute received amounts for THIS receipt, bucketed by item_type
            // For equipment items, track per-line account codes
            let receiptTotal = 0
            const receiptByType: Record<string, { cost: number; items: Array<{ material_id: string; material_name: string; qty: number; unit_cost: number; account: string }> }> = {
                inventory_raw:       { cost: 0, items: [] },
                inventory_accessory: { cost: 0, items: [] },
                equipment:           { cost: 0, items: [] },
                supplies:            { cost: 0, items: [] },
            }

            const ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
                inventory_raw:       { code: "1201", name: "Raw Materials - Fabric" },
                inventory_accessory: { code: "1202", name: "Raw Materials - Accessories" },
                equipment:           { code: "1304", name: "Production Equipment" },
                supplies:            { code: "6001", name: "Administrative Expenses" },
            }

            let allReceived = true
            const updatedItems = po.items.map(item => {
                const receivedItem = receipt.items.find(r => r.material_id === item.material_id)
                const qtyReceived = receivedItem?.quantity_received || 0
                const unitCost = receivedItem?.actual_unit_cost || item.unit_cost
                const lineTotal = qtyReceived * unitCost
                receiptTotal += lineTotal

                const itype = item.item_type || "inventory_raw"
                if (receiptByType[itype]) {
                    receiptByType[itype].cost += lineTotal
                    if (itype === "equipment") {
                        receiptByType[itype].items.push({
                            material_id: item.material_id,
                            material_name: item.material_name,
                            qty: qtyReceived,
                            unit_cost: unitCost,
                            account: item.asset_account || "1304"
                        })
                    }
                }

                const newReceivedQty = (item.received_quantity || 0) + qtyReceived
                if (newReceivedQty < item.quantity) {
                    allReceived = false
                }

                return { ...item, received_quantity: newReceivedQty }
            })

            // Proportional tax and shipping for this receipt
            const ratio = po.subtotal > 0 ? receiptTotal / po.subtotal : 0
            const receiptTax = (po.tax_amount || 0) * ratio
            const receiptShipping = (po.shipping_cost || 0) * ratio
            const totalAP = receiptTotal + receiptTax + receiptShipping

            let journalEntryId: string | undefined

            if (totalAP > 0) {
                const jeRef = `${receipt.purchase_order_id}-${Date.now()}`
                const { data: existingJE } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
                    .select("id")
                    .eq("reference_id", jeRef)
                    .eq("type", JournalEntryType.MATERIAL_RECEIPT)
                    .limit(1)

                if (!existingJE || existingJE.length === 0) {
                    const lines: any[] = []

                    for (const [itype, bucket] of Object.entries(receiptByType)) {
                        if (bucket.cost <= 0) continue
                        if (itype === "equipment") {
                            // Equipment: use the PO line's specified asset_account, not a hardcoded default
                            for (const eqItem of bucket.items) {
                                const lineTotal = eqItem.qty * eqItem.unit_cost
                                if (lineTotal <= 0) continue
                                const code = eqItem.account || ACCOUNT_MAP.equipment.code
                                lines.push({
                                    accountCode: code,
                                    accountName: `${eqItem.material_name} (PO receipt)`,
                                    debit: lineTotal,
                                    credit: 0,
                                    description: `Equipment received via PO ${receipt.purchase_order_id}: ${eqItem.material_name}`
                                })
                            }
                        } else {
                            const acct = ACCOUNT_MAP[itype] || ACCOUNT_MAP.inventory_raw
                            lines.push({
                                accountCode: acct.code,
                                accountName: acct.name,
                                debit: bucket.cost,
                                credit: 0,
                                description: `${acct.name} received: PO ${receipt.purchase_order_id}`
                            })
                        }
                    }

                    if (receiptTax > 0) {
                        lines.push({
                            accountCode: "1120",
                            accountName: "VAT Receivable (Input VAT)",
                            debit: receiptTax,
                            credit: 0,
                            description: `Input VAT on PO ${receipt.purchase_order_id} receipt`
                        })
                    }

                    if (receiptShipping > 0) {
                        lines.push({
                            accountCode: "6106",
                            accountName: "Delivery & Shipping Expense",
                            debit: receiptShipping,
                            credit: 0,
                            description: `Shipping on PO ${receipt.purchase_order_id} receipt`
                        })
                    }

                    lines.push({
                        accountCode: ACCOUNTS.ACCOUNTS_PAYABLE,
                        accountName: "Accounts Payable",
                        debit: 0,
                        credit: totalAP,
                        description: `Liability for PO ${receipt.purchase_order_id} receipt`
                    })

                    // Attach asset metadata if equipment items were received in this batch
                    const hasEquipment = receiptByType.equipment.cost > 0
                    const eqItem = hasEquipment ? po.items.find(i => (i.item_type || "inventory_raw") === "equipment") : null
                    const assetMeta = hasEquipment ? {
                        useful_life_years: (eqItem as any)?.useful_life_years || 5,
                        salvage_value: 0,
                        depreciation_method: 'straight-line',
                        source: `PO ${receipt.purchase_order_id}`
                    } : undefined

                    const jeResult = await EnhancedAccountingService.createJournalEntry(
                        JournalEntryType.MATERIAL_RECEIPT,
                        lines,
                        jeRef,
                        `Materials received for PO: ${receipt.purchase_order_id}`,
                        null,
                        undefined,
                        undefined,
                        assetMeta
                    )

                    if (jeResult.success) {
                        journalEntryId = jeResult.entryId
                    }
                }
            }

            // Update inventory quantities ONLY for inventory-type items
            for (const recItem of receipt.items) {
                if (!recItem.quantity_received || recItem.quantity_received <= 0) continue
                const poItem = po.items.find(i => i.material_id === recItem.material_id)
                const itype = poItem?.item_type || "inventory_raw"

                if (itype === "inventory_raw" || itype === "inventory_accessory") {
                    const { data: invItem } = await getServiceSupabase()
                        .from(TABLES.INVENTORY_ITEMS)
                        .select("id, quantity_on_hand, sku, name")
                        .or(`id.eq.${recItem.material_id},sku.eq.${recItem.material_id}`)
                        .limit(1)
                        .maybeSingle()

                    if (invItem) {
                        const newQty = (invItem.quantity_on_hand || 0) + recItem.quantity_received
                        await getServiceSupabase()
                            .from(TABLES.INVENTORY_ITEMS)
                            .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
                            .eq("id", invItem.id)

                        await getServiceSupabase()
                            .from(TABLES.INVENTORY_MOVEMENTS)
                            .insert({
                                item_id: invItem.id,
                                sku: invItem.sku || recItem.material_id,
                                qty: recItem.quantity_received,
                                type: "receipt",
                                related_doc: receipt.purchase_order_id,
                                notes: `PO receipt: ${invItem.name || recItem.material_id} × ${recItem.quantity_received}`,
                                created_at: new Date().toISOString()
                            })
                    }
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

            console.log(`✅ Received goods for PO ${receipt.purchase_order_id}, JE: ${journalEntryId || 'none'}`)
            return { success: true, journalEntryId }
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

            if (po.status === "received" || po.status === "partial") {
                return { success: false, error: "Cannot cancel received or partially received purchase orders. Goods have been received and journal entries created." }
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

    static async payVendor(
        poId: string,
        amount: number,
        method: "cash" | "bank" = "bank",
        reference?: string
    ): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
        try {
            const po = await this.getPurchaseOrder(poId)
            if (!po) {
                return { success: false, error: "Purchase order not found" }
            }

            if (amount <= 0) {
                return { success: false, error: "Payment amount must be positive" }
            }

            const paymentAccount = method === "cash" ? "1101" : "1103"
            const paymentName = method === "cash" ? "Cash on Hand" : "Bank Account"
            const ref = reference || `PAY-PO-${poId.slice(0, 8)}`

            const lines: any[] = [
                {
                    accountCode: ACCOUNTS.ACCOUNTS_PAYABLE,  // 2101
                    accountName: "Accounts Payable",
                    debit: amount,
                    credit: 0,
                    description: `Payment to vendor ${po.vendor_name} - PO ${poId}`
                },
                {
                    accountCode: paymentAccount,
                    accountName: paymentName,
                    debit: 0,
                    credit: amount,
                    description: `Vendor payment via ${method} - PO ${poId}${ref ? ` (${ref})` : ''}`
                }
            ]

            const result = await EnhancedAccountingService.createJournalEntry(
                JournalEntryType.PAYMENT_MADE,
                lines,
                ref,
                `Vendor payment: ${po.vendor_name} - PO ${poId}`
            )

            if (!result.success) {
                return { success: false, error: result.error || "Failed to create payment journal entry" }
            }

            const newPaidAmount = (po.paid_amount || 0) + amount
            await getServiceSupabase().from(TABLES.PURCHASE_ORDERS).update({
                paid_amount: newPaidAmount,
                updated_at: new Date().toISOString()
            }).eq("id", poId)

            console.log(`✅ Paid vendor ${po.vendor_name} EGP ${amount} via ${method}, JE: ${result.entryId}`)
            return { success: true, journalEntryId: result.entryId }
        } catch (error) {
            console.error("Error paying vendor:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to pay vendor" }
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
