import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { CHART_OF_ACCOUNTS, ACCOUNT_CODES } from "../accounting/account-types"
import { FinancialStatementsService } from "./financial-statements-service"
import type { BudgetLine } from "../types"

export interface BudgetVsActualLine {
  accountCode: string
  accountName: string
  period: number
  budgeted: number
  actual: number
  variance: number
  variancePct: number
  isFavorable: boolean
}

export interface BudgetSummary {
  fiscalYear: number
  period: number
  revenue: { budgeted: number; actual: number; variance: number }
  cogs:    { budgeted: number; actual: number; variance: number }
  grossProfit: { budgeted: number; actual: number; variance: number }
  opex:    { budgeted: number; actual: number; variance: number }
  netIncome: { budgeted: number; actual: number; variance: number }
  lines: BudgetVsActualLine[]
}

export class BudgetService {
  private static readonly TABLE = TABLES.BUDGET_LINES

  static async setBudgetLine(
    fiscalYear: number,
    period: number,
    accountCode: string,
    budgetedAmount: number,
    notes: string = "",
    userId: string | null = null
  ): Promise<{ success: boolean; lineId?: string; error?: string }> {
    if (!CHART_OF_ACCOUNTS[accountCode]) {
      return { success: false, error: `Account ${accountCode} not found in Chart of Accounts` }
    }
    if (budgetedAmount < 0) {
      return { success: false, error: "Budgeted amount cannot be negative" }
    }

    try {
      const lineId = `BUD-${fiscalYear}-${period}-${accountCode}`
      const account = CHART_OF_ACCOUNTS[accountCode]
      const now = new Date().toISOString()

      const line: BudgetLine = {
        id: lineId,
        fiscal_year_id: String(fiscalYear),
        period_number: period,
        account_code: accountCode,
        budget_amount: budgetedAmount,
        actual_amount: 0,
        created_at: now,
        updated_at: now,
      }

      const { error } = await (getServiceSupabase() as any).from(this.TABLE).upsert(line, { onConflict: "id" })
      if (error) throw error
      return { success: true, lineId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set budget line",
      }
    }
  }

  static async setBudgetLines(
    lines: Array<{ fiscalYear: number; period: number; accountCode: string; budgetedAmount: number; notes?: string }>,
    userId: string | null = null
  ): Promise<{ succeeded: number; failed: string[] }> {
    let succeeded = 0
    const failed: string[] = []

    for (const l of lines) {
      const result = await this.setBudgetLine(l.fiscalYear, l.period, l.accountCode, l.budgetedAmount, l.notes, userId)
      if (result.success) { succeeded++ } else { failed.push(`${l.accountCode}: ${result.error}`) }
    }

    return { succeeded, failed }
  }

  static async getBudgetVsActual(
    fiscalYear: number,
    period: number = 0
  ): Promise<BudgetVsActualLine[]> {
    let startDate: Date
    let endDate: Date

    if (period === 0) {
      startDate = new Date(fiscalYear, 0, 1)
      endDate   = new Date(fiscalYear, 11, 31, 23, 59, 59)
    } else {
      startDate = new Date(fiscalYear, period - 1, 1)
      endDate   = new Date(fiscalYear, period, 0, 23, 59, 59)
    }

    let query = (getServiceSupabase() as any).from(this.TABLE)
      .select("*")
      .eq("fiscal_year_id", fiscalYear)
    if (period > 0) {
      query = query.eq("period_number", period)
    }

    const { data: budgetLines, error } = await query
    if (error) throw error

    const results: BudgetVsActualLine[] = []

    for (const bl of (budgetLines || [])) {
      const actual = await FinancialStatementsService.getAccountBalance(bl.accountCode, startDate, endDate)
      const variance = actual - bl.budgetedAmount

      const account = CHART_OF_ACCOUNTS[bl.accountCode]
      const isRevenueType = account?.type === "revenue"
      const isFavorable   = isRevenueType ? variance > 0 : variance < 0

      results.push({
        accountCode: bl.accountCode,
        accountName: bl.accountName,
        period: bl.period,
        budgeted: bl.budgetedAmount,
        actual,
        variance,
        variancePct: bl.budgetedAmount !== 0
          ? Math.round((variance / bl.budgetedAmount) * 10000) / 100
          : 0,
        isFavorable,
      })
    }

    return results.sort((a, b) => a.accountCode.localeCompare(b.accountCode))
  }

  static async getBudgetSummary(
    fiscalYear: number,
    period: number = 0
  ): Promise<BudgetSummary> {
    const lines = await this.getBudgetVsActual(fiscalYear, period)

    const sum = (codes: string[], field: "budgeted" | "actual") =>
      lines
        .filter(l => codes.some(c => l.accountCode.startsWith(c)))
        .reduce((s, l) => s + l[field], 0)

    const revCodes  = ["4"]
    const cogsCodes = ["5"]
    const opexCodes = ["6", "7"]

    const revBud  = sum(revCodes,  "budgeted")
    const revAct  = sum(revCodes,  "actual")
    const cogsBud = sum(cogsCodes, "budgeted")
    const cogsAct = sum(cogsCodes, "actual")
    const opexBud = sum(opexCodes, "budgeted")
    const opexAct = sum(opexCodes, "actual")

    const gpBud  = revBud  - cogsBud
    const gpAct  = revAct  - cogsAct
    const netBud = gpBud   - opexBud
    const netAct = gpAct   - opexAct

    return {
      fiscalYear,
      period,
      revenue:    { budgeted: revBud,  actual: revAct,  variance: revAct  - revBud  },
      cogs:       { budgeted: cogsBud, actual: cogsAct, variance: cogsAct - cogsBud },
      grossProfit:{ budgeted: gpBud,   actual: gpAct,   variance: gpAct   - gpBud   },
      opex:       { budgeted: opexBud, actual: opexAct, variance: opexAct - opexBud },
      netIncome:  { budgeted: netBud,  actual: netAct,  variance: netAct  - netBud  },
      lines,
    }
  }

  static async getBudgetLines(fiscalYear: number): Promise<BudgetLine[]> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("fiscal_year_id", fiscalYear)
      if (error) throw error
      return ((data || []) as BudgetLine[])
        .sort((a, b) => a.period_number || 0 - (b.period_number || 0) || a.account_code.localeCompare(b.account_code || ""))
    } catch {
      return []
    }
  }

  static async deleteBudgetLine(
    fiscalYear: number,
    period: number,
    accountCode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const lineId = `BUD-${fiscalYear}-${period}-${accountCode}`
      const { error } = await getServiceSupabase().from(this.TABLE).delete().eq("id", lineId)
      if (error) throw error
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete budget line",
      }
    }
  }

  static async generateMasterBudget(
    fiscalYear: number,
    inputs: {
      expectedNewOrders: number
      avgOrderValue: number
      openingWIP: number
      desiredEndingFG: number
      materialCostPctOfRevenue: number
      laborCostPctOfRevenue: number
      variableOHPctOfRevenue: number
      fixedOHAnnual: number
      sgaFixedAnnual: number
      sgaVariablePctOfRevenue: number
      taxRate?: number
    },
    userId: string | null = null
  ): Promise<{
    success: boolean
    budget?: {
      totalRevenue: number
      directMaterials: number
      directLabor: number
      manufacturingOH: number
      cogm: number
      grossProfit: number
      sga: number
      operatingIncome: number
      taxExpense: number
      netIncome: number
      cashInflows: number
      cashOutflows: number
      netCashFlow: number
      keyRatios: {
        grossMarginPct: number
        netMarginPct: number
        opexPctOfRevenue: number
        materialPctOfRevenue: number
        laborPctOfRevenue: number
      }
    }
    linesCreated: number
    error?: string
  }> {
    try {
      const now = new Date().toISOString()
      let linesCreated = 0

      const totalRevenue = inputs.expectedNewOrders * inputs.avgOrderValue
      const directMaterials = Math.round(totalRevenue * inputs.materialCostPctOfRevenue * 100) / 100
      const directLabor = Math.round(totalRevenue * inputs.laborCostPctOfRevenue * 100) / 100
      const variableOH = Math.round(totalRevenue * inputs.variableOHPctOfRevenue * 100) / 100
      const manufacturingOH = variableOH + inputs.fixedOHAnnual
      const cogm = directMaterials + directLabor + manufacturingOH
      const grossProfit = totalRevenue - cogm
      const sgaVariable = Math.round(totalRevenue * inputs.sgaVariablePctOfRevenue * 100) / 100
      const sga = sgaVariable + inputs.sgaFixedAnnual
      const operatingIncome = grossProfit - sga
      const taxRate = inputs.taxRate ?? 0.225
      const taxExpense = operatingIncome > 0 ? Math.round(operatingIncome * taxRate * 100) / 100 : 0
      const netIncome = operatingIncome - taxExpense
      const cashInflows = totalRevenue
      const cashOutflows = directMaterials + directLabor + manufacturingOH + sga + taxExpense
      const netCashFlow = cashInflows - cashOutflows

      const budgetLines = [
        { accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO, amount: totalRevenue, notes: "Revenue — MTO custom orders" },
        { accountCode: ACCOUNT_CODES.RAW_MATERIALS_USED, amount: directMaterials, notes: "Direct materials budget" },
        { accountCode: ACCOUNT_CODES.DIRECT_LABOR, amount: directLabor, notes: "Direct labor budget" },
        { accountCode: ACCOUNT_CODES.MANUFACTURING_OVERHEAD, amount: manufacturingOH, notes: `Variable OH ${variableOH} + Fixed OH ${inputs.fixedOHAnnual}` },
        { accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD, amount: cogm, notes: "COGM = DM + DL + OH" },
        { accountCode: ACCOUNT_CODES.OFFICE_SALARIES, amount: Math.round(sga * 0.5 * 100) / 100, notes: "SG&A — salaries portion (~50%)" },
        { accountCode: ACCOUNT_CODES.OFFICE_RENT, amount: Math.round(sga * 0.15 * 100) / 100, notes: "SG&A — rent portion (~15%)" },
        { accountCode: ACCOUNT_CODES.MARKETING_EXPENSE, amount: Math.round(sga * 0.15 * 100) / 100, notes: "SG&A — marketing portion (~15%)" },
        { accountCode: ACCOUNT_CODES.DELIVERY_SHIPPING, amount: Math.round(sga * 0.1 * 100) / 100, notes: "SG&A — shipping portion (~10%)" },
        { accountCode: ACCOUNT_CODES.BANK_FEES, amount: Math.round(sga * 0.05 * 100) / 100, notes: "SG&A — bank fees (~5%)" },
        { accountCode: "6206", amount: Math.round(sga * 0.05 * 100) / 100, notes: "SG&A — misc (~5%)" },
        { accountCode: "7005", amount: taxExpense, notes: `Income tax @ ${(taxRate * 100).toFixed(1)}%` },
      ]

      for (const line of budgetLines) {
        if (line.amount <= 0) continue
        const result = await this.setBudgetLine(fiscalYear, 0, line.accountCode, Math.abs(line.amount), line.notes, userId)
        if (result.success) linesCreated++
      }

      return {
        success: true,
        budget: {
          totalRevenue,
          directMaterials,
          directLabor,
          manufacturingOH,
          cogm,
          grossProfit,
          sga,
          operatingIncome,
          taxExpense,
          netIncome,
          cashInflows,
          cashOutflows,
          netCashFlow,
          keyRatios: {
            grossMarginPct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0,
            netMarginPct: totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 10000) / 100 : 0,
            opexPctOfRevenue: totalRevenue > 0 ? Math.round((sga / totalRevenue) * 10000) / 100 : 0,
            materialPctOfRevenue: totalRevenue > 0 ? Math.round((directMaterials / totalRevenue) * 10000) / 100 : 0,
            laborPctOfRevenue: totalRevenue > 0 ? Math.round((directLabor / totalRevenue) * 10000) / 100 : 0,
          },
        },
        linesCreated,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate master budget",
        linesCreated: 0,
      }
    }
  }

  static async getCashBudget(
    fiscalYear: number,
    period: number = 0
  ): Promise<{
    periodLabel: string
    expectedCollections: number
    expectedPayments: number
    netCashFlow: number
    openingCash: number
    closingCash: number
    minimumCashRequired: number
    surplusOrDeficit: number
    recommendations: string[]
  }> {
    const lines = await this.getBudgetVsActual(fiscalYear, period)
    const totalRevenue = lines
      .filter(l => l.accountCode.startsWith("4"))
      .reduce((s, l) => s + l.budgeted, 0)
    const totalExpenses = lines
      .filter(l => l.accountCode.startsWith("5") || l.accountCode.startsWith("6") || l.accountCode.startsWith("7"))
      .reduce((s, l) => s + l.budgeted, 0)

    const openingCash = await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.BANK_MAIN)
      + await FinancialStatementsService.getAccountBalance(ACCOUNT_CODES.CASH_ON_HAND)

    const expectedCollections = totalRevenue
    const expectedPayments = totalExpenses
    const netCashFlow = expectedCollections - expectedPayments
    const closingCash = openingCash + netCashFlow
    const minimumCashRequired = totalExpenses * 0.25
    const surplusOrDeficit = closingCash - minimumCashRequired

    const recommendations: string[] = []
    if (surplusOrDeficit < 0) {
      recommendations.push(`Cash deficit of EGP ${Math.abs(Math.round(surplusOrDeficit)).toLocaleString()} projected — consider milestone-based advance billing or short-term financing`)
      if (netCashFlow < 0) recommendations.push(`Negative operating cash flow — review payment terms with suppliers and customers`)
    }
    if (surplusOrDeficit > 0) {
      recommendations.push(`Cash surplus of EGP ${Math.round(surplusOrDeficit).toLocaleString()} — consider debt reduction or reinvestment`)
    }

    return {
      periodLabel: period === 0 ? `FY${fiscalYear}` : `P${period}/FY${fiscalYear}`,
      expectedCollections: Math.round(expectedCollections * 100) / 100,
      expectedPayments: Math.round(expectedPayments * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      openingCash: Math.round(openingCash * 100) / 100,
      closingCash: Math.round(closingCash * 100) / 100,
      minimumCashRequired: Math.round(minimumCashRequired * 100) / 100,
      surplusOrDeficit: Math.round(surplusOrDeficit * 100) / 100,
      recommendations,
    }
  }

  static async getFlexibleBudget(
    fiscalYear: number,
    period: number,
    actualVolume: number,
    budgetedVolume: number
  ): Promise<{
    staticBudget: { revenue: number; variableCosts: number; fixedCosts: number; operatingIncome: number }
    flexibleBudget: { revenue: number; variableCosts: number; fixedCosts: number; operatingIncome: number }
    volumeVariance: number
    flexibleBudgetVariance: number
  }> {
    const lines = await this.getBudgetVsActual(fiscalYear, period)
    const volumeRatio = budgetedVolume > 0 ? actualVolume / budgetedVolume : 1

    const budgetedRevenue = lines.filter(l => l.accountCode.startsWith("4")).reduce((s, l) => s + l.budgeted, 0)
    const budgetedVariableCosts = lines
      .filter(l => ["5001", "5002", "5004", "5005", "5006", "5007", "6108", "6109", "6110"].includes(l.accountCode))
      .reduce((s, l) => s + l.budgeted, 0)
    const budgetedFixedCosts = lines
      .filter(l => (l.accountCode.startsWith("5") || l.accountCode.startsWith("6") || l.accountCode.startsWith("7"))
        && !["5001", "5002", "5004", "5005", "5006", "5007", "6108", "6109", "6110"].includes(l.accountCode))
      .reduce((s, l) => s + l.budgeted, 0)

    const flexRevenue = Math.round(budgetedRevenue * volumeRatio * 100) / 100
    const flexVariableCosts = Math.round(budgetedVariableCosts * volumeRatio * 100) / 100
    const flexOperatingIncome = flexRevenue - flexVariableCosts - budgetedFixedCosts

    const staticOpIncome = budgetedRevenue - budgetedVariableCosts - budgetedFixedCosts
    const volumeVariance = flexOperatingIncome - staticOpIncome
    const flexibleBudgetVariance = (lines.reduce((s, l) => s + l.actual, 0) || 0) - flexOperatingIncome

    return {
      staticBudget: {
        revenue: Math.round(budgetedRevenue * 100) / 100,
        variableCosts: Math.round(budgetedVariableCosts * 100) / 100,
        fixedCosts: Math.round(budgetedFixedCosts * 100) / 100,
        operatingIncome: Math.round(staticOpIncome * 100) / 100,
      },
      flexibleBudget: {
        revenue: flexRevenue,
        variableCosts: flexVariableCosts,
        fixedCosts: Math.round(budgetedFixedCosts * 100) / 100,
        operatingIncome: flexOperatingIncome,
      },
      volumeVariance: Math.round(volumeVariance * 100) / 100,
      flexibleBudgetVariance: Math.round(flexibleBudgetVariance * 100) / 100,
    }
  }
}
