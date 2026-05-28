/**
 * Financial Statements Service
 * Generates Income Statement, Balance Sheet, and Cash Flow Statement
 */

import { db, COLLECTIONS } from "../firebase"
import {
    AccountType,
    AccountSubType,
    CHART_OF_ACCOUNTS,
    ACCOUNT_CODES,
    getAccountsByType,
    isDebitNormalBalance
} from "../accounting/account-types"

/**
 * Financial Statement Line Item
 */
interface StatementLineItem {
    code: string
    name: string
    amount: number
    children?: StatementLineItem[]
}

/**
 * Income Statement Structure
 */
export interface IncomeStatement {
    periodStart: Date
    periodEnd: Date
    revenue: {
        items: StatementLineItem[]
        total: number
        contraItems?: StatementLineItem[]
        contraTotal?: number
    }
    costOfGoodsSold: {
        items: StatementLineItem[]
        total: number
    }
    grossProfit: number
    operatingExpenses: {
        items: StatementLineItem[]
        total: number
        onlineSalesCosts?: {
            items: StatementLineItem[]
            total: number
        }
    }
    operatingIncome: number
    otherIncomeExpenses: {
        items: StatementLineItem[]
        total: number
    }
    netIncome: number
}

/**
 * Balance Sheet Structure
 */
export interface BalanceSheet {
    asOfDate: Date
    assets: {
        currentAssets: { items: StatementLineItem[]; total: number }
        fixedAssets: { items: StatementLineItem[]; total: number }
        totalAssets: number
    }
    liabilities: {
        currentLiabilities: { items: StatementLineItem[]; total: number }
        longTermLiabilities: { items: StatementLineItem[]; total: number }
        totalLiabilities: number
    }
    equity: {
        items: StatementLineItem[]
        total: number
    }
    totalLiabilitiesAndEquity: number
    balanceCheckFailed?: boolean
}

/**
 * Trial Balance Structure
 */
export interface TrialBalance {
    asOfDate: Date
    accounts: Array<{
        code: string
        name: string
        type: AccountType
        debit: number
        credit: number
    }>
    totalDebits: number
    totalCredits: number
    isBalanced: boolean
}

/**
 * Financial Statements Service
 */
export class FinancialStatementsService {

    /**
     * Calculate account balance from journal entries
     */
    public static async getAccountBalance(
        accountCode: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        try {
            // Use cached balance when no date filter is needed
            if (!startDate && !endDate) {
                const balDoc = await db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(accountCode).get()
                if (balDoc.exists) {
                    const data = balDoc.data()!
                    return data.balance || 0
                }
            }

            let query = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                .where("account_ids", "array-contains", accountCode) as FirebaseFirestore.Query

            if (startDate) {
                query = query.where("date", ">=", startDate)
            }
            if (endDate) {
                query = query.where("date", "<=", endDate)
            }

            const snapshot = await query.get()

            let totalDebits = 0
            let totalCredits = 0

            for (const doc of snapshot.docs) {
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

            // Return balance based on normal balance type
            const isDebit = isDebitNormalBalance(accountCode)
            return isDebit ? totalDebits - totalCredits : totalCredits - totalDebits
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.error(`Error getting balance for ${accountCode}:`, message)
            throw new Error(`Failed to get balance for account ${accountCode}: ${message}`)
        }
    }

    /**
     * Get account balances by type for a date range
     */
    private static async getAccountBalancesByType(
        type: AccountType,
        startDate?: Date,
        endDate?: Date
    ): Promise<StatementLineItem[]> {
        const accounts = getAccountsByType(type)
        const items: StatementLineItem[] = []

        for (const account of accounts) {
            if (!account.parentCode) {  // Only root accounts
                const balance = await this.getAccountBalance(account.code, startDate, endDate)
                if (balance !== 0) {
                    items.push({
                        code: account.code,
                        name: account.name,
                        amount: balance,
                    })
                }
            }
        }

        return items.sort((a, b) => a.code.localeCompare(b.code))
    }

    /**
     * Generate Income Statement
     */
    static async generateIncomeStatement(
        startDate: Date,
        endDate: Date
    ): Promise<IncomeStatement> {
        // Revenue accounts (4xxx)
        const revenueItems = await this.getAccountBalancesByType(AccountType.REVENUE, startDate, endDate)

        // Get contra revenue items (discounts, returns)
        const contraRevenueItems = await this.getAccountBalancesByType(AccountType.CONTRA_REVENUE, startDate, endDate)
        const contraTotal = contraRevenueItems.reduce((sum, item) => sum + item.amount, 0)

        const revenueTotal = revenueItems.reduce((sum, item) => sum + item.amount, 0) - contraTotal

        // COGS accounts (5xxx) - using dedicated COGS type
        const cogsItems = await this.getAccountBalancesByType(AccountType.COGS, startDate, endDate)
        const cogsTotal = cogsItems.reduce((sum, item) => sum + item.amount, 0)

        // Gross Profit
        const grossProfit = revenueTotal - cogsTotal

        // Operating Expenses (6xxx)
        const operatingItems = await this.getAccountBalancesByType(AccountType.EXPENSE, startDate, endDate)
        const operatingTotal = operatingItems.reduce((sum, item) => {
            // If expense has credit normal balance (like Inventory Gain), it reduces total expenses
            const isDebit = isDebitNormalBalance(item.code)
            return sum + (isDebit ? item.amount : -item.amount)
        }, 0)

        // Operating Income
        const operatingIncome = grossProfit - operatingTotal

        // Other Income/Expenses (7xxx)
        const otherItems = await this.getAccountBalancesByType(AccountType.OTHER, startDate, endDate)
        const otherTotal = otherItems.reduce((sum, item) => {
            // Treat as net expense (positive = loss, negative = gain)
            const isDebit = isDebitNormalBalance(item.code)
            return sum + (isDebit ? item.amount : -item.amount)
        }, 0)

        // Net Income
        const netIncome = operatingIncome - otherTotal

        const onlineSalesAccountCodes = ["6108", "6109", "6110"]
        const onlineSalesItems = operatingItems.filter(item => onlineSalesAccountCodes.includes(item.code))
        const onlineSalesTotal = onlineSalesItems.reduce((sum, item) => sum + item.amount, 0)
        
        // Filter out online sales items from general operating items for display
        const generalOperatingItems = operatingItems.filter(item => !onlineSalesAccountCodes.includes(item.code))

        return {
            periodStart: startDate,
            periodEnd: endDate,
            revenue: {
                items: revenueItems,
                total: revenueTotal,
                contraItems: contraRevenueItems,
                contraTotal
            },
            costOfGoodsSold: {
                items: cogsItems,
                total: cogsTotal
            },
            grossProfit,
            operatingExpenses: {
                items: generalOperatingItems,
                onlineSalesCosts: {
                    items: onlineSalesItems,
                    total: onlineSalesTotal
                },
                total: operatingTotal
            },
            operatingIncome,
            otherIncomeExpenses: {
                items: otherItems,
                total: otherTotal
            },
            netIncome
        }
    }

    /**
     * Generate Balance Sheet
     */
    static async generateBalanceSheet(asOfDate: Date): Promise<BalanceSheet> {
        // Assets - filter by code range since we don't have CURRENT_ASSET subtype anymore
        const assetItems = await this.getAccountBalancesByType(AccountType.ASSET, undefined, asOfDate)

        // Classify assets based on SubType (Atomic Fix-009)
        const currentAssetItems: StatementLineItem[] = []
        const fixedAssetItems: StatementLineItem[] = []
        const unclassifiedCodes: string[] = []

        const currentSubTypes = [AccountSubType.CASH, AccountSubType.RECEIVABLE, AccountSubType.INVENTORY, AccountSubType.PREPAID]
        const fixedSubTypes = [AccountSubType.FIXED_ASSET, AccountSubType.INTANGIBLE]

        assetItems.forEach(item => {
            const account = CHART_OF_ACCOUNTS[item.code]
            if (!account) {
                unclassifiedCodes.push(item.code)
                currentAssetItems.push(item)
                return
            }

            if (currentSubTypes.includes(account.subType)) {
                currentAssetItems.push(item)
            } else if (fixedSubTypes.includes(account.subType)) {
                fixedAssetItems.push(item)
            } else {
                // Fallback for types like DEPRECIATION (should be handle specifically or as fixed)
                if (account.subType === AccountSubType.DEPRECIATION) {
                    fixedAssetItems.push(item)
                } else {
                    unclassifiedCodes.push(item.code)
                    currentAssetItems.push(item)
                }
            }
        })

        if (unclassifiedCodes.length > 0) {
            console.warn(`⚠️ Asset classification fallback applied for codes: ${unclassifiedCodes.join(", ")}`)
        }

        // Add contra asset (depreciation) items - these reduce asset total
        const contraAssetItems = await this.getAccountBalancesByType(AccountType.CONTRA_ASSET, undefined, asOfDate)
        const contraAssetTotal = contraAssetItems.reduce((sum, item) => sum + item.amount, 0)

        const currentAssetsTotal = currentAssetItems.reduce((sum, item) => sum + item.amount, 0)
        const fixedAssetsTotal = fixedAssetItems.reduce((sum, item) => sum + item.amount, 0) - contraAssetTotal
        const totalAssets = currentAssetsTotal + fixedAssetsTotal

        // Liabilities
        const liabilityItems = await this.getAccountBalancesByType(AccountType.LIABILITY, undefined, asOfDate)

        // Current liabilities: 2101-2140
        const currentLiabilityItems = liabilityItems.filter(item => {
            const code = parseInt(item.code)
            return code >= 2101 && code <= 2140
        })

        // Long-term liabilities: 2201-2210
        const longTermLiabilityItems = liabilityItems.filter(item => {
            const code = parseInt(item.code)
            return code >= 2201 && code <= 2210
        })

        const currentLiabilitiesTotal = currentLiabilityItems.reduce((sum, item) => sum + item.amount, 0)
        const longTermLiabilitiesTotal = longTermLiabilityItems.reduce((sum, item) => sum + item.amount, 0)
        const totalLiabilities = currentLiabilitiesTotal + longTermLiabilitiesTotal

        // Equity
        const equityItems = await this.getAccountBalancesByType(AccountType.EQUITY, undefined, asOfDate)
        const equityTotal = equityItems.reduce((sum, item) => sum + item.amount, 0)

        const totalLiabilitiesAndEquity = totalLiabilities + equityTotal
        const balanceCheckFailed = Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01

        return {
            asOfDate,
            assets: {
                currentAssets: { items: currentAssetItems, total: currentAssetsTotal },
                fixedAssets: { items: [...fixedAssetItems, ...contraAssetItems.map(i => ({ ...i, amount: -i.amount }))], total: fixedAssetsTotal },
                totalAssets,
            },
            liabilities: {
                currentLiabilities: { items: currentLiabilityItems, total: currentLiabilitiesTotal },
                longTermLiabilities: { items: longTermLiabilityItems, total: longTermLiabilitiesTotal },
                totalLiabilities,
            },
            equity: { items: equityItems, total: equityTotal },
            totalLiabilitiesAndEquity,
            balanceCheckFailed,
        }
    }

    /**
     * Generate Trial Balance
     */
    static async generateTrialBalance(asOfDate: Date): Promise<TrialBalance> {
        const accounts: TrialBalance["accounts"] = []
        let totalDebits = 0
        let totalCredits = 0

        for (const [code, account] of Object.entries(CHART_OF_ACCOUNTS)) {
            const balance = await this.getAccountBalance(code, undefined, asOfDate)

            if (balance !== 0) {
                const isDebit = balance > 0 && isDebitNormalBalance(code) ||
                    balance < 0 && !isDebitNormalBalance(code)

                const debit = isDebit ? Math.abs(balance) : 0
                const credit = !isDebit ? Math.abs(balance) : 0

                accounts.push({
                    code,
                    name: account.name,
                    type: account.type,
                    debit,
                    credit,
                })

                totalDebits += debit
                totalCredits += credit
            }
        }

        // Sort by account code
        accounts.sort((a, b) => a.code.localeCompare(b.code))

        return {
            asOfDate,
            accounts,
            totalDebits,
            totalCredits,
            isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        }
    }

    /**
     * Get summary financial metrics
     */
    static async getFinancialSummary(year: number): Promise<{
        revenue: number
        expenses: number
        netIncome: number
        totalAssets: number
        totalLiabilities: number
        equity: number
        currentRatio: number
        grossMargin: number
    }> {
        const startDate = new Date(year, 0, 1)
        const endDate = new Date(year, 11, 31)

        const incomeStatement = await this.generateIncomeStatement(startDate, endDate)
        const balanceSheet = await this.generateBalanceSheet(endDate)

        const currentRatio = balanceSheet.liabilities.currentLiabilities.total > 0
            ? balanceSheet.assets.currentAssets.total / balanceSheet.liabilities.currentLiabilities.total
            : 0

        const grossMargin = incomeStatement.revenue.total > 0
            ? (incomeStatement.grossProfit / incomeStatement.revenue.total) * 100
            : 0

        return {
            revenue: incomeStatement.revenue.total,
            expenses: incomeStatement.operatingExpenses.total + incomeStatement.costOfGoodsSold.total,
            netIncome: incomeStatement.netIncome,
            totalAssets: balanceSheet.assets.totalAssets,
            totalLiabilities: balanceSheet.liabilities.totalLiabilities,
            equity: balanceSheet.equity.total,
            currentRatio: Math.round(currentRatio * 100) / 100,
            grossMargin: Math.round(grossMargin * 100) / 100,
        }
    }

    /**
     * Generate Cash Flow Statement (Indirect Method)
     *
     * Uses proper opening/closing balance comparison:
     *   Change in WC = Balance(endDate) − Balance(day before startDate)
     *
     * This handles opening balances correctly, unlike the previous approach
     * that only summed activity within the period.
     */
    static async generateCashFlowStatement(startDate: Date, endDate: Date) {
        // Helper: balance as of a specific date
        const balAsOf = async (code: string, asOf: Date) => {
            const snap = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
                .where("account_ids", "array-contains", code)
                .where("date", "<=", asOf)
                .get()
            let d = 0, c = 0
            for (const doc of snap.docs) {
                for (const line of doc.data().entries || []) {
                    if (line.account_id === code) { d += line.debit || 0; c += line.credit || 0 }
                }
            }
            const isDebit = isDebitNormalBalance(code)
            return isDebit ? d - c : c - d
        }

        // Compute opening date (day before start date)
        const openingDate = new Date(startDate.getTime() - 86400000)

        // Helper: Δ = balance(endDate) − balance(openingDate)
        const delta = async (code: string) => {
            return (await balAsOf(code, endDate)) - (await balAsOf(code, openingDate))
        }

        // 1. Operating Activities
        const incomeStatement = await FinancialStatementsService.generateIncomeStatement(startDate, endDate)
        const netIncome = incomeStatement.netIncome

        // Depreciation add-back: Δ in accumulated depreciation (contra-asset)
        const depDelta =
            await delta("1351") + await delta("1352") +
            await delta("1353") + await delta("1354") + await delta("1491")

        // Working capital changes
        const arDelta = await delta(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
        const inventoryDelta = await delta(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS) +
                               await delta(ACCOUNT_CODES.INVENTORY_WIP) +
                               await delta(ACCOUNT_CODES.RAW_MATERIALS_FABRIC)
        const apDelta = await delta(ACCOUNT_CODES.ACCOUNTS_PAYABLE)

        // Indirect method adjustments:
        //   Depreciation add-back: + (non-cash expense)
        //   AR increase: − (revenue > cash collected)
        //   Inventory increase: − (cash spent on inventory)
        //   AP increase: + (purchases > cash paid)
        const cashFromOperations = netIncome + depDelta - arDelta - inventoryDelta + apDelta

        // 2. Investing Activities
        const equipmentDelta = await delta(ACCOUNT_CODES.PRODUCTION_EQUIPMENT)
        const cashFromInvesting = -equipmentDelta

        // 3. Financing Activities
        const loansDelta = await delta(ACCOUNT_CODES.LONG_TERM_LOANS)
        const capitalDelta =
            await delta(ACCOUNT_CODES.CAPITAL_AHMED) +
            await delta(ACCOUNT_CODES.CAPITAL_IBRAHIM) +
            await delta(ACCOUNT_CODES.CAPITAL_FATHY)
        const drawingsDelta =
            await delta(ACCOUNT_CODES.DRAWINGS_AHMED) +
            await delta(ACCOUNT_CODES.DRAWINGS_IBRAHIM) +
            await delta(ACCOUNT_CODES.DRAWINGS_FATHY)

        const cashFromFinancing = loansDelta + capitalDelta - drawingsDelta

        // 4. Net Cash Flow
        // Verify against actual cash Δ
        const cashDelta = await delta(ACCOUNT_CODES.CASH_ON_HAND) + await delta(ACCOUNT_CODES.BANK_MAIN)
        const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing

        // If there's a discrepancy, it may be due to non-cash items we didn't capture.
        // The indirect method's computed net cash flow should ≈ actual cash Δ.
        const reconciliationGap = Math.round((netCashFlow - cashDelta) * 100) / 100

        return {
            operating: {
                netIncome,
                depreciation: depDelta,
                arAdjustment: -arDelta,
                inventoryAdjustment: -inventoryDelta,
                apAdjustment: apDelta,
                total: cashFromOperations
            },
            investing: {
                equipmentAdjustment: -equipmentDelta,
                total: cashFromInvesting
            },
            financing: {
                loansAdjustment: loansDelta,
                equityAdjustment: capitalDelta - drawingsDelta,
                total: cashFromFinancing
            },
            netCashFlow,
            actualCashChange: cashDelta,
            reconciliationGap,
            isReconciled: Math.abs(reconciliationGap) < 100,
        }
    }
}
