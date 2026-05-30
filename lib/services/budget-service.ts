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
    userId: string = "system"
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
        fiscalYear,
        period,
        accountCode,
        accountName: account.name,
        budgetedAmount,
        notes,
        created_at: now,
        created_by: userId,
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
    userId: string = "system"
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
      .eq("fiscalYear", fiscalYear)
    if (period > 0) {
      query = query.eq("period", period)
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
        .eq("fiscalYear", fiscalYear)
      if (error) throw error
      return ((data || []) as BudgetLine[])
        .sort((a, b) => a.period - b.period || a.accountCode.localeCompare(b.accountCode))
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
}
