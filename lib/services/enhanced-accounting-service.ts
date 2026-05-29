import { db, COLLECTIONS, FieldValue } from "../firebase"
import type { Customer, SalesOrder, WorkOrder, Invoice, Payment, JournalEntry, WebsiteOrder } from "../types"
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS, getAccountName, isDebitNormalBalance } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { FinancialStatementsService } from "./financial-statements-service"
import { JournalEntryService, JournalEntryType, JournalLine } from "./journal-entry-service"
import { SalesAccountingService } from "./sales-accounting-service"
import { InventoryAccountingService } from "./inventory-accounting-service"
import { ManufacturingAccountingService } from "./manufacturing-accounting-service"

export { JournalEntryType }
export type { JournalLine }


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
        return SalesAccountingService.syncWebsiteOrders()
    }

    /**
     * Process website returns (for cron job)
     */
    static async syncWebsiteReturns() {
        return SalesAccountingService.syncWebsiteReturns()
    }

    /**
     * Process individual return
     */
    public static async processReturn(
        returnData: ReturnData
    ): Promise<{ success: boolean; creditMemoId?: string; error?: string }> {
        return SalesAccountingService.processReturn(returnData)
    }

    /**
     * Update inventory valuations (for cron job)
     */
    static async updateInventoryValuations() {
        return InventoryAccountingService.updateInventoryValuations()
    }

    /**
     * Adjust inventory levels
     */
    static async adjustInventory(
        sku: string,
        quantity: number,
        type: "issue" | "receipt" | "return" | "adjustment",
    ) {
        return InventoryAccountingService.adjustInventory(sku, quantity, type)
    }

    /**
     * Create sales order and corresponding work order atomically (Idempotent Fix)
     * Uses website order ID as the sales order document ID for natural idempotency.
     * Repeated runs will use the same document path and not create duplicates.
     */
    static async createSalesOrder(websiteOrder: WebsiteOrder) {
        return SalesAccountingService.createSalesOrder(websiteOrder)
    }

    /**
     * Find or create customer
     */
    static async findOrCreateCustomer(email: string): Promise<string> {
        return SalesAccountingService.findOrCreateCustomer(email)
    }

    /**
     * Create work order
     */
    static async createWorkOrder(salesOrderId: string) {
        return ManufacturingAccountingService.createWorkOrder(salesOrderId)
    }

    static async createJournalEntry(
        entryType: JournalEntryType,
        lines: JournalLine[],
        referenceDoc: string,
        notes?: string,
        userId: string = "system",
        customDate?: Date,
        tx?: FirebaseFirestore.Transaction,
        metadata?: Record<string, unknown>
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        return JournalEntryService.createJournalEntry(entryType, lines, referenceDoc, notes, userId, customDate, tx, metadata)
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
        return InventoryAccountingService.recordMaterialIssue(workOrderId, materials)
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
        return ManufacturingAccountingService.recordLaborApplied(workOrderId, laborHours, laborRate)
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
        return ManufacturingAccountingService.recordOverheadApplied(workOrderId, overheadAmount)
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
        return ManufacturingAccountingService.recordWIPOpening(workOrderId, estimatedCost)
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
        return ManufacturingAccountingService.recordWIPToFinishedGoods(workOrderId, totalCost, tx)
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
        return SalesAccountingService.recordSale(invoiceId, salesAmount, costOfGoodsSold, vatAmount, workOrderId)
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
        return JournalEntryService.voidJournalEntry(entryId, userId)
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
        return ManufacturingAccountingService.recordScrap(workOrderId, sku, quantityScrapped, unitCost, salvageValue, isAbnormal, reason, userId)
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
        return ManufacturingAccountingService.recordRework(originalWorkOrderId, additionalMaterialCost, additionalLaborCost, additionalOverheadCost, isNormalRework, reason, userId)
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
        return ManufacturingAccountingService.recordLaborDetailed(workOrderId, regularHours, regularRate, overtimeHours, overtimeRate, idleHours, userId)
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
        return InventoryAccountingService.recordInventoryWriteDown(sku, currentCost, netRealisableValue, quantityOnHand, userId)
    }

    /**
     * Process and mark overdue invoices (Fix-M4)
     */
    static async processOverdueInvoices(): Promise<{ processed: number; errors: number }> {
        return SalesAccountingService.processOverdueInvoices()
    }
}
