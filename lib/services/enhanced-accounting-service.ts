import { db, COLLECTIONS, FieldValue } from "../firebase"
import type { Customer, SalesOrder, WorkOrder, Invoice, Payment, JournalEntry, WebsiteOrder } from "../types"
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS, getAccountName, isDebitNormalBalance } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { FinancialStatementsService } from "./financial-statements-service"

/**
 * Account codes for chart of accounts
 * Using the new TEL U ASEGH Chart of Accounts structure
 * @see lib/accounting/account-types.ts for full account list
 */
export const ACCOUNTS = {
    // Assets (1xxx)
    CASH: ACCOUNT_CODES.CASH_ON_HAND,                           // "1101"
    BANK: ACCOUNT_CODES.BANK_MAIN,                              // "1103"
    ACCOUNTS_RECEIVABLE: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,     // "1110"
    INVENTORY_RAW_MATERIALS: ACCOUNT_CODES.RAW_MATERIALS_FABRIC, // "1201"
    INVENTORY_ACCESSORIES: ACCOUNT_CODES.RAW_MATERIALS_ACCESSORIES, // "1202"
    INVENTORY_WIP: ACCOUNT_CODES.INVENTORY_WIP,                 // "1210"
    INVENTORY_FINISHED_GOODS: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS, // "1220"

    // Liabilities (2xxx)
    ACCOUNTS_PAYABLE: ACCOUNT_CODES.ACCOUNTS_PAYABLE,           // "2101"
    VAT_PAYABLE: ACCOUNT_CODES.VAT_PAYABLE,                     // "2110"
    PAYROLL_PAYABLE: ACCOUNT_CODES.PAYROLL_PAYABLE,             // "2115"
    WAGES_PAYABLE: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION,      // "2120"
    ACCRUED_LIABILITIES: ACCOUNT_CODES.ACCRUED_EXPENSES,        // "2140"

    // Equity (3xxx)
    CAPITAL_AHMED: ACCOUNT_CODES.CAPITAL_AHMED,                 // "3011"
    CAPITAL_IBRAHIM: ACCOUNT_CODES.CAPITAL_IBRAHIM,             // "3012"
    CAPITAL_FATHY: ACCOUNT_CODES.CAPITAL_FATHY,                 // "3013"
    RETAINED_EARNINGS: ACCOUNT_CODES.RETAINED_EARNINGS,         // "3100"

    // Revenue (4xxx)
    SALES_REVENUE: ACCOUNT_CODES.SALES_RETAIL,                  // "4001"
    SALES_WHOLESALE: ACCOUNT_CODES.SALES_WHOLESALE,             // "4002"
    SALES_CUSTOM: ACCOUNT_CODES.SALES_CUSTOM_MTO,               // "4003"
    SALES_RETURNS: ACCOUNT_CODES.SALES_RETURNS,                 // "4091"
    SALES_DISCOUNTS: ACCOUNT_CODES.SALES_DISCOUNTS,             // "4090"

    // Cost of Goods Sold (5xxx)
    COGS: ACCOUNT_CODES.COST_OF_GOODS_SOLD,                     // "5301"
    DIRECT_MATERIALS: ACCOUNT_CODES.RAW_MATERIALS_USED,         // "5001"
    DIRECT_LABOR: ACCOUNT_CODES.DIRECT_LABOR,                   // "5002"
    MANUFACTURING_OVERHEAD: ACCOUNT_CODES.MANUFACTURING_OVERHEAD, // "5004"

    // Operating Expenses (6xxx)
    WAGES_EXPENSE: ACCOUNT_CODES.OFFICE_SALARIES,               // "6001"
    RENT_EXPENSE: ACCOUNT_CODES.OFFICE_RENT,                    // "6002"
    UTILITIES_EXPENSE: ACCOUNT_CODES.INTERNET_TELECOM,          // "6003"
    DEPRECIATION_EXPENSE: ACCOUNT_CODES.DEPRECIATION_OFFICE,   // "6007"
} as const

/**
 * Journal Entry Types for manufacturing workflow
 */
export enum JournalEntryType {
    // Inventory
    MATERIAL_RECEIPT = "MATERIAL_RECEIPT",
    MATERIAL_ISSUE_TO_WIP = "MATERIAL_ISSUE_TO_WIP",
    LABOR_APPLIED = "LABOR_APPLIED",
    OVERHEAD_APPLIED = "OVERHEAD_APPLIED",
    WIP_TO_FINISHED_GOODS = "WIP_TO_FINISHED_GOODS",
    WIP_OPENING = "WIP_OPENING",

    // Sales
    SALES_INVOICE = "SALES_INVOICE",
    SALES_COGS = "SALES_COGS",
    SALES_RETURN = "SALES_RETURN",

    // Payments
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
    PAYMENT_MADE = "PAYMENT_MADE",

    // Adjustments
    INVENTORY_ADJUSTMENT = "INVENTORY_ADJUSTMENT",
    PRIOR_PERIOD_ADJUSTMENT = "PRIOR_PERIOD_ADJUSTMENT",
    DEPRECIATION = "DEPRECIATION",
    GENERAL = "GENERAL",
    CLOSING_ENTRY = "CLOSING_ENTRY",
    TAX_PAYMENT = "TAX_PAYMENT",
    // Manufacturing gap-fill types
    SCRAP_RECORD = "SCRAP_RECORD",
    REWORK_COSTS = "REWORK_COSTS",
    FX_ADJUSTMENT = "FX_ADJUSTMENT",
    INCOME_TAX_ACCRUAL = "INCOME_TAX_ACCRUAL",
    INVENTORY_WRITEDOWN = "INVENTORY_WRITEDOWN",
    RETENTION_INVOICE = "RETENTION_INVOICE",
    RETENTION_RELEASE = "RETENTION_RELEASE",
}

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

interface JournalLine {
    accountCode: string
    accountName: string
    debit: number
    credit: number
    description: string
}

/**
 * Enhanced Accounting Service with proper double-entry bookkeeping
 */
export class EnhancedAccountingService {

    /**
     * Create a balanced journal entry
     * Validates that debits = credits before saving
     */
    /**
     * Initialize chart of accounts
     */
    static async initializeSystem() {
        const accounts = [
            { id: ACCOUNT_CODES.CASH_ON_HAND, name: "Cash", type: "asset" as const },
            { id: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: "Accounts Receivable", type: "asset" as const },
            { id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC, name: "Raw Materials Inventory", type: "asset" as const },
            { id: ACCOUNT_CODES.INVENTORY_WIP, name: "Work in Progress", type: "asset" as const },
            { id: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS, name: "Finished Goods Inventory", type: "asset" as const },
            { id: ACCOUNT_CODES.SALES_RETAIL, name: "Sales Revenue", type: "revenue" as const },
            { id: ACCOUNT_CODES.COST_OF_GOODS_SOLD, name: "Cost of Goods Sold", type: "expense" as const },
            { id: ACCOUNT_CODES.SALES_RETURNS, name: "Returns and Allowances", type: "contra_revenue" as const },
            { id: ACCOUNT_CODES.VAT_PAYABLE, name: "VAT Payable", type: "liability" as const },
        ]

        const batch = db.batch()
        accounts.forEach((account) => {
            const ref = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc(account.id)
            batch.set(ref, account)
        })

        await batch.commit()
    }

    /**
     * Process website orders (for cron job)
     * Uses createSalesOrder which is idempotent (skips if SO already exists).
     * After createSalesOrder, we always attempt to mark the website order as processed.
     * If marking fails, the next cron run will still work correctly because:
     *  - createSalesOrder is idempotent (uses website order ID as SO doc ID)
     *  - re-running will skip the SO creation and retry the processed=true update
     */
    static async syncWebsiteOrders() {
        const processed: string[] = []
        const errors: string[] = []

        try {
            const ordersSnapshot = await db.collection(COLLECTIONS.ORDERS).where("processed", "!=", true).limit(50).get()

            for (const orderDoc of ordersSnapshot.docs) {
                const order = orderDoc.data() as any
                try {
                    await this.createSalesOrder(order)

                    // Mark website order as processed – even if SO already existed (idempotent skip),
                    // we still need to mark it. This ensures eventual consistency on retry.
                    await orderDoc.ref.update({
                        processed: true,
                        processed_at: new Date(),
                        processing_error: null,
                    })

                    processed.push(order.id)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error"
                    console.error(`❌ Error sync process for order ${orderDoc.id}:`, errorMessage)
                    errors.push(`Order ${orderDoc.id}: ${errorMessage}`)

                    // Update order with error details for debugging
                    try {
                        await orderDoc.ref.update({
                            processed: false,
                            processing_error: errorMessage,
                            last_processed_at: new Date(),
                        })
                    } catch {
                        // If even the error update fails, log and continue
                        console.error(`❌ Could not update error state for order ${orderDoc.id}`)
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching orders:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    /**
     * Process website returns (for cron job)
     */
    static async syncWebsiteReturns() {
        const processed: string[] = []
        const errors: string[] = []

        try {
            const returnsSnapshot = await db.collection(COLLECTIONS.RETURNS).where("processed", "!=", true).limit(50).get()

            for (const returnDoc of returnsSnapshot.docs) {
                try {
                    const returnData = returnDoc.data() as any
                    const result = await this.processReturn(returnData)

                    if (!result?.success) {
                        errors.push(`Return ${returnDoc.id}: ${result?.error || "Unknown error"}`)
                        continue
                    }

                    // Mark as processed
                    await returnDoc.ref.update({
                        processed: true,
                        processed_at: new Date(),
                    })

                    processed.push(returnData.id)
                } catch (error) {
                    console.error(`Error processing return ${returnDoc.id}:`, error)
                    errors.push(`Return ${returnDoc.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
                }
            }
        } catch (error) {
            console.error("Error fetching returns:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    /**
     * Process individual return
     */
    public static async processReturn(
        returnData: ReturnData
    ): Promise<{ success: boolean; creditMemoId?: string; error?: string }> {
        const creditMemoId = `CM-${Date.now()}`
        const returnId = returnData?.id ?? returnData?.returnId ?? "unknown"
        const returnAmount = Number(returnData.refundAmount ?? returnData.amount ?? 0)

        if (!Number.isFinite(returnAmount) || returnAmount < 0) {
            return { success: false, error: `Invalid return amount for return ${returnId}` }
        }

        // CHANGED: Wrap all reads and writes in a Firestore transaction for atomicity
        return db.runTransaction(async (tx) => {
            // ── Phase 1: All reads ──────────────────────────────────────────
            const orderId = returnData?.orderId
            const invoiceIdFromReturn = returnData?.invoiceId

            let invoiceData: Record<string, unknown> | null = null
            let invoiceDocId: string | null = null

            // Try direct invoice ID lookup first, then fall back to orderId
            if (invoiceIdFromReturn && typeof invoiceIdFromReturn === "string") {
                const doc = await tx.get(db.collection(COLLECTIONS.INVOICES).doc(invoiceIdFromReturn))
                if (doc.exists) {
                    invoiceData = doc.data() as Record<string, unknown>
                    invoiceDocId = doc.id
                }
            }
            
            if (!invoiceData && orderId && typeof orderId === "string") {
                const snapshot = await tx.get(
                    db.collection(COLLECTIONS.INVOICES).where("sales_order_id", "==", orderId).limit(1)
                )
                if (!snapshot.empty) {
                    const first = snapshot.docs[0]
                    invoiceData = first.data() as Record<string, unknown>
                    invoiceDocId = first.id
                }
                // Also try derivedInvoiceId
                if (!invoiceData) {
                    const derivedId = `INV-${orderId.slice(-8)}`
                    const doc = await tx.get(db.collection(COLLECTIONS.INVOICES).doc(derivedId))
                    if (doc.exists) {
                        invoiceData = doc.data() as Record<string, unknown>
                        invoiceDocId = doc.id
                    }
                }
            }

            if (!invoiceData || !invoiceDocId) {
                throw new Error(`Original invoice not found for return ${returnId}`)
            }

            const rawStatus = invoiceData.status
            const invoiceStatus: string | undefined = typeof rawStatus === 'string' ? rawStatus : undefined

            // Determine credit account based on original payment method for paid invoices
            let creditAccountCode: string = ACCOUNTS.ACCOUNTS_RECEIVABLE
            let creditAccountName = getAccountName(ACCOUNTS.ACCOUNTS_RECEIVABLE)

            if (invoiceStatus === "paid") {
                const paymentsSnapshot = await tx.get(
                    db.collection(COLLECTIONS.PAYMENTS)
                        .where("invoice_id", "==", invoiceDocId)
                        .limit(1)
                )
                const paymentDoc = paymentsSnapshot.docs[0]
                const paymentData = paymentDoc?.data?.() as any

                const paymentMethod =
                    returnData?.paymentMethod ??
                    returnData?.payment_method ??
                    paymentData?.payment_method ??
                    paymentData?.method ??
                    paymentData?.paymentMethod

                if (!paymentMethod || typeof paymentMethod !== "string") {
                    throw new Error(`Unable to determine original payment method for paid invoice ${invoiceDocId}`)
                }

                const isCash = paymentMethod.toLowerCase() === "cash"
                creditAccountCode = isCash ? ACCOUNTS.CASH : ACCOUNTS.BANK
                creditAccountName = getAccountName(creditAccountCode)
            }

            // Validate return items and read inventory costs
            const items = Array.isArray(returnData?.items) ? returnData.items : []
            if (items.length === 0) {
                throw new Error(`Return ${returnId} has no items to restore inventory value`)
            }

            let inventoryRestorationValue = 0
            const restorationLinesByItem: Array<{ sku: string; quantity: number }> = []

            for (const item of items) {
                const sku: string | undefined = item?.sku ?? item?.productId ?? item?.id
                const quantityRaw = item?.quantity ?? item?.qty
                const quantity = Number(quantityRaw ?? 0)

                if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
                    throw new Error(`Invalid return item (sku=${String(sku)}, qty=${String(quantityRaw)})`)
                }

                const invDoc = await tx.get(db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(sku))
                if (!invDoc.exists) {
                    throw new Error(`Inventory item not found: ${sku}`)
                }

                const invData = invDoc.data() as any
                const unitCostRaw = invData?.unit_cost ?? invData?.cost_per_unit ?? invData?.unitCost ?? 0
                const unitCost = Number(unitCostRaw ?? 0)

                if (!Number.isFinite(unitCost) || unitCost < 0) {
                    throw new Error(`Invalid unit cost for inventory restoration (sku=${sku})`)
                }

                inventoryRestorationValue += unitCost * quantity
                restorationLinesByItem.push({ sku, quantity })
            }

            if (inventoryRestorationValue < 0) {
                throw new Error(`Unable to compute inventory restoration value for return ${returnId}`)
            }

            // ── Phase 2: All writes ─────────────────────────────────────────
            // 1. Sales return / credit memo journal entry
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

            const memoResult = await this.createJournalEntry(
                JournalEntryType.SALES_RETURN,
                salesReturnLines,
                creditMemoId,
                `Credit memo / return ${returnId}`,
                "system",
                undefined,
                tx
            )

            if (!memoResult.success) {
                throw new Error(memoResult.error || "Failed to create credit memo")
            }

            // 2. Inventory restoration journal entry (DR FG / CR COGS)
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

            const inventoryResult = await this.createJournalEntry(
                JournalEntryType.INVENTORY_ADJUSTMENT,
                inventoryLines,
                creditMemoId,
                `Inventory restoration journal for return ${returnId}`,
                "system",
                undefined,
                tx
            )

            if (!inventoryResult.success) {
                throw new Error(inventoryResult.error || "Failed to create inventory restoration journal entry")
            }

            // 3. Update inventory physical quantities (within same tx)
            for (const item of restorationLinesByItem) {
                const invRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(item.sku)
                tx.update(invRef, {
                    quantity_on_hand: FieldValue.increment(item.quantity),
                    updated_at: new Date(),
                })
            }

            return { success: true, creditMemoId }
        }).catch(error => ({
            success: false,
            creditMemoId,
            error: error instanceof Error ? error.message : "Transaction failed during return processing"
        }))
    }

    /**
     * Update inventory valuations (for cron job)
     */
    static async updateInventoryValuations() {
        const updated: string[] = []
        const lowStockAlerts: string[] = []

        try {
            const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()

            for (const itemDoc of inventorySnapshot.docs) {
                const item = itemDoc.data() as any

                // Check for low stock
                if (item.qty_on_hand <= (item.reorder_point || 10)) {
                    lowStockAlerts.push(`${item.sku}: ${item.qty_on_hand} units remaining`)
                }

                // Update valuation based on FIFO method
                const updatedValue = item.qty_on_hand * (item.unit_cost || 0)

                await itemDoc.ref.update({
                    total_value: updatedValue,
                    last_updated: new Date(),
                })

                updated.push(item.sku)
            }
        } catch (error) {
            console.error("Error updating inventory:", error)
        }

        return { updated, lowStockAlerts }
    }

    /**
     * Adjust inventory levels
     */
    static async adjustInventory(
        sku: string,
        quantity: number,
        type: "issue" | "receipt" | "return" | "adjustment",
    ) {
        const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(sku)
        const inventoryDoc = await inventoryRef.get()

        if (inventoryDoc.exists) {
            const currentQty = inventoryDoc.data()?.qty_on_hand || 0
            const newQty = type === "issue" ? currentQty - quantity : currentQty + quantity

            await inventoryRef.update({
                qty_on_hand: Math.max(0, newQty),
                last_movement: new Date(),
            })

            // Record inventory movement
            const movementId = `MOV-${Date.now()}`
            await db
                .collection(COLLECTIONS.INVENTORY_MOVEMENTS)
                .doc(movementId)
                .set({
                    id: movementId,
                    sku,
                    type,
                    quantity,
                    previous_qty: currentQty,
                    new_qty: Math.max(0, newQty),
                    date: new Date(),
                    created_at: new Date(),
                })
        }
    }

    /**
     * Create sales order and corresponding work order atomically (Idempotent Fix)
     * Uses website order ID as the sales order document ID for natural idempotency.
     * Repeated runs will use the same document path and not create duplicates.
     */
    static async createSalesOrder(websiteOrder: WebsiteOrder) {
        const now = Date.now()
        const salesOrderId = websiteOrder.id

        // Idempotency check: skip if sales order already exists
        const existingSO = await db.collection(COLLECTIONS.SALES_ORDERS).doc(salesOrderId).get()
        if (existingSO.exists) {
            console.log(`ℹ️ Sales order ${salesOrderId} already exists, skipping`)
            return
        }

        // Find or create customer (FIX-004: Lookup email if missing)
        let customerEmail = websiteOrder.customer_email
        if (!customerEmail && websiteOrder.userId) {
            console.log(`🔍 Looking up email for user ${websiteOrder.userId}...`)
            const userDoc = await db.collection(COLLECTIONS.USERS).doc(websiteOrder.userId).get()
            if (userDoc.exists) {
                customerEmail = userDoc.data()?.email
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
            created_at: new Date(),
        }

        // Generate work order alongside sales order with unique ID
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
            created_at: new Date(),
        }

        const batch = db.batch()
        batch.set(db.collection(COLLECTIONS.SALES_ORDERS).doc(salesOrderId), salesOrder)
        batch.set(db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId), workOrder)
        
        await batch.commit()
        console.log(`✅ Atomic: Created sales order ${salesOrderId} and work order ${workOrderId}`)
    }

    /**
     * Find or create customer
     */
    static async findOrCreateCustomer(email: string): Promise<string> {
        const customerSnapshot = await db.collection(COLLECTIONS.CUSTOMERS).where("email", "==", email).limit(1).get()

        if (!customerSnapshot.empty) {
            return customerSnapshot.docs[0].id
        }

        // Check users collection for name
        const usersRef = db.collection(COLLECTIONS.USERS)
        const userSnapshot = await usersRef.where("email", "==", email).limit(1).get()

        let name = email.split("@")[0] // Fallback
        if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data()
            name = userData.name || userData.displayName || name
        }

        // Create new customer
        const customerId = `CUST-${Date.now()}`
        const customer: Customer = {
            id: customerId,
            name,
            email,
            phone: "",
            address: "",
            created_at: new Date(),
        }

        await db.collection(COLLECTIONS.CUSTOMERS).doc(customerId).set(customer)
        return customerId
    }

    /**
     * Create work order
     */
    static async createWorkOrder(salesOrderId: string) {
        const workOrderId = `WO-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`

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
            created_at: new Date(),
        }

        await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).set(workOrder)
    }

    static async createJournalEntry(
        entryType: JournalEntryType,
        lines: JournalLine[],
        referenceDoc: string,
        notes?: string,
        userId: string = "system",
        customDate?: Date,
        tx?: FirebaseFirestore.Transaction
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        try {
            const now = new Date()
            const entryDate = customDate || new Date()

            // Validate balanced entry (pure logic, no DB reads needed)
            const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0)
            const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0)

            if (Math.abs(totalDebits - totalCredits) > 0.01) {
                return {
                    success: false,
                    error: `Journal entry not balanced: Debits=${totalDebits}, Credits=${totalCredits}`
                }
            }

            // Validate no line has both debit and credit, and no negative amounts
            for (const line of lines) {
                if (line.debit > 0 && line.credit > 0) {
                    return {
                        success: false,
                        error: `Line cannot have both debit and credit: ${line.accountName}`
                    }
                }
                if (line.debit < 0 || line.credit < 0) {
                    return {
                        success: false,
                        error: `Negative amounts not allowed: ${line.accountName}`
                    }
                }
            }

            // Validate fiscal period is open using direct doc lookup (safe in tx, no index needed)
            const entryYear = entryDate.getFullYear()
            const entryMonth = entryDate.getMonth() + 1
            const periodId = `FY-${entryYear}-${String(entryMonth).padStart(2, "0")}`
            const periodRef = db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId)
            const periodDoc = tx ? await tx.get(periodRef) : await periodRef.get()

            let isClosed = false
            let periodName = "Unknown"

            if (periodDoc.exists) {
                const period = periodDoc.data()!
                periodName = periodDoc.id
                if (period.status === "closed" || period.status === "locked") {
                    isClosed = true
                }
            }

            if (isClosed && entryType !== JournalEntryType.CLOSING_ENTRY) {
                return {
                    success: false,
                    error: `Cannot post to a closed or locked fiscal period: ${periodName}`
                }
            }

            // CHANGED: Use crypto.randomUUID() for collision-resistant ID generation
            const entryId = `JE-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

            const accountIds = Array.from(new Set(lines.map(l => l.accountCode)))

            // CHANGED: Read existing balance cache docs BEFORE writing (required by Firestore tx)
            const balanceSnapshots: Map<string, FirebaseFirestore.DocumentSnapshot> = new Map()
            for (const accountCode of accountIds) {
                const balRef = db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(accountCode)
                const balDoc = tx ? await tx.get(balRef) : await balRef.get()
                balanceSnapshots.set(accountCode, balDoc)
            }

            const journalEntry = {
                id: entryId,
                date: entryDate,
                type: entryType,
                reference_doc: referenceDoc,
                description: notes || `Journal entry for ${referenceDoc}`,
                entries: lines.map(line => ({
                    account_id: line.accountCode,
                    account_name: line.accountName,
                    debit: line.debit,
                    credit: line.credit,
                    description: line.description,
                })),
                account_ids: accountIds,
                total_debits: totalDebits,
                total_credits: totalCredits,
                created_at: now,
                created_by: userId,
            }

            // Write journal entry
            const jeRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId)
            if (tx) {
                tx.set(jeRef, journalEntry)
            } else {
                await jeRef.set(journalEntry)
            }

            // CHANGED: Update balance cache for each affected account (atomic with JE)
            for (const line of lines) {
                const balDoc = balanceSnapshots.get(line.accountCode)
                const existing = balDoc?.exists ? balDoc.data()! : { totalDebits: 0, totalCredits: 0 }
                const newTotalDebits = (existing.totalDebits || 0) + line.debit
                const newTotalCredits = (existing.totalCredits || 0) + line.credit
                const isDebit = isDebitNormalBalance(line.accountCode)
                const balance = isDebit
                    ? newTotalDebits - newTotalCredits
                    : newTotalCredits - newTotalDebits

                const balanceData = {
                    accountCode: line.accountCode,
                    totalDebits: newTotalDebits,
                    totalCredits: newTotalCredits,
                    balance,
                    lastEntryId: entryId,
                    updatedAt: now,
                }

                const balRef = db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(line.accountCode)
                if (tx) {
                    tx.set(balRef, balanceData)
                } else {
                    await balRef.set(balanceData)
                }
            }

            console.log(`✅ Journal entry ${entryId} created: ${entryType}`)
            return { success: true, entryId }

        } catch (error) {
            console.error("Error creating journal entry:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create journal entry"
            }
        }
    }

    /**
     * Record material issue from raw materials to WIP
     * DR: WIP Inventory
     * CR: Raw Materials Inventory
     */
    static async recordMaterialIssue(
        workOrderId: string,
        materials: Array<{ itemId: string; itemName: string; quantity: number; unitCost: number }>
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const totalCost = materials.reduce((sum, m) => sum + (m.quantity * m.unitCost), 0)

        if (totalCost <= 0) {
            return { success: false, error: "Total material cost must be positive" }
        }

        const lines: JournalLine[] = [
            {
            accountCode: ACCOUNT_CODES.WIP_MATERIALS,
            accountName: "WIP - Direct Materials",
            debit: totalCost,
            credit: 0,
            description: `Materials issued to WO: ${workOrderId}`,
        },
        {
            accountCode: ACCOUNTS.INVENTORY_RAW_MATERIALS,
                accountName: "Raw Materials Inventory",
                debit: 0,
                credit: totalCost,
                description: `Materials issued: ${materials.map(m => m.itemName).join(", ")}`,
            },
        ]

        const result = await this.createJournalEntry(
            JournalEntryType.MATERIAL_ISSUE_TO_WIP,
            lines,
            workOrderId,
            `Material issue for work order ${workOrderId}`
        )

        return { ...result, totalCost }
    }

    /**
     * Record labor applied to WIP
     * DR: WIP Inventory (1210)
     * CR: Wages Payable - Production (2120)
     */
    static async recordLaborApplied(
        workOrderId: string,
        laborHours: number,
        laborRate: number
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const totalCost = laborHours * laborRate

        if (totalCost <= 0) {
            return { success: false, error: "Labor cost must be positive" }
        }

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.WIP_LABOR,
                accountName: "WIP - Direct Labor",
                debit: totalCost,
                credit: 0,
                description: `Labor applied: ${laborHours} hours @ ${formatCurrency(laborRate)}/hr`,
            },
            {
                accountCode: ACCOUNTS.WAGES_PAYABLE,
                accountName: getAccountName(ACCOUNTS.WAGES_PAYABLE),
                debit: 0,
                credit: totalCost,
                description: `Direct labor for WO: ${workOrderId}`,
            },
        ]

        return {
            ...await this.createJournalEntry(
                JournalEntryType.LABOR_APPLIED,
                lines,
                workOrderId
            ),
            totalCost
        }
    }

    /**
     * Record overhead applied to WIP
     * DR: WIP Inventory
     * CR: Manufacturing Overhead Applied
     */
    static async recordOverheadApplied(
        workOrderId: string,
        overheadAmount: number
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (overheadAmount <= 0) {
            return { success: true } // Skip if no overhead
        }

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.WIP_OVERHEAD,
                accountName: "WIP - Overhead Applied",
                debit: overheadAmount,
                credit: 0,
                description: `Overhead applied to WO: ${workOrderId}`,
            },
            {
                accountCode: ACCOUNT_CODES.OH_APPLIED,
                accountName: "Manufacturing OH - Applied",
                debit: 0,
                credit: overheadAmount,
                description: `Overhead applied to WO: ${workOrderId}`,
            },
        ]

        return this.createJournalEntry(
            JournalEntryType.OVERHEAD_APPLIED,
            lines,
            workOrderId
        )
    }

    /**
     * Store estimated cost on work order (NO journal entry).
     * WIP is built up by actual material issues, labor applied, and overhead applied.
     * This avoids phantom assets and liabilities that previously inflated WIP and Accrued Liabilities.
     * Per IAS 2, WIP is valued at actual production cost, not estimated cost.
     */
    static async recordWIPOpening(
        workOrderId: string,
        estimatedCost: number
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (estimatedCost <= 0) {
            return { success: false, error: "Estimated cost must be positive" }
        }

        try {
            await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
                estimated_cost: estimatedCost,
                updated_at: new Date(),
            })
            console.log(`📋 Work order ${workOrderId}: estimated cost recorded as ${formatCurrency(estimatedCost)} (no journal entry)`)
            return { success: true, entryId: `EST-${workOrderId}` }
        } catch (error) {
            console.error("Error storing estimated cost on work order:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to store estimate" }
        }
    }

    /**
     * Transfer completed goods from WIP to Finished Goods
     * DR: Finished Goods Inventory (1220)
     * CR: WIP - Materials (1710), WIP - Labor (1711), WIP - Overhead (1712)
     */
    static async recordWIPToFinishedGoods(
        workOrderId: string,
        totalCost: number,
        tx?: FirebaseFirestore.Transaction
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (totalCost <= 0) {
            return { success: false, error: "Total cost must be positive" }
        }

        // Look up work order for cost breakdown
        let matCost = totalCost
        let labCost = 0
        let ohCost = 0
        try {
            const woDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get()
            if (woDoc.exists) {
                const wo = woDoc.data()!
                matCost = wo.material_cost || 0
                labCost = wo.labor_cost || 0
                ohCost = wo.overhead_cost || 0
            }
        } catch {}

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                accountName: "Finished Goods Inventory",
                debit: totalCost,
                credit: 0,
                description: `Completed production from WO: ${workOrderId}`,
            },
        ]

        // Credit WIP sub-accounts proportionally
        if (matCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_MATERIALS,
                accountName: "WIP - Direct Materials",
                debit: 0,
                credit: matCost,
                description: `Materials transferred to FG`,
            })
        }
        if (labCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_LABOR,
                accountName: "WIP - Direct Labor",
                debit: 0,
                credit: labCost,
                description: `Labor transferred to FG`,
            })
        }
        if (ohCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_OVERHEAD,
                accountName: "WIP - Overhead Applied",
                debit: 0,
                credit: ohCost,
                description: `Overhead transferred to FG`,
            })
        }

        // CHANGED: Pass tx through for transactional atomicity
        return this.createJournalEntry(
            JournalEntryType.WIP_TO_FINISHED_GOODS,
            lines,
            workOrderId,
            undefined,
            "system",
            undefined,
            tx
        )
    }

    /**
     * Record sales invoice and COGS.
     * If workOrderId is provided, auto-transfers WIP→Finished Goods before the sale.
     *
     * Entry 1 (Revenue): DR Accounts Receivable, CR Sales Revenue [+ CR VAT Payable]
     * Entry 2 (COGS):     DR COGS, CR Finished Goods Inventory
     * Entry 0 (optional): DR Finished Goods, CR WIP (if workOrderId supplied)
     */
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
        // CHANGED: Wrap all writes in a Firestore transaction for atomicity.
        // If WIP→FG transfer fails, revenue and COGS entries are never created.
        return db.runTransaction(async (tx) => {
            // Auto-transfer WIP→FG if work order is linked
            let wipTransferEntryId: string | undefined
            if (workOrderId && costOfGoodsSold > 0) {
                const wipTransfer = await this.recordWIPToFinishedGoods(workOrderId, costOfGoodsSold, tx)
                if (!wipTransfer.success) {
                    throw new Error(`WIP→FG transfer failed: ${wipTransfer.error}`)
                }
                wipTransferEntryId = wipTransfer.entryId
            }

            // Record revenue and AR (including VAT)
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

            const revenueResult = await this.createJournalEntry(
                JournalEntryType.SALES_INVOICE,
                revenueLines,
                invoiceId,
                undefined,
                "system",
                undefined,
                tx
            )

            if (!revenueResult.success) {
                throw new Error(revenueResult.error || "Revenue JE creation failed")
            }

            // Record COGS
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

            const cogsResult = await this.createJournalEntry(
                JournalEntryType.SALES_COGS,
                cogsLines,
                invoiceId,
                undefined,
                "system",
                undefined,
                tx
            )

            if (!cogsResult.success) {
                throw new Error(cogsResult.error || "COGS JE creation failed")
            }

            return {
                success: true,
                revenueEntryId: revenueResult.entryId,
                cogsEntryId: cogsResult.entryId,
                wipTransferEntryId,
            }
        }).catch(error => ({
            success: false,
            error: error instanceof Error ? error.message : "Transaction failed during sale recording"
        }))
    }

    /**
     * Record payment received
     * DR: Cash
     * CR: Accounts Receivable
     */
    static async recordPaymentReceived(
        paymentId: string,
        invoiceId: string,
        amount: number,
        paymentMethod: string,
        paymentAccountCode: string = ACCOUNTS.CASH
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        const accountName = paymentAccountCode === ACCOUNTS.BANK ? "Bank" : "Cash"
        
        const lines: JournalLine[] = [
            {
                accountCode: paymentAccountCode,
                accountName: accountName,
                debit: amount,
                credit: 0,
                description: `Payment ${paymentId} via ${paymentMethod}`,
            },
            {
                accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE,
                accountName: "Accounts Receivable",
                debit: 0,
                credit: amount,
                description: `Payment for invoice: ${invoiceId}`,
            },
        ]

        return this.createJournalEntry(
            JournalEntryType.PAYMENT_RECEIVED,
            lines,
            paymentId
        )
    }

    /**
     * Record payment made to vendor
     * DR: Accounts Payable
     * CR: Cash
     */
    static async recordPaymentMade(
        paymentId: string,
        vendorId: string,
        amount: number,
        description: string,
        paymentAccountCode: string = ACCOUNTS.CASH
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        const accountName = paymentAccountCode === ACCOUNTS.BANK ? "Bank" : "Cash"

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNTS.ACCOUNTS_PAYABLE,
                accountName: "Accounts Payable",
                debit: amount,
                credit: 0,
                description: `Payment to vendor: ${vendorId}`,
            },
            {
                accountCode: paymentAccountCode,
                accountName: accountName,
                debit: 0,
                credit: amount,
                description,
            },
        ]

        return this.createJournalEntry(
            JournalEntryType.PAYMENT_MADE,
            lines,
            paymentId
        )
    }

    /**
     * Get account balance from journal entries using account_ids index (BUG-014).
     * Optionally filter by date range for period-specific balances.
     */
    static async getAccountBalance(
        accountCode: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{ balance: number; error?: string }> {
        try {
            // CHANGED: Use cached balance for "all time" queries (most common case)
            if (!startDate && !endDate) {
                const balDoc = await db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(accountCode).get()
                if (balDoc.exists) {
                    const data = balDoc.data()!
                    return { balance: data.balance || 0 }
                }
                // Fallback to full scan if cache not yet populated (post-migration)
            }

            // Full scan for date-filtered or cache-miss queries
            let query = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                .where("account_ids", "array-contains", accountCode) as FirebaseFirestore.Query

            if (startDate) {
                query = query.where("date", ">=", startDate)
            }
            if (endDate) {
                query = query.where("date", "<=", endDate)
            }

            const entriesSnapshot = await query.get()

            let totalDebits = 0
            let totalCredits = 0

            for (const doc of entriesSnapshot.docs) {
                const entry = doc.data()
                if (entry.entries && Array.isArray(entry.entries)) {
                    for (const line of entry.entries) {
                        if (line.account_id === accountCode) {
                            totalDebits += line.debit || 0
                            totalCredits += line.credit || 0
                        }
                    }
                }
            }

            const isDebit = isDebitNormalBalance(accountCode)
            const balance = isDebit
                ? totalDebits - totalCredits
                : totalCredits - totalDebits

            return { balance }
        } catch (error) {
            return {
                balance: 0,
                error: error instanceof Error ? error.message : "Failed to get balance"
            }
        }
    }

    /**
     * Get trial balance (all accounts with balances).
     * Uses normal balance detection: debit-normal accounts show debit balances,
     * credit-normal accounts (liabilities, equity, revenue) show credit balances.
     */
    static async getTrialBalance(): Promise<{
        accounts: Array<{ code: string; name: string; debit: number; credit: number }>
        totalDebits: number
        totalCredits: number
    }> {
        const accounts: Array<{ code: string; name: string; debit: number; credit: number }> = []
        let totalDebits = 0
        let totalCredits = 0

        const accountsList = Object.entries(CHART_OF_ACCOUNTS) as [string, any][]

        for (const [code, account] of accountsList) {
            const { balance } = await this.getAccountBalance(code)

            if (balance !== 0) {
                // Determine which column the balance belongs in based on NORMAL balance
                const normalIsDebit = isDebitNormalBalance(code)
                const isDebit = (balance > 0 && normalIsDebit) || (balance < 0 && !normalIsDebit)

                const debitAmt = isDebit ? Math.abs(balance) : 0
                const creditAmt = !isDebit ? Math.abs(balance) : 0

                accounts.push({
                    code,
                    name: account.name,
                    debit: debitAmt,
                    credit: creditAmt,
                })

                totalDebits += debitAmt
                totalCredits += creditAmt
            }
        }

        return { accounts, totalDebits, totalCredits }
    }
    /**
     * Void a journal entry by creating a reversing entry
     */
    static async voidJournalEntry(entryId: string, userId: string): Promise<{ success: boolean; voidEntryId?: string; error?: string }> {
        try {
            const entryRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId)
            const entryDoc = await entryRef.get()
            
            if (!entryDoc.exists) {
                return { success: false, error: "Journal entry not found" }
            }
            
            const entryData = entryDoc.data()
            if (entryData?.voided) {
                return { success: false, error: "Journal entry is already voided" }
            }
            
            // Create reversing lines
            const reversingLines: JournalLine[] = entryData?.entries.map((line: any) => ({
                accountCode: line.account_id,
                accountName: line.account_name,
                debit: line.credit, // Swap debit and credit
                credit: line.debit,
                description: `VOID: ${line.description}`,
            }))
            
            const result = await this.createJournalEntry(
                entryData?.type as JournalEntryType,
                reversingLines,
                entryId,
                `Voided original entry: ${entryId}`,
                userId
            )
            
            if (result.success) {
                await entryRef.update({
                    voided: true,
                    voided_at: new Date(),
                    voided_by: userId,
                    reversing_entry_id: result.entryId
                })
            }
            
            return {
                success: result.success,
                voidEntryId: result.entryId,
                error: result.error
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to void entry"
            }
        }
    }
    /**
     * Dashboard data methods
     */
    static async getKPIData() {
        try {
            const [totalRevenue, totalCogs, workOrdersSnapshot] = await Promise.all([
                FinancialStatementsService.getAccountBalance(ACCOUNTS.SALES_REVENUE),
                FinancialStatementsService.getAccountBalance(ACCOUNTS.COGS),
                db.collection(COLLECTIONS.WORK_ORDERS).where("status", "==", "in_progress").get(),
            ])

            const wipValue = workOrdersSnapshot.docs.reduce((sum, doc) => {
                const workOrder = doc.data() as WorkOrder
                const materialCost = workOrder.raw_materials_used?.reduce((matSum, mat) => matSum + (mat.qty * (mat.cost || 0)), 0) || 0
                const laborCost = workOrder.labor_cost || 0
                return sum + materialCost + laborCost
            }, 0)

            return {
                revenue: totalRevenue,
                cogs: totalCogs,
                profit: totalRevenue - totalCogs,
                wipValue,
            }
        } catch (error) {
            console.error("Error getting KPI data:", error)
            return {
                revenue: 0,
                cogs: 0,
                profit: 0,
                wipValue: 0,
            }
        }
    }

    static async getMonthlyRevenue() {
        try {
            const now = new Date()
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

            // Optimized (BUG-Fix): Fetch ALL aggregated journal entries for both Revenue and COGS in one pass
            const entriesSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                .where("date", ">=", sixMonthsAgo)
                .get()

            const allEntries = entriesSnapshot.docs.map(doc => doc.data())
            const monthlyData = []

            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
                const monthName = date.toLocaleDateString("en", { month: "short" })

                let monthRevenue = 0
                let monthCogs = 0

                allEntries.forEach((entry: any) => {
                    const entryDate = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date)
                    if (entryDate.getMonth() === date.getMonth() && entryDate.getFullYear() === date.getFullYear()) {
                        // Aggregate credits (Revenue) and debits (COGS) for unified source accounting
                        entry.entries?.forEach((e: any) => {
                            if (e.account_id === ACCOUNTS.SALES_REVENUE) {
                                monthRevenue += (e.credit || 0) - (e.debit || 0)
                            }
                            if (e.account_id === ACCOUNTS.COGS) {
                                monthCogs += (e.debit || 0) - (e.credit || 0)
                            }
                        })
                    }
                })

                monthlyData.push({
                    month: monthName,
                    revenue: monthRevenue,
                    cogs: monthCogs,
                })
            }

            return monthlyData
        } catch (error) {
            console.error("Error getting monthly revenue:", error)
            return []
        }
    }

    static async getTopCustomers() {
        try {
            const invoicesSnapshot = await db.collection(COLLECTIONS.INVOICES).where("status", "==", "paid").get()
            const customerTotals = new Map<string, number>()

            invoicesSnapshot.docs.forEach(doc => {
                const invoice = doc.data() as any
                const current = customerTotals.get(invoice.customer_id) || 0
                customerTotals.set(invoice.customer_id, current + (invoice.amount || 0))
            })

            // Optimization (BUG-3.9): Batch customer reads using Promise.all
            const customerIds = Array.from(customerTotals.keys())
            const customerDocs = await Promise.all(
                customerIds.map(id => db.collection(COLLECTIONS.CUSTOMERS).doc(id).get())
            )

            const topCustomers = customerDocs.map((doc, index) => {
                const customer = doc.data() as Customer
                const total = customerTotals.get(customerIds[index]) || 0
                return { name: customer?.name || customerIds[index], total }
            })

            return topCustomers
                .sort((a, b) => b.total - a.total)
                .slice(0, 5)
        } catch (error) {
            console.error("Error getting top customers:", error)
            return []
        }
    }

    static async getRecentOrders() {
        try {
            const salesOrdersSnapshot = await db.collection(COLLECTIONS.SALES_ORDERS)
                .orderBy("created_at", "desc")
                .limit(10)
                .get()

            const orders = salesOrdersSnapshot.docs.map(doc => {
                const order = doc.data() as any
                const total = order.items?.reduce(
                    (sum: number, item: any) => sum + ((item.qty || 1) * (item.unit_price || 0)), 0
                ) || 0
                return { doc, order, total }
            })

            // CHANGED: Batch-read all customers in a single round-trip using getAll
            const customerIds = [...new Set(orders.map(o => o.order.customer_id).filter(Boolean))]
            const customerDocs = customerIds.length > 0
                ? await db.getAll(...customerIds.map(id => db.collection(COLLECTIONS.CUSTOMERS).doc(id)))
                : []

            const customerMap = new Map<string, string>()
            for (const cDoc of customerDocs) {
                if (cDoc.exists) {
                    const c = cDoc.data() as Customer
                    customerMap.set(cDoc.id, c?.name || cDoc.id)
                }
            }

            const recentOrders = orders.map(({ order }) => ({
                id: order.id,
                customerName: customerMap.get(order.customer_id) || order.customer_id,
                total: orders.find(o => o.order.id === order.id)?.total || 0,
                status: order.status,
                createdAt: order.created_at,
            }))

            return recentOrders
        } catch (error) {
            console.error("Error getting recent orders:", error)
            return []
        }
    }

    static async getInventoryAlerts() {
        try {
            const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()
            const alerts: any[] = []

            inventorySnapshot.docs.forEach(doc => {
                const item = doc.data() as any
                if (item.qty_on_hand <= (item.reorder_point || 10)) {
                    alerts.push({
                        sku: item.sku,
                        name: item.name,
                        currentStock: item.qty_on_hand,
                        reorderPoint: item.reorder_point || 10,
                    })
                }
            })

            return alerts
        } catch (error) {
            console.error("Error getting inventory alerts:", error)
            return []
        }
    }

    static async getWorkOrderStatus() {
        try {
            const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS).get()
            const statusCounts = {
                pending: 0,
                in_progress: 0,
                completed: 0,
                invoiced: 0,
            }
            const active: any[] = []

            workOrdersSnapshot.docs.forEach(doc => {
                const workOrder = doc.data() as WorkOrder
                statusCounts[workOrder.status as keyof typeof statusCounts]++
                
                if (workOrder.status !== "completed") {
                    active.push({
                        id: workOrder.id,
                        salesOrderId: workOrder.sales_order_id,
                        status: workOrder.status,
                    })
                }
            })

            return {
                ...statusCounts,
                active: active.slice(0, 10),
            }
        } catch (error) {
            console.error("Error getting work order status:", error)
            return {
                pending: 0,
                in_progress: 0,
                completed: 0,
                invoiced: 0,
                active: [],
            }
        }
    }
    /**
     * Record monthly depreciation for a specific asset
     * DR: Depreciation Expense (6007 or 5008)
     * CR: Accumulated Depreciation (135x)
     */
    static async recordDepreciation(
        assetEntryId: string,
        year: number,
        month: number,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        try {
            // 1. Fetch asset acquisition entry
            const assetDoc = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(assetEntryId).get()
            if (!assetDoc.exists) {
                return { success: false, error: "Asset acquisition entry not found" }
            }

            const assetData = assetDoc.data() as any
            const metadata = assetData.metadata || {}
            
            if (!metadata.useful_life_years) {
                return { success: false, error: "Asset is non-depreciable or missing useful life" }
            }

            // 2. Calculate monthly depreciation
            const cost = assetData.total_debits || 0
            const salvageValue = metadata.salvage_value || 0
            const usefulLifeMonths = metadata.useful_life_years * 12
            const monthlyAmount = Math.round(((cost - salvageValue) / usefulLifeMonths) * 100) / 100

            if (monthlyAmount <= 0) {
                return { success: false, error: "Calculated depreciation amount is zero or negative" }
            }

            // 3. Identify accounts
            const assetAccount = assetData.account_ids?.find((id: string) => id.startsWith('13') || id.startsWith('14'))
            if (!assetAccount) {
                return { success: false, error: "Could not identify asset account for depreciation" }
            }

            // Map accumulated depreciation account
            let accumDepAccount = "1352" // Default Equipment
            if (assetAccount === "1301" || assetAccount === "1302") accumDepAccount = "1351"
            else if (assetAccount === "1304" || assetAccount === "1305" || assetAccount === "1306") accumDepAccount = "1353"
            else if (assetAccount === "1307") accumDepAccount = "1354"
            else if (assetAccount.startsWith("14")) accumDepAccount = "1491" // Intangibles

            // Map expense account (Factory vs Office)
            const expenseAccount = (assetAccount === "1301" || assetAccount === "1302" || assetAccount === "1303") 
                ? "5008" // Factory Depreciation (COGS)
                : "6007" // Office Depreciation (Expense)

            // 4. Check for existing depreciation for this month/asset
            const referenceId = `DEP-${assetEntryId}-${year}-${month + 1}`
            const existingEntry = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                .where("reference_doc", "==", referenceId)
                .limit(1)
                .get()

            if (!existingEntry.empty) {
                return { success: false, error: "Depreciation already recorded for this month" }
            }

            // 5. Create journal entry
            const lines: JournalLine[] = [
                {
                    accountCode: expenseAccount,
                    accountName: getAccountName(expenseAccount),
                    debit: monthlyAmount,
                    credit: 0,
                    description: `Monthly depreciation: ${assetData.description} (${month+1}/${year})`
                },
                {
                    accountCode: accumDepAccount,
                    accountName: getAccountName(accumDepAccount),
                    debit: 0,
                    credit: monthlyAmount,
                    description: `Accumulated depreciation: ${assetData.description}`
                }
            ]

            return await this.createJournalEntry(
                JournalEntryType.DEPRECIATION,
                lines,
                referenceId,
                `Depreciation for ${assetData.description} - Period ${month+1}/${year}`,
                userId
            )

        } catch (error) {
            console.error("Error recording depreciation:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to record depreciation"
            }
        }
    }

    // ─── Manufacturing gap-fill methods ────────────────────────────────────────

    /**
     * Record scrap during production (IAS 2.16).
     *
     * Normal scrap (isAbnormal=false):
     *   DR  WIP — Job (1210)               salvageValue   (net cost stays in job)
     *   DR  Scrap Inventory (1205)          salvageValue
     *   CR  WIP — Job (1210)               totalCost      (full scrap cost out of WIP)
     *
     * Abnormal scrap (isAbnormal=true) — period expense:
     *   DR  Rework & Abnormal Spoilage (6209)   totalCost − salvageValue
     *   DR  Scrap Inventory (1205)               salvageValue
     *   CR  WIP — Job (1210)                     totalCost
     */
    static async recordScrap(
        workOrderId: string,
        sku: string,
        quantityScrapped: number,
        unitCost: number,
        salvageValue: number,
        isAbnormal: boolean,
        reason: string,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; recordId?: string; error?: string }> {
        const totalCost = quantityScrapped * unitCost
        if (totalCost <= 0) return { success: false, error: "Scrap cost must be positive" }
        if (salvageValue < 0 || salvageValue > totalCost) {
            return { success: false, error: "Salvage value must be between 0 and total scrap cost" }
        }

        const netLoss = totalCost - salvageValue
        const lines: JournalLine[] = []

        if (isAbnormal) {
            // Period expense — never hits job cost
            if (netLoss > 0) {
                lines.push({
                    accountCode: ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE, // 6209
                    accountName: getAccountName(ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE),
                    debit: netLoss,
                    credit: 0,
                    description: `Abnormal spoilage: ${sku} × ${quantityScrapped} units (${reason})`,
                })
            }
        } else {
            // Normal scrap — net cost stays in WIP; only salvage moves to scrap inventory
            // No additional debit needed — WIP bears the net cost implicitly
        }

        if (salvageValue > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.SCRAP_INVENTORY, // 1205
                accountName: getAccountName(ACCOUNT_CODES.SCRAP_INVENTORY),
                debit: salvageValue,
                credit: 0,
                description: `Salvage value: ${sku} scrap`,
            })
        }

        // Always credit WIP for the full scrap cost
        lines.push({
            accountCode: ACCOUNT_CODES.INVENTORY_WIP, // 1210
            accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
            debit: 0,
            credit: totalCost,
            description: `Scrap from WO ${workOrderId}: ${quantityScrapped} × ${sku}`,
        })

        // Normal scrap: WIP absorbs net cost — re-debit WIP for net loss portion
        if (!isAbnormal && netLoss > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.INVENTORY_WIP,
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
                debit: netLoss,
                credit: 0,
                description: `Normal scrap net cost charged to WO ${workOrderId}`,
            })
        }

        const result = await this.createJournalEntry(
            JournalEntryType.SCRAP_RECORD,
            lines,
            workOrderId,
            `Scrap record: ${quantityScrapped} × ${sku} from WO ${workOrderId}`,
            userId
        )

        if (!result.success) return result

        // Persist scrap record document
        const recordId = `SCRAP-${Date.now()}`
        await db.collection(COLLECTIONS.SCRAP_RECORDS).doc(recordId).set({
            id: recordId,
            workOrderId,
            sku,
            quantityScrapped,
            unitCost,
            totalCost,
            salvageValue,
            isAbnormal,
            reason,
            journalEntryId: result.entryId,
            created_at: new Date(),
            created_by: userId,
        })

        return { ...result, recordId }
    }

    /**
     * Record rework costs against an original work order.
     *
     * Normal rework (isNormal=true) — charged to job:
     *   DR  WIP — Job (1210)               total rework cost
     *   CR  Raw Materials Inventory         additionalMaterialCost
     *   CR  Wages Payable - Production      additionalLaborCost
     *   CR  Manufacturing Overhead Applied  additionalOverheadCost
     *
     * Abnormal rework (isNormal=false) — period expense:
     *   DR  Rework & Abnormal Spoilage (6209)   total rework cost
     *   CR  Raw Materials Inventory              additionalMaterialCost
     *   CR  Wages Payable - Production           additionalLaborCost
     *   CR  Manufacturing Overhead Applied       additionalOverheadCost
     */
    static async recordRework(
        originalWorkOrderId: string,
        additionalMaterialCost: number,
        additionalLaborCost: number,
        additionalOverheadCost: number,
        isNormalRework: boolean,
        reason: string,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; reworkOrderId?: string; error?: string }> {
        const totalReworkCost = additionalMaterialCost + additionalLaborCost + additionalOverheadCost
        if (totalReworkCost <= 0) return { success: false, error: "Rework cost must be positive" }

        const debitAccount = isNormalRework
            ? ACCOUNT_CODES.INVENTORY_WIP            // Normal → into job
            : ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE  // Abnormal → period cost

        const lines: JournalLine[] = [
            {
                accountCode: debitAccount,
                accountName: getAccountName(debitAccount),
                debit: totalReworkCost,
                credit: 0,
                description: `Rework for WO ${originalWorkOrderId}: ${reason}`,
            },
        ]

        if (additionalMaterialCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.RAW_MATERIALS_FABRIC, // 1201
                accountName: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
                debit: 0,
                credit: additionalMaterialCost,
                description: `Rework materials`,
            })
        }
        if (additionalLaborCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION, // 2120
                accountName: getAccountName(ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION),
                debit: 0,
                credit: additionalLaborCost,
                description: `Rework direct labor`,
            })
        }
        if (additionalOverheadCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.MANUFACTURING_OVERHEAD, // 5004
                accountName: getAccountName(ACCOUNT_CODES.MANUFACTURING_OVERHEAD),
                debit: 0,
                credit: additionalOverheadCost,
                description: `Rework overhead`,
            })
        }

        const result = await this.createJournalEntry(
            JournalEntryType.REWORK_COSTS,
            lines,
            originalWorkOrderId,
            `Rework costs for WO ${originalWorkOrderId}`,
            userId
        )

        if (!result.success) return result

        const reworkOrderId = `RWK-${Date.now()}`
        await db.collection(COLLECTIONS.REWORK_ORDERS).doc(reworkOrderId).set({
            id: reworkOrderId,
            originalWorkOrderId,
            reason,
            additionalMaterialCost,
            additionalLaborCost,
            additionalOverheadCost,
            totalReworkCost,
            isNormalRework,
            journalEntryId: result.entryId,
            status: "completed",
            created_at: new Date(),
            created_by: userId,
        })

        return { ...result, reworkOrderId }
    }

    /**
     * Record detailed labor with regular / overtime / idle-time split.
     *
     * Regular & OT hours → DR WIP (product cost).
     * Idle time → DR Rework & Spoilage (6209) as period cost.
     *
     * DR  WIP — Job (1210)               (regularHours × regularRate) + (otHours × otRate)
     * DR  Rework & Spoilage (6209)        idleHours × regularRate
     *     CR  Wages Payable - Production           total wages
     */
    static async recordLaborDetailed(
        workOrderId: string,
        regularHours: number,
        regularRate: number,
        overtimeHours: number = 0,
        overtimeRate: number = 0,
        idleHours: number = 0,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const regularCost  = regularHours  * regularRate
        const overtimeCost = overtimeHours * overtimeRate
        const idleCost     = idleHours     * regularRate   // idle at base rate
        const totalWages   = regularCost + overtimeCost + idleCost

        if (totalWages <= 0) return { success: false, error: "Total wages must be positive" }

        const productiveCost = regularCost + overtimeCost
        const lines: JournalLine[] = []

        if (productiveCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.INVENTORY_WIP,
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
                debit: productiveCost,
                credit: 0,
                description: `Labor: ${regularHours}h regular + ${overtimeHours}h OT on WO ${workOrderId}`,
            })
        }
        if (idleCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE, // 6209 — idle time is period cost
                accountName: getAccountName(ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE),
                debit: idleCost,
                credit: 0,
                description: `Idle time: ${idleHours}h @ ${formatCurrency(regularRate)}/hr`,
            })
        }
        lines.push({
            accountCode: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION,
            accountName: getAccountName(ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION),
            debit: 0,
            credit: totalWages,
            description: `Total wages payable for WO ${workOrderId}`,
        })

        return {
            ...await this.createJournalEntry(
                JournalEntryType.LABOR_APPLIED,
                lines,
                workOrderId,
                `Detailed labor for WO ${workOrderId}`,
                userId
            ),
            totalCost: productiveCost,
        }
    }

    /**
     * Record FX gain or loss on a foreign-currency transaction (IAS 21.28).
     *
     * Gain:  DR  Cash/AR/AP account          exchangeDiff
     *            CR  FX Gain/Loss (7004)              exchangeDiff
     *
     * Loss:  DR  FX Gain/Loss (7004)         exchangeDiff
     *            CR  Cash/AR/AP account               exchangeDiff
     */
    static async recordFXGainLoss(
        referenceDoc: string,
        accountCode: string,         // the monetary asset/liability revalued
        exchangeDifference: number,  // positive = gain, negative = loss
        description: string,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (exchangeDifference === 0) return { success: true }

        const isGain = exchangeDifference > 0
        const amount  = Math.abs(exchangeDifference)

        const lines: JournalLine[] = isGain
            ? [
                {
                    accountCode,
                    accountName: getAccountName(accountCode),
                    debit: amount,
                    credit: 0,
                    description,
                },
                {
                    accountCode: ACCOUNT_CODES.FX_GAIN_LOSS, // 7004
                    accountName: getAccountName(ACCOUNT_CODES.FX_GAIN_LOSS),
                    debit: 0,
                    credit: amount,
                    description: `FX gain on ${referenceDoc}`,
                },
            ]
            : [
                {
                    accountCode: ACCOUNT_CODES.FX_GAIN_LOSS, // 7004
                    accountName: getAccountName(ACCOUNT_CODES.FX_GAIN_LOSS),
                    debit: amount,
                    credit: 0,
                    description: `FX loss on ${referenceDoc}`,
                },
                {
                    accountCode,
                    accountName: getAccountName(accountCode),
                    debit: 0,
                    credit: amount,
                    description,
                },
            ]

        return this.createJournalEntry(
            JournalEntryType.FX_ADJUSTMENT,
            lines,
            referenceDoc,
            `FX ${isGain ? "gain" : "loss"} ${formatCurrency(amount)} on ${referenceDoc} (IAS 21.28)`,
            userId
        )
    }

    /**
     * Accrue corporate income tax for a fiscal period (Egypt rate: 22.5%).
     *
     * DR  Income Tax Expense (7005)        taxAmount
     *     CR  Tax Payable (2130)                    taxAmount
     */
    static async recordIncomeTaxAccrual(
        fiscalPeriodId: string,
        taxableIncome: number,
        taxRate: number = 0.225,    // Egypt standard rate 22.5%
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; taxAmount?: number; error?: string }> {
        if (taxableIncome <= 0) {
            return { success: true, taxAmount: 0 } // No tax on a loss
        }

        const taxAmount = Math.round(taxableIncome * taxRate * 100) / 100

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.INCOME_TAX_EXPENSE, // 7005
                accountName: getAccountName(ACCOUNT_CODES.INCOME_TAX_EXPENSE),
                debit: taxAmount,
                credit: 0,
                description: `Income tax @ ${(taxRate * 100).toFixed(1)}% on ${taxableIncome} taxable income`,
            },
            {
                accountCode: ACCOUNT_CODES.TAX_PAYABLE, // 2130
                accountName: getAccountName(ACCOUNT_CODES.TAX_PAYABLE),
                debit: 0,
                credit: taxAmount,
                description: `Income tax payable for period ${fiscalPeriodId}`,
            },
        ]

        return {
            ...await this.createJournalEntry(
                JournalEntryType.INCOME_TAX_ACCRUAL,
                lines,
                fiscalPeriodId,
                `Income tax accrual for ${fiscalPeriodId} (${formatCurrency(taxAmount)})`,
                userId
            ),
            taxAmount,
        }
    }

    /**
     * Write down inventory to net realisable value (IAS 2.9).
     * Must be called when NRV < cost for a specific SKU.
     *
     * DR  Inventory Write-down to NRV (6210)         writeDownAmount
     *     CR  Allowance for Inventory Obsolescence (1241)     writeDownAmount
     */
    static async recordInventoryWriteDown(
        sku: string,
        currentCost: number,
        netRealisableValue: number,
        quantityOnHand: number,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; writeDownAmount?: number; error?: string }> {
        if (netRealisableValue >= currentCost) {
            return { success: true, writeDownAmount: 0 } // No write-down needed
        }
        if (quantityOnHand <= 0) {
            return { success: false, error: "Quantity on hand must be positive" }
        }

        const writeDownAmount = Math.round((currentCost - netRealisableValue) * quantityOnHand * 100) / 100

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.INVENTORY_WRITEDOWN_NRV, // 6210
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WRITEDOWN_NRV),
                debit: writeDownAmount,
                credit: 0,
                description: `NRV write-down: ${sku} — cost ${formatCurrency(currentCost)}/unit, NRV ${formatCurrency(netRealisableValue)}/unit × ${quantityOnHand} units`,
            },
            {
                accountCode: ACCOUNT_CODES.ALLOWANCE_INVENTORY_OBSOLESCENCE, // 1241
                accountName: getAccountName(ACCOUNT_CODES.ALLOWANCE_INVENTORY_OBSOLESCENCE),
                debit: 0,
                credit: writeDownAmount,
                description: `Provision for inventory obsolescence: ${sku}`,
            },
        ]

        return {
            ...await this.createJournalEntry(
                JournalEntryType.INVENTORY_WRITEDOWN,
                lines,
                `NRV-${sku}-${Date.now()}`,
                `IAS 2.9 NRV write-down for ${sku}: ${formatCurrency(writeDownAmount)}`,
                userId
            ),
            writeDownAmount,
        }
    }

    /**
     * Process and mark overdue invoices (Fix-M4)
     */
    static async processOverdueInvoices(): Promise<{ processed: number; errors: number }> {
        try {
            const now = new Date()
            const snapshot = await db.collection(COLLECTIONS.INVOICES)
                .where("status", "in", ["unpaid", "partial"])
                .get()

            const batch = db.batch()
            let count = 0
            
            snapshot.forEach(doc => {
                const invoice = doc.data()
                // Convert due_date if it's a string, timestamp or missing
                let dueDate: Date | null = null
                if (invoice.due_date?.toDate) {
                    dueDate = invoice.due_date.toDate()
                } else if (invoice.due_date) {
                    dueDate = new Date(invoice.due_date)
                }
                
                if (dueDate && dueDate < now) {
                    batch.update(doc.ref, { 
                        status: "overdue",
                        updated_at: now
                    })
                    count++
                }
            })

            if (count > 0) {
                await batch.commit()
            }
            
            console.log(`✅ Processed ${count} overdue invoices`)
            return { processed: count, errors: 0 }
        } catch (error) {
            console.error("Error processing overdue invoices:", error)
            return { processed: 0, errors: 1 }
        }
    }
}
