import { supabase, TABLES, getServiceSupabase } from "../supabase"
import type { Customer, SalesOrder, WorkOrder, Invoice, Payment, JournalEntry, WebsiteOrder } from "../types"
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS, getAccountName, isDebitNormalBalance } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { FinancialStatementsService } from "./financial-statements-service"
import { JournalEntryService } from "./journal-entry-service"
import { SalesAccountingService } from "./sales-accounting-service"
import { InventoryAccountingService } from "./inventory-accounting-service"
import { ManufacturingAccountingService } from "./manufacturing-accounting-service"

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
            { code: ACCOUNT_CODES.CASH_ON_HAND, name: "Cash", type: "asset" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: "Accounts Receivable", type: "asset" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.RAW_MATERIALS_FABRIC, name: "Raw Materials Inventory", type: "asset" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.INVENTORY_WIP, name: "Work in Progress", type: "asset" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS, name: "Finished Goods Inventory", type: "asset" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.SALES_RETAIL, name: "Sales Revenue", type: "revenue" as const, normal_balance: "credit" as const },
            { code: ACCOUNT_CODES.COST_OF_GOODS_SOLD, name: "Cost of Goods Sold", type: "expense" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.SALES_RETURNS, name: "Returns and Allowances", type: "contra_revenue" as const, normal_balance: "debit" as const },
            { code: ACCOUNT_CODES.VAT_PAYABLE, name: "VAT Payable", type: "liability" as const, normal_balance: "credit" as const },
        ]

        const { error } = await getServiceSupabase()
            .from(TABLES.CHART_OF_ACCOUNTS)
            .upsert(accounts, { onConflict: "code" })

        if (error) console.error("Error initializing chart of accounts:", error)
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
        userId: string | null = null,
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
            const client = getServiceSupabase()

            if (!startDate && !endDate) {
                const { data } = await client
                    .from(TABLES.ACCOUNT_BALANCES)
                    .select("closing_balance")
                    .eq("account_code", accountCode)
                    .order("period_end", { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (data) {
                    return { balance: data.closing_balance || 0 }
                }
            }

            let query = client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .select("debit, credit, journal_entries!inner(date)")
                .eq("account_code", accountCode)

            if (startDate) {
                query = query.gte("journal_entries.date", startDate.toISOString().split("T")[0])
            }
            if (endDate) {
                query = query.lte("journal_entries.date", endDate.toISOString().split("T")[0])
            }

            const { data: lines, error } = await query

            if (error) {
                console.error("Error querying journal entry lines:", error)
                return { balance: 0, error: error.message }
            }

            let totalDebits = 0
            let totalCredits = 0

            for (const line of (lines || [])) {
                totalDebits += line.debit || 0
                totalCredits += line.credit || 0
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

        const client = getServiceSupabase()
        const allCodes = Object.keys(CHART_OF_ACCOUNTS)

        const { data: balanceRows } = await client
            .from(TABLES.ACCOUNT_BALANCES)
            .select("account_code, closing_balance, period_end")
            .in("account_code", allCodes)
            .order("period_end", { ascending: false })

        const balanceMap = new Map<string, number>()
        for (const row of (balanceRows || [])) {
            if (!balanceMap.has(row.account_code)) {
                balanceMap.set(row.account_code, row.closing_balance || 0)
            }
        }

        const uncachedCodes = allCodes.filter(c => !balanceMap.has(c))
        if (uncachedCodes.length > 0) {
            const { data: lines } = await client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .select("account_code, debit, credit")
                .in("account_code", uncachedCodes)

            const lineTotals = new Map<string, { d: number; c: number }>()
            for (const line of (lines || [])) {
                const t = lineTotals.get(line.account_code) || { d: 0, c: 0 }
                t.d += line.debit || 0
                t.c += line.credit || 0
                lineTotals.set(line.account_code, t)
            }

            for (const code of uncachedCodes) {
                const t = lineTotals.get(code) || { d: 0, c: 0 }
                const balance = isDebitNormalBalance(code)
                    ? t.d - t.c
                    : t.c - t.d
                balanceMap.set(code, balance)
            }
        }

        const accountsList = Object.entries(CHART_OF_ACCOUNTS) as [string, any][]
        for (const [code, account] of accountsList) {
            const balance = balanceMap.get(code) || 0

            if (balance !== 0) {
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
            const client = getServiceSupabase()
            const [totalRevenue, totalCogs, { data: workOrders }] = await Promise.all([
                FinancialStatementsService.getAccountBalance(ACCOUNTS.SALES_REVENUE),
                FinancialStatementsService.getAccountBalance(ACCOUNTS.COGS),
                client.from(TABLES.WORK_ORDERS).select("*").eq("status", "in_progress"),
            ])

            const wipValue = (workOrders || []).reduce((sum: any, wo: any) => {
                const materialCost = (wo.raw_materials_used as any[])?.reduce((matSum, mat) => matSum + (mat.qty * (mat.cost || 0)), 0) || 0
                const laborCost = wo.labor_cost || 0
                const overheadCost = wo.overhead_cost || 0
                return sum + materialCost + laborCost + overheadCost
            }, 0)

            return {
                revenue: totalRevenue,
                cogs: totalCogs,
                profit: totalRevenue - totalCogs,
                wipValue,
            }
        } catch (error) {
            console.error("Error getting KPI data:", error)
            return { revenue: 0, cogs: 0, profit: 0, wipValue: 0 }
        }
    }

    static async getMonthlyRevenue() {
        try {
            const now = new Date()
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
            const client = getServiceSupabase()

            const { data: entries } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .select(`id, date, ${TABLES.JOURNAL_ENTRY_LINES}(account_code, debit, credit)`)
                .gte("date", sixMonthsAgo.toISOString().split("T")[0])
                .lte("date", now.toISOString().split("T")[0])

            const allEntries = entries || []
            const monthlyData = []

            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
                const monthName = date.toLocaleDateString("en", { month: "short" })

                let monthRevenue = 0
                let monthCogs = 0

                for (const entry of allEntries) {
                    const entryDate = new Date(entry.date)
                    if (entryDate.getMonth() === date.getMonth() && entryDate.getFullYear() === date.getFullYear()) {
                        const lines = (entry as any).journal_entry_lines || []
                        for (const line of lines) {
                            if (line.account_code === ACCOUNTS.SALES_REVENUE) {
                                monthRevenue += (line.credit || 0) - (line.debit || 0)
                            }
                            if (line.account_code === ACCOUNTS.COGS) {
                                monthCogs += (line.debit || 0) - (line.credit || 0)
                            }
                        }
                    }
                }

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
            const client = getServiceSupabase()
            const { data: invoices } = await client
                .from(TABLES.INVOICES)
                .select("customer_id, amount")
                .eq("status", "paid")

            const customerTotals = new Map<string, number>()
            ;(invoices || []).forEach((inv: any) => {
                const current = customerTotals.get(inv.customer_id) || 0
                customerTotals.set(inv.customer_id, current + (inv.amount || 0))
            })

            const customerIds = Array.from(customerTotals.keys())
            const { data: customers } = customerIds.length > 0
                ? await client.from(TABLES.CUSTOMERS).select("id, name").in("id", customerIds)
                : { data: [] }

            const customerMap = new Map((customers || []).map((c: any) => [c.id, c.name]))

            const topCustomers = customerIds.map((id) => ({
                name: customerMap.get(id) || id,
                total: customerTotals.get(id) || 0,
            }))

            return topCustomers.sort((a, b) => b.total - a.total).slice(0, 5)
        } catch (error) {
            console.error("Error getting top customers:", error)
            return []
        }
    }

    static async getRecentOrders() {
        try {
            const client = getServiceSupabase()
            const { data: salesOrders } = await client
                .from(TABLES.SALES_ORDERS)
                .select("*")
                .order("created_at", { ascending: false })
                .limit(10)

            const orders = (salesOrders || []).map((order: any) => {
                const items = order.items as any[] || []
                const total = items.reduce((sum: number, item: any) => sum + ((item.qty || 1) * (item.unit_price || 0)), 0)
                return { order, total }
            })

            const customerIds = [...new Set(orders.map((o: any) => o.order.customer_id).filter(Boolean))]
            const { data: customerDocs } = customerIds.length > 0
                ? await client.from(TABLES.CUSTOMERS).select("id, name").in("id", customerIds as string[])
                : { data: [] }

            const customerMap = new Map<string, string>()
            for (const c of (customerDocs || [])) {
                customerMap.set(c.id, c.name || c.id)
            }

            return orders.map(({ order }: { order: any }) => ({
                id: order.id,
                customerName: customerMap.get(order.customer_id) || order.customer_id,
                total: orders.find((o: any) => o.order.id === order.id)?.total || 0,
                status: order.status,
                createdAt: order.created_at,
            }))
        } catch (error) {
            console.error("Error getting recent orders:", error)
            return []
        }
    }

    static async getInventoryAlerts() {
        try {
            const client = getServiceSupabase()
            const { data: items } = await client
                .from(TABLES.INVENTORY_ITEMS)
                .select("*")

            const alerts: any[] = []
            for (const item of (items || [])) {
                if (item.quantity_on_hand <= (item.reorder_level || 10)) {
                    alerts.push({
                        sku: item.sku,
                        name: item.name,
                        currentStock: item.quantity_on_hand,
                        reorderPoint: item.reorder_level || 10,
                    })
                }
            }

            return alerts
        } catch (error) {
            console.error("Error getting inventory alerts:", error)
            return []
        }
    }

    static async getWorkOrderStatus() {
        try {
            const client = getServiceSupabase()
            const { data: workOrders } = await client
                .from(TABLES.WORK_ORDERS)
                .select("*")

            const statusCounts: Record<string, number> = {
                pending: 0, in_progress: 0, completed: 0, invoiced: 0,
            }
            const active: any[] = []

            for (const wo of (workOrders || [])) {
                statusCounts[wo.status] = (statusCounts[wo.status] || 0) + 1
                if (wo.status !== "completed") {
                    active.push({ id: wo.id, salesOrderId: wo.sales_order_id, status: wo.status })
                }
            }

            return { ...statusCounts, active: active.slice(0, 10) }
        } catch (error) {
            console.error("Error getting work order status:", error)
            return { pending: 0, in_progress: 0, completed: 0, invoiced: 0, active: [] }
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
        userId: string | null = null
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        try {
            const client = getServiceSupabase()
            const { data: assetEntry } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .select("*")
                .eq("id", assetEntryId)
                .single()

            if (!assetEntry) {
                return { success: false, error: "Asset acquisition entry not found" }
            }

            const { data: lines } = await client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .select("*")
                .eq("journal_entry_id", assetEntryId)

            const metadata = (assetEntry as any).metadata || {}
            if (!metadata.useful_life_years) {
                return { success: false, error: "Asset is non-depreciable or missing useful life" }
            }

            const totalDebits = (lines || []).reduce((sum: any, l: any) => sum + l.debit, 0)

            const cost = totalDebits
            const salvageValue = metadata.salvage_value || 0
            const usefulLifeMonths = metadata.useful_life_years * 12
            const monthlyAmount = Math.round(((cost - salvageValue) / usefulLifeMonths) * 100) / 100

            if (monthlyAmount <= 0) {
                return { success: false, error: "Calculated depreciation amount is zero or negative" }
            }

            const assetAccount = assetEntry.account_ids?.find((id: string) => id.startsWith("13") || id.startsWith("14"))
            if (!assetAccount) {
                return { success: false, error: "Could not identify asset account for depreciation" }
            }

            let accumDepAccount = "1352"
            if (assetAccount === "1301" || assetAccount === "1302") accumDepAccount = "1351"
            else if (assetAccount === "1304" || assetAccount === "1305" || assetAccount === "1306") accumDepAccount = "1353"
            else if (assetAccount === "1307") accumDepAccount = "1354"
            else if (assetAccount.startsWith("14")) accumDepAccount = "1491"

            const expenseAccount = (assetAccount === "1301" || assetAccount === "1302" || assetAccount === "1303")
                ? "5008"
                : "6007"

            const referenceId = `DEP-${assetEntryId}-${year}-${month + 1}`
            const { data: existing } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .select("id")
                .eq("reference_id", referenceId)
                .limit(1)

            if (existing && existing.length > 0) {
                return { success: false, error: "Depreciation already recorded for this month" }
            }

            const jeLines: JournalLine[] = [
                {
                    accountCode: expenseAccount,
                    accountName: getAccountName(expenseAccount),
                    debit: monthlyAmount,
                    credit: 0,
                    description: `Monthly depreciation: ${assetEntry.description} (${month + 1}/${year})`
                },
                {
                    accountCode: accumDepAccount,
                    accountName: getAccountName(accumDepAccount),
                    debit: 0,
                    credit: monthlyAmount,
                    description: `Accumulated depreciation: ${assetEntry.description}`
                }
            ]

            return await this.createJournalEntry(
                JournalEntryType.DEPRECIATION,
                jeLines,
                referenceId,
                `Depreciation for ${assetEntry.description} - Period ${month + 1}/${year}`,
                userId
            )
        } catch (error) {
            console.error("Error recording depreciation:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to record depreciation" }
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
        userId: string | null = null
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
        userId: string | null = null
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
        userId: string | null = null
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
        userId: string | null = null
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
        userId: string | null = null
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
        userId: string | null = null
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
