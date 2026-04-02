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
            console.error(`Error getting balance for ${accountCode}:`, error)
            return 0
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
     */
    static async generateCashFlowStatement(startDate: Date, endDate: Date) {
        // 1. Operating Activities
        // Start with Net Income
        const incomeStatement = await FinancialStatementsService.generateIncomeStatement(startDate, endDate)
        const netIncome = incomeStatement.netIncome
        
        // Adjusted for non-cash items (Depreciation & Amortization)
        // Accumulated Depreciation codes 1351 to 1354, 1491
        const depChange = 
            await FinancialStatementsService.getAccountBalance("1351", startDate, endDate) +
            await FinancialStatementsService.getAccountBalance("1352", startDate, endDate) +
            await FinancialStatementsService.getAccountBalance("1353", startDate, endDate) +
            await FinancialStatementsService.getAccountBalance("1354", startDate, endDate) +
            await FinancialStatementsService.getAccountBalance("1491", startDate, endDate)
        
        // Adjust for Working Capital changes
        const arChange = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, startDate, endDate)
        const inventoryChange = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS, startDate, endDate) +
                                await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.INVENTORY_WIP, startDate, endDate) +
                                await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.RAW_MATERIALS_FABRIC, startDate, endDate)
        const apChange = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.ACCOUNTS_PAYABLE, startDate, endDate)
        
        // Depreciation is a credit-normal balance change (increase in Acc. Dep. is cash inflow/add-back)
        // Since getAccountBalance for Acc. Dep. (Contra-Asset) returns Credit - Debit (increase as positive)
        const cashFromOperations = netIncome + depChange - arChange - inventoryChange + apChange
        
        // 2. Investing Activities
        const equipmentChange = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.PRODUCTION_EQUIPMENT, startDate, endDate)
        const cashFromInvesting = -equipmentChange
        
        // 3. Financing Activities (Fix-010: Correct Equity Flow)
        const loansChange = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.LONG_TERM_LOANS, startDate, endDate)
        
        // Sum all partner capital and drawings accounts (Fix-010: Multi-Partner support)
        const capitalInjections = 
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.CAPITAL_AHMED, startDate, endDate) +
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.CAPITAL_IBRAHIM, startDate, endDate) +
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.CAPITAL_FATHY, startDate, endDate)
            
        const ownerDrawings = 
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.DRAWINGS_AHMED, startDate, endDate) +
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.DRAWINGS_IBRAHIM, startDate, endDate) +
            await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.DRAWINGS_FATHY, startDate, endDate)
        
        const cashFromFinancing = loansChange + capitalInjections - ownerDrawings
        
        const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing
        
        return {
            operating: {
                netIncome,
                depreciation: depChange,
                arAdjustment: -arChange,
                inventoryAdjustment: -inventoryChange,
                apAdjustment: apChange,
                total: cashFromOperations
            },
            investing: {
                equipmentAdjustment: -equipmentChange,
                total: cashFromInvesting
            },
            financing: {
                loansAdjustment: loansChange,
                equityAdjustment: capitalInjections - ownerDrawings,
                total: cashFromFinancing
            },
            netCashFlow
        }
    }
}
