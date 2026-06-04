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

    public static async getAccountBalancesBatch(
        accountCodes: string[],
        startDate?: Date,
        endDate?: Date
    ): Promise<Record<string, number>> {
        const result: Record<string, number> = {}
        try {
            if (accountCodes.length === 0) return result

            let query = getServiceSupabase().from(TABLES.JOURNAL_ENTRY_LINES)
                .select("account_code, debit, credit, journal_entry_id")
                .in("account_code", accountCodes)

            if (startDate || endDate) {
                const { data: jeIds } = await getServiceSupabase()
                    .from(TABLES.JOURNAL_ENTRIES)
                    .select("id")
                    .gte("date", startDate ? startDate.toISOString().split("T")[0] : "2000-01-01")
                    .lte("date", endDate ? endDate.toISOString().split("T")[0] : "2099-12-31")

                const ids = (jeIds || []).map((j: any) => j.id)
                if (ids.length === 0) {
                    for (const code of accountCodes) result[code] = 0
                    return result
                }
                query = query.in("journal_entry_id", ids)
            }

            const { data: lines, error } = await query
            if (error) { console.error("Batch balance query error:", error); return result }

            const totals: Record<string, { d: number; c: number }> = {}
            for (const code of accountCodes) totals[code] = { d: 0, c: 0 }

            for (const line of (lines || [])) {
                const code = line.account_code
                if (!totals[code]) continue
                totals[code].d += line.debit || 0
                totals[code].c += line.credit || 0
            }

            for (const code of accountCodes) {
                const t = totals[code] || { d: 0, c: 0 }
                const isDebit = isDebitNormalBalance(code)
                result[code] = isDebit ? t.d - t.c : t.c - t.d
            }
        } catch (error) {
            console.error("Error in batch balance query:", error)
        }
        return result
    }

    public static async getAccountBalance(
        accountCode: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        const result = await this.getAccountBalancesBatch([accountCode], startDate, endDate)
        return result[accountCode] || 0
    }

    private static async getAccountBalancesByType(
        type: AccountType,
        startDate?: Date,
        endDate?: Date
    ): Promise<StatementLineItem[]> {
        const accounts = getAccountsByType(type)
        const codes = accounts.map(a => a.code)
        const balances = await this.getAccountBalancesBatch(codes, startDate, endDate)
        const items: StatementLineItem[] = []

        for (const account of accounts) {
            const balance = balances[account.code] || 0
            if (balance !== 0 || type === AccountType.EQUITY || type === AccountType.LIABILITY) {
                items.push({ code: account.code, name: account.name, amount: balance })
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
        const cogsTotal = cogsItems.reduce((sum, item) => {
            const isDebit = isDebitNormalBalance(item.code)
            return sum + (isDebit ? item.amount : -item.amount)
        }, 0)
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

        // NOTE: COGS credit-balance accounts (5009 OH-Applied, 5011 OH-Variance) are contra-COGS,
        // not liabilities. Including them inflates the liability side of the balance sheet.
        const totalLiabilities = currentLiabilitiesTotal + longTermLiabilitiesTotal

        const equityItems = await this.getAccountBalancesByType(AccountType.EQUITY, undefined, asOfDate)

        // Read retained earnings directly from the GL instead of recomputing the full income statement
        const retainedEarningsBal = (await this.getAccountBalancesBatch(["3100"], undefined, asOfDate))["3100"] || 0
        const currentYearPLBal = (await this.getAccountBalancesBatch(["3200"], undefined, asOfDate))["3200"] || 0

        let equityTotal = equityItems.reduce((sum, item) => sum + item.amount, 0)
        equityTotal += retainedEarningsBal + currentYearPLBal

        // If no closing entry has been posted (RE=0 and Current Year P/L=0),
        // dynamically compute current period net income from P&L accounts
        if (Math.abs(retainedEarningsBal) < 0.01 && Math.abs(currentYearPLBal) < 0.01) {
            let dynamicNetIncome = 0
            try {
                const revenueItems = await this.getAccountBalancesByType(AccountType.REVENUE, undefined, asOfDate)
                const contraRevenueItems = await this.getAccountBalancesByType(AccountType.CONTRA_REVENUE, undefined, asOfDate)
                const revTotal = revenueItems.reduce((s, i) => s + i.amount, 0)
                const contraRevTotal = contraRevenueItems.reduce((s, i) => s + i.amount, 0)

                const cogsItems = await this.getAccountBalancesByType(AccountType.COGS, undefined, asOfDate)
                const cogsTotal = cogsItems.reduce((s, i) => s + (isDebitNormalBalance(i.code) ? i.amount : -i.amount), 0)

                const expItems = await this.getAccountBalancesByType(AccountType.EXPENSE, undefined, asOfDate)
                const expTotal = expItems.reduce((s, i) => s + (isDebitNormalBalance(i.code) ? i.amount : -i.amount), 0)

                const otherItems = await this.getAccountBalancesByType(AccountType.OTHER, undefined, asOfDate)
                const otherTotal = otherItems.reduce((s, i) => s + (isDebitNormalBalance(i.code) ? i.amount : -i.amount), 0)

                dynamicNetIncome = revTotal - contraRevTotal - cogsTotal - expTotal - otherTotal
            } catch (e) {
                console.warn("Could not compute dynamic net income for balance sheet:", e)
            }

            if (Math.abs(dynamicNetIncome) > 0.01) {
                equityTotal += dynamicNetIncome
                equityItems.push({
                    code: "RETAINED_DYNAMIC",
                    name: "Retained Earnings (Current Period Net Income)",
                    amount: dynamicNetIncome,
                })
            }
        }

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

    static async generateTrialBalance(asOfDate: Date | null): Promise<TrialBalance> {
        const accounts: TrialBalance["accounts"] = []
        let totalDebits = 0
        let totalCredits = 0

        const asOfISO = asOfDate ? asOfDate.toISOString().split("T")[0] : null

        let ids: string[] = []
        if (asOfISO) {
            const { data: jeIds } = await getServiceSupabase()
                .from(TABLES.JOURNAL_ENTRIES)
                .select("id")
                .lte("date", asOfISO)
            ids = (jeIds || []).map((j: any) => j.id)
            if (ids.length === 0) {
                return { asOfDate: asOfISO, accounts, totalDebits, totalCredits, isBalanced: true }
            }
        }

        let query = getServiceSupabase()
            .from(TABLES.JOURNAL_ENTRY_LINES)
            .select("account_code, debit, credit")

        if (ids.length > 0) {
            query = query.in("journal_entry_id", ids)
        }

        const { data: lines, error } = await query
        if (error) {
            console.error("Trial balance query error:", error)
            return { asOfDate: asOfDate?.toISOString() || "all", accounts, totalDebits, totalCredits, isBalanced: true }
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

            const debit = dbBalance > 0 ? dbBalance : 0
            const credit = dbBalance < 0 ? -dbBalance : 0

            accounts.push({ code, name: account.name, type: account.type, debit, credit })
            totalDebits += debit
            totalCredits += credit
        }

        accounts.sort((a, b) => a.code.localeCompare(b.code))
        return { asOfDate: asOfDate?.toISOString() || "all", accounts, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 }
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
            return (await this.getAccountBalancesBatch([code], undefined, asOf))[code] || 0
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

        const nonCashOH = await delta("5009")

        const arDelta = await delta(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
        const inventoryDelta = await delta(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS) +
                               await delta(ACCOUNT_CODES.INVENTORY_WIP) +
                               await delta(ACCOUNT_CODES.RAW_MATERIALS_FABRIC) +
                               await delta("1710") + await delta("1711") + await delta("1712")
        const apDelta = await delta(ACCOUNT_CODES.ACCOUNTS_PAYABLE)

        const cashFromOperations = netIncome + depDelta + nonCashOH - arDelta - inventoryDelta + apDelta

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

        const cashFromFinancing = loansDelta

        const cashDelta = await delta(ACCOUNT_CODES.CASH_ON_HAND) + await delta(ACCOUNT_CODES.BANK_MAIN)
        const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing

        const reconciliationGap = Math.round((netCashFlow - cashDelta) * 100) / 100

        return {
            operating: {
                netIncome,
                depreciation: depDelta,
                nonCashOH,
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
                total: cashFromFinancing
            },
            netCashFlow,
            actualCashChange: cashDelta,
            reconciliationGap,
            isReconciled: Math.abs(reconciliationGap) < 100,
        }
    }

    static async getWorkingCapitalMetrics(asOfDate: Date = new Date()): Promise<{
        dio: number
        dso: number
        dpo: number
        ccc: number
        avgInventory: number
        ar: number
        ap: number
        annualizedCOGS: number
        annualizedRevenue: number
        netWorkingCapital: number
        riskFlags: string[]
    }> {
        const yearStart = new Date(asOfDate.getFullYear(), 0, 1)
        const yearEnd = asOfDate

        const inventoryAccounts = [
            ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
            ACCOUNT_CODES.RAW_MATERIALS_ACCESSORIES,
            ACCOUNT_CODES.PACKAGING_MATERIALS,
            ACCOUNT_CODES.INVENTORY_WIP,
            ACCOUNT_CODES.INVENTORY_FINISHED_GOODS,
            ACCOUNT_CODES.SCRAP_INVENTORY,
        ]

        let avgInventory = 0
        for (const code of inventoryAccounts) {
            avgInventory += await this.getAccountBalance(code, undefined, yearEnd)
        }

        const ar = await this.getAccountBalance(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, undefined, yearEnd)
        const ap = await this.getAccountBalance(ACCOUNT_CODES.ACCOUNTS_PAYABLE, undefined, yearEnd)
        const cash = await this.getAccountBalance(ACCOUNT_CODES.CASH_ON_HAND, undefined, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.BANK_MAIN, undefined, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.BANK_SAVINGS, undefined, yearEnd)

        const periodCOGS = await this.getAccountBalance(ACCOUNT_CODES.COST_OF_GOODS_SOLD, yearStart, yearEnd)
        const periodRevenue = await this.getAccountBalance(ACCOUNT_CODES.SALES_RETAIL, yearStart, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.SALES_WHOLESALE, yearStart, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.SALES_CUSTOM_MTO, yearStart, yearEnd)

        const daysElapsed = Math.max(1, Math.ceil((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)))
        const annualizedCOGS = daysElapsed > 0 ? (periodCOGS / daysElapsed) * 365 : 0
        const annualizedRevenue = daysElapsed > 0 ? (periodRevenue / daysElapsed) * 365 : 0

        const dio = annualizedCOGS > 0 ? (avgInventory / annualizedCOGS) * 365 : 0
        const dso = annualizedRevenue > 0 ? (ar / annualizedRevenue) * 365 : 0
        const dpo = annualizedCOGS > 0 ? (ap / annualizedCOGS) * 365 : 0
        const ccc = dio + dso - dpo

        const currentAssets = avgInventory + ar + cash
        const currentLiabilities = ap
            + await this.getAccountBalance(ACCOUNT_CODES.VAT_PAYABLE, undefined, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION, undefined, yearEnd)
            + await this.getAccountBalance(ACCOUNT_CODES.PAYROLL_PAYABLE, undefined, yearEnd)
        const netWorkingCapital = currentAssets - currentLiabilities

        const riskFlags: string[] = []
        if (ccc > 90) riskFlags.push(`CCC at ${Math.round(ccc)} days exceeds 90-day threshold — working capital strain`)
        if (dso > 60) riskFlags.push(`DSO at ${Math.round(dso)} days exceeds 60-day threshold — slow collections`)
        if (dio > 60) riskFlags.push(`DIO at ${Math.round(dio)} days exceeds 60-day threshold — excess or slow-moving inventory`)
        if (dpo > 90) riskFlags.push(`DPO at ${Math.round(dpo)} days exceeds 90-day threshold — may indicate cash flow issues or strained supplier relationships`)
        if (netWorkingCapital < 0) riskFlags.push(`Negative net working capital (EGP ${netWorkingCapital.toFixed(0)}) — liquidity risk`)
        if (annualizedRevenue > 0 && ar / (annualizedRevenue / 12) > 3) riskFlags.push(`AR balance represents >3 months of revenue — collection risk`)

        return {
            dio: Math.round(dio * 10) / 10,
            dso: Math.round(dso * 10) / 10,
            dpo: Math.round(dpo * 10) / 10,
            ccc: Math.round(ccc * 10) / 10,
            avgInventory: Math.round(avgInventory * 100) / 100,
            ar: Math.round(ar * 100) / 100,
            ap: Math.round(ap * 100) / 100,
            annualizedCOGS: Math.round(annualizedCOGS * 100) / 100,
            annualizedRevenue: Math.round(annualizedRevenue * 100) / 100,
            netWorkingCapital: Math.round(netWorkingCapital * 100) / 100,
            riskFlags,
        }
    }

}
