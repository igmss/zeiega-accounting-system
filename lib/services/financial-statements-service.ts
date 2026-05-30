import { supabase, TABLES, getServiceSupabase } from "../supabase"
import {
    AccountType,
    AccountSubType,
    CHART_OF_ACCOUNTS,
    ACCOUNT_CODES,
    getAccountsByType,
    isDebitNormalBalance
} from "../accounting/account-types"

interface StatementLineItem {
    code: string
    name: string
    amount: number
    children?: StatementLineItem[]
}

export interface IncomeStatement {
    periodStart: string
    periodEnd: string
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

export interface BalanceSheet {
    asOfDate: string
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

export interface TrialBalance {
    asOfDate: string
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

export class FinancialStatementsService {

    public static async getAccountBalance(
        accountCode: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        try {
            // Direct query on journal_entry_lines (most reliable)
            let query = getServiceSupabase().from(TABLES.JOURNAL_ENTRY_LINES)
                .select("debit, credit, journal_entry_id")
                .eq("account_code", accountCode)

            if (startDate || endDate) {
                const { data: jeIds } = await getServiceSupabase()
                    .from(TABLES.JOURNAL_ENTRIES)
                    .select("id")
                    .gte("date", startDate ? startDate.toISOString().split("T")[0] : "2000-01-01")
                    .lte("date", endDate ? endDate.toISOString().split("T")[0] : "2099-12-31")
                
                const ids = (jeIds || []).map((j: any) => j.id)
                if (ids.length === 0) return 0
                query = query.in("journal_entry_id", ids)
            }

            const { data: lines, error } = await query
            if (error) { console.error("Balance query error:", error); return 0 }

            let totalDebits = 0
            let totalCredits = 0
            for (const line of (lines || [])) {
                totalDebits += line.debit || 0
                totalCredits += line.credit || 0
            }

            const isDebit = isDebitNormalBalance(accountCode)
            return isDebit ? totalDebits - totalCredits : totalCredits - totalDebits
        } catch (error) {
            console.error(`Error getting balance for ${accountCode}:`, error)
            return 0
        }
    }

    private static async getAccountBalancesByType(
        type: AccountType,
        startDate?: Date,
        endDate?: Date
    ): Promise<StatementLineItem[]> {
        const accounts = getAccountsByType(type)
        const items: StatementLineItem[] = []

        for (const account of accounts) {
            if (!account.parentCode) {
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

    static async generateIncomeStatement(
        startDate: Date,
        endDate: Date
    ): Promise<IncomeStatement> {
        const revenueItems = await this.getAccountBalancesByType(AccountType.REVENUE, startDate, endDate)
        const contraRevenueItems = await this.getAccountBalancesByType(AccountType.CONTRA_REVENUE, startDate, endDate)
        const contraTotal = contraRevenueItems.reduce((sum, item) => sum + item.amount, 0)
        const revenueTotal = revenueItems.reduce((sum, item) => sum + item.amount, 0) - contraTotal

        const cogsItems = await this.getAccountBalancesByType(AccountType.COGS, startDate, endDate)
        const cogsTotal = cogsItems.reduce((sum, item) => sum + item.amount, 0)
        const grossProfit = revenueTotal - cogsTotal

        const operatingItems = await this.getAccountBalancesByType(AccountType.EXPENSE, startDate, endDate)
        const operatingTotal = operatingItems.reduce((sum, item) => {
            const isDebit = isDebitNormalBalance(item.code)
            return sum + (isDebit ? item.amount : -item.amount)
        }, 0)

        const operatingIncome = grossProfit - operatingTotal

        const otherItems = await this.getAccountBalancesByType(AccountType.OTHER, startDate, endDate)
        const otherTotal = otherItems.reduce((sum, item) => {
            const isDebit = isDebitNormalBalance(item.code)
            return sum + (isDebit ? item.amount : -item.amount)
        }, 0)

        const netIncome = operatingIncome - otherTotal

        const onlineSalesAccountCodes = ["6108", "6109", "6110"]
        const onlineSalesItems = operatingItems.filter(item => onlineSalesAccountCodes.includes(item.code))
        const onlineSalesTotal = onlineSalesItems.reduce((sum, item) => sum + item.amount, 0)
        const generalOperatingItems = operatingItems.filter(item => !onlineSalesAccountCodes.includes(item.code))

        return {
            periodStart: startDate.toISOString(),
            periodEnd: endDate.toISOString(),
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

    static async generateBalanceSheet(asOfDate: Date): Promise<BalanceSheet> {
        const assetItems = await this.getAccountBalancesByType(AccountType.ASSET, undefined, asOfDate)

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

        const contraAssetItems = await this.getAccountBalancesByType(AccountType.CONTRA_ASSET, undefined, asOfDate)
        const contraAssetTotal = contraAssetItems.reduce((sum, item) => sum + item.amount, 0)

        const currentAssetsTotal = currentAssetItems.reduce((sum, item) => sum + item.amount, 0)
        const fixedAssetsTotal = fixedAssetItems.reduce((sum, item) => sum + item.amount, 0) - contraAssetTotal
        const totalAssets = currentAssetsTotal + fixedAssetsTotal

        const liabilityItems = await this.getAccountBalancesByType(AccountType.LIABILITY, undefined, asOfDate)

        const currentLiabilityItems = liabilityItems.filter(item => {
            const code = parseInt(item.code)
            return code >= 2101 && code <= 2140
        })

        const longTermLiabilityItems = liabilityItems.filter(item => {
            const code = parseInt(item.code)
            return code >= 2201 && code <= 2210
        })

        const currentLiabilitiesTotal = currentLiabilityItems.reduce((sum, item) => sum + item.amount, 0)
        const longTermLiabilitiesTotal = longTermLiabilityItems.reduce((sum, item) => sum + item.amount, 0)
        const totalLiabilities = currentLiabilitiesTotal + longTermLiabilitiesTotal

        const equityItems = await this.getAccountBalancesByType(AccountType.EQUITY, undefined, asOfDate)
        const equityTotal = equityItems.reduce((sum, item) => sum + item.amount, 0)

        const totalLiabilitiesAndEquity = totalLiabilities + equityTotal
        const balanceCheckFailed = Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01

        return {
            asOfDate: asOfDate.toISOString(),
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

    static async generateTrialBalance(asOfDate: Date): Promise<TrialBalance> {
        const accounts: TrialBalance["accounts"] = []
        let totalDebits = 0
        let totalCredits = 0

        const asOfISO = asOfDate.toISOString().split("T")[0]

        // Fetch JE IDs up to the date
        const { data: jeIds } = await getServiceSupabase()
            .from(TABLES.JOURNAL_ENTRIES)
            .select("id")
            .lte("date", asOfISO)

        const ids = (jeIds || []).map((j: any) => j.id)
        if (ids.length === 0) {
            return { asOfDate: asOfDate.toISOString(), accounts, totalDebits, totalCredits, isBalanced: true }
        }

        // Fetch all lines for those entries
        const { data: lines, error } = await getServiceSupabase()
            .from(TABLES.JOURNAL_ENTRY_LINES)
            .select("account_code, debit, credit")
            .in("journal_entry_id", ids)

        if (error) {
            console.error("Trial balance query error:", error)
            return { asOfDate: asOfDate.toISOString(), accounts, totalDebits, totalCredits, isBalanced: true }
        }

        const balances: Record<string, { debits: number; credits: number }> = {}
        for (const line of (lines || [])) {
            const code = line.account_code
            if (!balances[code]) balances[code] = { debits: 0, credits: 0 }
            balances[code].debits += line.debit || 0
            balances[code].credits += line.credit || 0
        }

        for (const [code, bal] of Object.entries(balances)) {
            const dbBalance = bal.debits - bal.credits
            if (dbBalance === 0) continue

            const account = CHART_OF_ACCOUNTS[code]
            if (!account) continue

            const isDebit = dbBalance > 0 && isDebitNormalBalance(code) ||
                dbBalance < 0 && !isDebitNormalBalance(code)

            const debit = isDebit ? Math.abs(dbBalance) : 0
            const credit = !isDebit ? Math.abs(dbBalance) : 0

            accounts.push({ code, name: account.name, type: account.type, debit, credit })
            totalDebits += debit
            totalCredits += credit
        }

        accounts.sort((a, b) => a.code.localeCompare(b.code))
        return { asOfDate: asOfDate.toISOString(), accounts, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 }
    }

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

    static async generateCashFlowStatement(startDate: Date, endDate: Date) {
        const balAsOf = async (code: string, asOf: Date) => {
            const { data: snap } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
                .select(`id, date, type, ${TABLES.JOURNAL_ENTRY_LINES}(account_code, account_name, debit, credit, description)`)
                .contains("account_ids", [code])
                .lte("date", asOf.toISOString())
            let d = 0, c = 0
            for (const entry of (snap || [])) {
                const lines = (entry as any).journal_entry_lines || []
                for (const line of lines) {
                    if (line.account_code === code) { d += line.debit || 0; c += line.credit || 0 }
                }
            }
            const isDebit = isDebitNormalBalance(code)
            return isDebit ? d - c : c - d
        }

        const openingDate = new Date(startDate.getTime() - 86400000)

        const delta = async (code: string) => {
            return (await balAsOf(code, endDate)) - (await balAsOf(code, openingDate))
        }

        const incomeStatement = await FinancialStatementsService.generateIncomeStatement(startDate, endDate)
        const netIncome = incomeStatement.netIncome

        const depDelta =
            await delta("1351") + await delta("1352") +
            await delta("1353") + await delta("1354") + await delta("1491")

        const arDelta = await delta(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
        const inventoryDelta = await delta(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS) +
                               await delta(ACCOUNT_CODES.INVENTORY_WIP) +
                               await delta(ACCOUNT_CODES.RAW_MATERIALS_FABRIC)
        const apDelta = await delta(ACCOUNT_CODES.ACCOUNTS_PAYABLE)

        const cashFromOperations = netIncome + depDelta - arDelta - inventoryDelta + apDelta

        const equipmentDelta = await delta(ACCOUNT_CODES.PRODUCTION_EQUIPMENT)
        const cashFromInvesting = -equipmentDelta

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

        const cashDelta = await delta(ACCOUNT_CODES.CASH_ON_HAND) + await delta(ACCOUNT_CODES.BANK_MAIN)
        const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing

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
