import { TABLES, getServiceSupabase } from "../supabase"
import type { Customer, SalesOrder, WorkOrder, WebsiteOrder } from "../types"
import { ACCOUNTS, EnhancedAccountingService } from "./enhanced-accounting-service"
import { JournalEntryType, JournalEntryService, JournalLine } from "./journal-entry-service"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"

interface ReturnItem {
    sku?: string
    productId?: string
    id?: string
    quantity?: number
    qty?: number
}

interface ReturnData {
    id?: string
    returnId?: string
    orderId?: string
    invoiceId?: string
    refundAmount?: number
    amount?: number
    items?: ReturnItem[]
    paymentMethod?: string
    payment_method?: string
}

export class SalesAccountingService {
    static async syncWebsiteOrders() {
        const processed: string[] = []
        const errors: string[] = []
        const client = getServiceSupabase()

        try {
            const { data: orders, error: fetchError } = await client
                .from(TABLES.ORDERS)
                .select("*")
                .or("processed.is.null,processed.neq.true")
                .limit(50)

            if (fetchError) {
                throw fetchError
            }

            for (const order of (orders || [])) {
                try {
                    await this.createSalesOrder(order as any)

                    await client
                        .from(TABLES.ORDERS)
                        .update({
                            processed: true,
                            processed_at: new Date().toISOString(),
                            processing_error: null,
                        })
                        .eq("id", order.id)

                    processed.push(order.id)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error"
                    console.error(`❌ Error sync process for order ${order.id}:`, errorMessage)
                    errors.push(`Order ${order.id}: ${errorMessage}`)

                    try {
                        await client
                            .from(TABLES.ORDERS)
                            .update({
                                processed: false,
                                processing_error: errorMessage,
                                last_processed_at: new Date().toISOString(),
                            })
                            .eq("id", order.id)
                    } catch {
                        console.error(`❌ Could not update error state for order ${order.id}`)
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching orders:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    static async syncWebsiteReturns() {
        const processed: string[] = []
        const errors: string[] = []
        const client = getServiceSupabase()

        try {
            const { data: returns, error: fetchError } = await client
                .from(TABLES.RETURNS)
                .select("*")
                .or("processed.is.null,processed.neq.true")
                .limit(50)

            if (fetchError) {
                throw fetchError
            }

            for (const returnRow of (returns || [])) {
                try {
                    const returnData = returnRow as any
                    const result = await this.processReturn(returnData)

                    if (!result?.success) {
                        errors.push(`Return ${returnRow.id}: ${result?.error || "Unknown error"}`)
                        continue
                    }

                    await client
                        .from(TABLES.RETURNS)
                        .update({
                            processed: true,
                            processed_at: new Date().toISOString(),
                        })
                        .eq("id", returnRow.id)

                    processed.push(returnData.id)
                } catch (error) {
                    console.error(`Error processing return ${returnRow.id}:`, error)
                    errors.push(`Return ${returnRow.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
                }
            }
        } catch (error) {
            console.error("Error fetching returns:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    public static async processReturn(
        returnData: ReturnData
    ): Promise<{ success: boolean; creditMemoId?: string; error?: string }> {
        const creditMemoId = `CM-${Date.now()}`
        const returnId = returnData?.id ?? returnData?.returnId ?? "unknown"
        const returnAmount = Number(returnData.refundAmount ?? returnData.amount ?? 0)
        const client = getServiceSupabase()

        if (!Number.isFinite(returnAmount) || returnAmount < 0) {
            return { success: false, error: `Invalid return amount for return ${returnId}` }
        }

        try {
            const orderId = returnData?.orderId
            const invoiceIdFromReturn = returnData?.invoiceId

            let invoiceData: Record<string, unknown> | null = null
            let invoiceDocId: string | null = null

            if (invoiceIdFromReturn && typeof invoiceIdFromReturn === "string") {
                const { data: doc } = await client
                    .from(TABLES.INVOICES)
                    .select("*")
                    .eq("id", invoiceIdFromReturn)
                    .maybeSingle()
                if (doc) {
                    invoiceData = doc as Record<string, unknown>
                    invoiceDocId = doc.id as string
                }
            }

            if (!invoiceData && orderId && typeof orderId === "string") {
                const { data: snapshot } = await client
                    .from(TABLES.INVOICES)
                    .select("*")
                    .eq("sales_order_id", orderId)
                    .limit(1)
                if (snapshot && snapshot.length > 0) {
                    const first = snapshot[0]
                    invoiceData = first as Record<string, unknown>
                    invoiceDocId = first.id as string
                }
                if (!invoiceData) {
                    const derivedId = `INV-${orderId.slice(-8)}`
                    const { data: doc } = await client
                        .from(TABLES.INVOICES)
                        .select("*")
                        .eq("id", derivedId)
                        .maybeSingle()
                    if (doc) {
                        invoiceData = doc as Record<string, unknown>
                        invoiceDocId = doc.id as string
                    }
                }
            }

            if (!invoiceData || !invoiceDocId) {
                return { success: false, error: `Original invoice not found for return ${returnId}` }
            }

            const rawStatus = invoiceData.status
            const invoiceStatus: string | undefined = typeof rawStatus === 'string' ? rawStatus : undefined

            let creditAccountCode: string = ACCOUNTS.ACCOUNTS_RECEIVABLE
            let creditAccountName = getAccountName(ACCOUNTS.ACCOUNTS_RECEIVABLE)

            if (invoiceStatus === "paid") {
                const { data: paymentDocs } = await client
                    .from(TABLES.PAYMENTS)
                    .select("*")
                    .eq("invoice_id", invoiceDocId)
                    .limit(1)

                const paymentDoc = paymentDocs?.[0]
                const paymentData = paymentDoc as any

                const paymentMethod =
                    returnData?.paymentMethod ??
                    returnData?.payment_method ??
                    paymentData?.payment_method ??
                    paymentData?.method ??
                    paymentData?.paymentMethod

                if (!paymentMethod || typeof paymentMethod !== "string") {
                    return { success: false, error: `Unable to determine original payment method for paid invoice ${invoiceDocId}` }
                }

                const isCash = paymentMethod.toLowerCase() === "cash"
                creditAccountCode = isCash ? ACCOUNTS.CASH : ACCOUNTS.BANK
                creditAccountName = getAccountName(creditAccountCode)
            }

            const items = Array.isArray(returnData?.items) ? returnData.items : []
            if (items.length === 0) {
                return { success: false, error: `Return ${returnId} has no items to restore inventory value` }
            }

            let inventoryRestorationValue = 0
            const restorationLinesByItem: Array<{ sku: string; quantity: number }> = []

            for (const item of items) {
                const sku: string | undefined = item?.sku ?? item?.productId ?? item?.id
                const quantityRaw = item?.quantity ?? item?.qty
                const quantity = Number(quantityRaw ?? 0)

                if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
                    return { success: false, error: `Invalid return item (sku=${String(sku)}, qty=${String(quantityRaw)})` }
                }

                const { data: invDoc } = await client
                    .from(TABLES.INVENTORY_ITEMS)
                    .select("*")
                    .eq("sku", sku)
                    .maybeSingle()

                if (!invDoc) {
                    return { success: false, error: `Inventory item not found: ${sku}` }
                }

                const invData = invDoc as any
                const unitCostRaw = invData?.unit_cost ?? invData?.cost_per_unit ?? invData?.unitCost ?? 0
                const unitCost = Number(unitCostRaw ?? 0)

                if (!Number.isFinite(unitCost) || unitCost < 0) {
                    return { success: false, error: `Invalid unit cost for inventory restoration (sku=${sku})` }
                }

                inventoryRestorationValue += unitCost * quantity
                restorationLinesByItem.push({ sku, quantity })
            }

            if (inventoryRestorationValue < 0) {
                return { success: false, error: `Unable to compute inventory restoration value for return ${returnId}` }
            }

            const salesReturnLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.SALES_RETURNS,
                    accountName: getAccountName(ACCOUNTS.SALES_RETURNS),
                    debit: returnAmount,
                    credit: 0,
                    description: `Return ${returnId}`,
                },
                {
                    accountCode: creditAccountCode,
                    accountName: creditAccountName,
                    debit: 0,
                    credit: returnAmount,
                    description: `Refund for return ${returnId}`,
                },
            ]

            const memoResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_RETURN,
                salesReturnLines,
                creditMemoId,
                `Credit memo / return ${returnId}`,
                null
            )

            if (!memoResult.success) {
                return { success: false, error: memoResult.error || "Failed to create credit memo" }
            }

            const inventoryLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                    accountName: getAccountName(ACCOUNTS.INVENTORY_FINISHED_GOODS),
                    debit: inventoryRestorationValue,
                    credit: 0,
                    description: `Inventory restoration for return ${returnId}`,
                },
                {
                    accountCode: ACCOUNTS.COGS,
                    accountName: getAccountName(ACCOUNTS.COGS),
                    debit: 0,
                    credit: inventoryRestorationValue,
                    description: `COGS reversal for return ${returnId}`,
                },
            ]

            const inventoryResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.INVENTORY_ADJUSTMENT,
                inventoryLines,
                creditMemoId,
                `Inventory restoration journal for return ${returnId}`,
                null
            )

            if (!inventoryResult.success) {
                return { success: false, error: inventoryResult.error || "Failed to create inventory restoration journal entry" }
            }

            for (const item of restorationLinesByItem) {
                const { data: current } = await client
                    .from(TABLES.INVENTORY_ITEMS)
                    .select("quantity_on_hand")
                    .eq("sku", item.sku)
                    .maybeSingle()
                const newQty = (current?.quantity_on_hand ?? 0) + item.quantity
                await client
                    .from(TABLES.INVENTORY_ITEMS)
                    .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
                    .eq("sku", item.sku)
            }

            return { success: true, creditMemoId }
        } catch (error) {
            return {
                success: false,
                creditMemoId,
                error: error instanceof Error ? error.message : "Transaction failed during return processing"
            }
        }
    }

    static async createSalesOrder(websiteOrder: WebsiteOrder) {
        const now = Date.now()
        const salesOrderId = websiteOrder.id
        const client = getServiceSupabase()

        const { data: existingSO } = await client
            .from(TABLES.SALES_ORDERS)
            .select("id")
            .eq("id", salesOrderId)
            .maybeSingle()

        if (existingSO) {
            console.warn(`⚠️ Sales order ${salesOrderId} already exists — skipping. Review if order items changed upstream.`)
            return
        }

        let customerEmail = websiteOrder.customer_email
        if (!customerEmail && websiteOrder.userId) {
            console.log(`🔍 Looking up email for user ${websiteOrder.userId}...`)
            const { data: user } = await client
                .from(TABLES.WEBSITE_USERS)
                .select("email")
                .eq("id", websiteOrder.userId)
                .maybeSingle()
            if (user) {
                customerEmail = user.email
            }
        }

        const customerId = await this.findOrCreateCustomer(customerEmail || websiteOrder.userId || "unknown")

        const salesOrder: SalesOrder = {
            id: salesOrderId,
            website_order_id: websiteOrder.id,
            customer_id: customerId,
            items: websiteOrder.items.map((item) => ({
                sku: item.sku || item.id,
                qty: item.quantity || 1,
                unit_price: item.price || 0,
            })),
            status: "pending",
            created_at: new Date().toISOString() as any,
        }

        const workOrderId = `WO-${now}-${Math.random().toString(36).substr(2, 4)}`
        const workOrder: WorkOrder = {
            id: workOrderId,
            sales_order_id: salesOrderId,
            raw_materials_used: [],
            labor_hours: 0,
            labor_cost: 0,
            overhead_cost: 0,
            total_cost: 0,
            estimated_cost: 0,
            status: "pending",
            created_at: new Date().toISOString() as any,
        }

        await client.from(TABLES.SALES_ORDERS).upsert({ id: salesOrderId, ...(salesOrder as any) }, { onConflict: "id" })
        await client.from(TABLES.WORK_ORDERS).upsert({ id: workOrderId, ...(workOrder as any) }, { onConflict: "id" })

        console.log(`✅ Created sales order ${salesOrderId} and work order ${workOrderId}`)
    }

    static async findOrCreateCustomer(email: string): Promise<string> {
        const client = getServiceSupabase()

        const { data: customers } = await client
            .from(TABLES.CUSTOMERS)
            .select("id")
            .eq("email", email)
            .limit(1)

        if (customers && customers.length > 0) {
            return customers[0].id as string
        }

        const { data: users } = await client
            .from(TABLES.WEBSITE_USERS)
            .select("name, email")
            .eq("email", email)
            .limit(1)

        let name = email.split("@")[0]
        if (users && users.length > 0) {
            const userData = users[0] as any
            name = userData.name || userData.displayName || name
        }

        const customerId = `CUST-${Date.now()}`
        const customer: Customer = {
            id: customerId,
            name,
            email,
            phone: "",
            address: "",
            created_at: new Date().toISOString() as any,
        }

        await client.from(TABLES.CUSTOMERS).insert({ id: customerId, ...(customer as any) })
        return customerId
    }

    static async recordSale(
        invoiceId: string,
        salesAmount: number,
        costOfGoodsSold: number,
        vatAmount: number = 0,
        workOrderId?: string
    ): Promise<{
        success: boolean
        revenueEntryId?: string
        cogsEntryId?: string
        wipTransferEntryId?: string
        error?: string
    }> {
        try {
            let wipTransferEntryId: string | undefined
            if (workOrderId && costOfGoodsSold > 0) {
                const wipTransfer = await EnhancedAccountingService.recordWIPToFinishedGoods(workOrderId, costOfGoodsSold)
                if (!wipTransfer.success) {
                    return { success: false, error: `WIP→FG transfer failed: ${wipTransfer.error}` }
                }
                wipTransferEntryId = wipTransfer.entryId
            }

            const totalReceivable = salesAmount + vatAmount

            const revenueLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE,
                    accountName: "Accounts Receivable",
                    debit: totalReceivable,
                    credit: 0,
                    description: `Invoice: ${invoiceId} (Total: ${totalReceivable})`,
                },
                {
                    accountCode: ACCOUNTS.SALES_REVENUE,
                    accountName: "Sales Revenue",
                    debit: 0,
                    credit: salesAmount,
                    description: `Sale net revenue`,
                },
            ]

            if (vatAmount > 0) {
                revenueLines.push({
                    accountCode: ACCOUNTS.VAT_PAYABLE,
                    accountName: "VAT Payable",
                    debit: 0,
                    credit: vatAmount,
                    description: "Sales VAT (14%)",
                })
            }

            const revenueResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_INVOICE,
                revenueLines,
                invoiceId,
                undefined,
                null
            )

            if (!revenueResult.success) {
                return { success: false, error: revenueResult.error || "Revenue JE creation failed" }
            }

            const cogsLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.COGS,
                    accountName: getAccountName(ACCOUNTS.COGS),
                    debit: costOfGoodsSold,
                    credit: 0,
                    description: `COGS for invoice: ${invoiceId}`,
                },
                {
                    accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                    accountName: getAccountName(ACCOUNTS.INVENTORY_FINISHED_GOODS),
                    debit: 0,
                    credit: costOfGoodsSold,
                    description: `Goods sold`,
                },
            ]

            const cogsResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_COGS,
                cogsLines,
                invoiceId,
                undefined,
                null
            )

            if (!cogsResult.success) {
                return { success: false, error: cogsResult.error || "COGS JE creation failed" }
            }

            return {
                success: true,
                revenueEntryId: revenueResult.entryId,
                cogsEntryId: cogsResult.entryId,
                wipTransferEntryId,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Transaction failed during sale recording"
            }
        }
    }

    static async processOverdueInvoices(): Promise<{ processed: number; errors: number }> {
        try {
            const now = new Date()
            const client = getServiceSupabase()

            const { data: invoices, error } = await client
                .from(TABLES.INVOICES)
                .select("*")
                .in("status", ["unpaid", "partial"])

            if (error) {
                throw error
            }

            let count = 0

            for (const invoice of (invoices || [])) {
                let dueDate: Date | null = null
                if (invoice.due_date) {
                    dueDate = new Date(invoice.due_date)
                }

                if (dueDate && dueDate < now) {
                    await client
                        .from(TABLES.INVOICES)
                        .update({
                            status: "overdue",
                            updated_at: now.toISOString(),
                        })
                        .eq("id", invoice.id)
                    count++
                }
            }

            console.log(`✅ Processed ${count} overdue invoices`)
            return { processed: count, errors: 0 }
        } catch (error) {
            console.error("Error processing overdue invoices:", error)
            return { processed: 0, errors: 1 }
        }
    }
}
