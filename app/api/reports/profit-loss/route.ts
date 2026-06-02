import { NextResponse } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"
import { getServiceClient, TABLES } from "@/lib/supabase"
import { AccountType, getAccountsByType, isDebitNormalBalance } from "@/lib/accounting/account-types"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: "Date range is required (from, to)" }, { status: 400 })
    }

    const startDate = new Date(from); startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(to); endDate.setHours(23, 59, 59, 999)

    const incomeStatement = await FinancialStatementsService.generateIncomeStatement(startDate, endDate)

    // Compute monthly trend in a single query (replaces ~960 per-month round-trips)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const trend: Array<{ month: string; revenue: number; expenses: number; profit: number }> = []
    const revenueCodes = getAccountsByType(AccountType.REVENUE).map(a => a.code)
    const cogsCodes = getAccountsByType(AccountType.COGS).map(a => a.code)
    const expenseCodes = getAccountsByType(AccountType.EXPENSE).map(a => a.code)
    const allCodes = [...revenueCodes, ...cogsCodes, ...expenseCodes]

    const { data: monthLines } = await getServiceClient()
      .from(TABLES.JOURNAL_ENTRY_LINES)
      .select(`account_code, debit, credit, journal_entries(date)`)
      .in("account_code", allCodes)
      .gte("journal_entries.date", startDate.toISOString().split("T")[0])
      .lte("journal_entries.date", endDate.toISOString().split("T")[0])

    const monthBuckets: Record<string, { rev: number; exp: number }> = {}
    for (let i = 0; i < 12; i++) monthBuckets[months[i]] = { rev: 0, exp: 0 }

    for (const line of (monthLines || [])) {
      const jeDate = (line as any).journal_entries?.date
      if (!jeDate) continue
      const key = months[new Date(jeDate).getMonth()]
      if (!monthBuckets[key]) continue
      const net = (line.debit || 0) - (line.credit || 0)
      if (revenueCodes.includes(line.account_code)) {
        monthBuckets[key].rev += isDebitNormalBalance(line.account_code) ? net : -net
      } else {
        monthBuckets[key].exp += isDebitNormalBalance(line.account_code) ? net : -net
      }
    }

    for (const [month, vals] of Object.entries(monthBuckets)) {
      trend.push({ month, revenue: Math.round(vals.rev * 100) / 100, expenses: Math.round(vals.exp * 100) / 100, profit: Math.round((vals.rev - vals.exp) * 100) / 100 })
    }

    const expenseBreakdown = incomeStatement.operatingExpenses.items.reduce((acc, item) => {
      const code = parseInt(item.code)
      if (code >= 6001 && code <= 6006) acc.administrative += item.amount
      else if (code >= 6101 && code <= 6107) acc.marketing += item.amount
      else if (code >= 6201 && code <= 6206) acc.operating += item.amount
      return acc
    }, { administrative: 0, marketing: 0, operating: 0 })

    const response = {
      periodStart: incomeStatement.periodStart.toString().split("T")[0],
      periodEnd: incomeStatement.periodEnd.toString().split("T")[0],
      revenue: {
        items: incomeStatement.revenue.items.map(i => ({ code: i.code, name: i.name, amount: Math.round(i.amount * 100) / 100 })),
        sales_revenue: Math.round(incomeStatement.revenue.total * 100) / 100,
        other_income: 0,
        total_revenue: Math.round(incomeStatement.revenue.total * 100) / 100,
      },
      cost_of_goods_sold: {
        items: incomeStatement.costOfGoodsSold.items.map(i => ({ code: i.code, name: i.name, amount: Math.round(i.amount * 100) / 100 })),
        raw_materials: Math.round(incomeStatement.costOfGoodsSold.items.filter(i => i.code === "5001").reduce((s, i) => s + i.amount, 0) * 100) / 100,
        direct_labor: Math.round(incomeStatement.costOfGoodsSold.items.filter(i => i.code === "5002" || i.code === "5003").reduce((s, i) => s + i.amount, 0) * 100) / 100,
        manufacturing_overhead: Math.round(incomeStatement.costOfGoodsSold.items.filter(i => parseInt(i.code) >= 5004 && parseInt(i.code) <= 5008).reduce((s, i) => s + i.amount, 0) * 100) / 100,
        total_cogs: Math.round(incomeStatement.costOfGoodsSold.total * 100) / 100,
      },
      gross_profit: Math.round(incomeStatement.grossProfit * 100) / 100,
      operating_expenses: {
        items: incomeStatement.operatingExpenses.items.map(i => ({ code: i.code, name: i.name, amount: Math.round(i.amount * 100) / 100 })),
        onlineSalesCosts: {
          items: (incomeStatement.operatingExpenses.onlineSalesCosts?.items || []).map(i => ({ code: i.code, name: i.name, amount: Math.round(i.amount * 100) / 100 })),
          total: Math.round((incomeStatement.operatingExpenses.onlineSalesCosts?.total || 0) * 100) / 100,
        },
        salaries_wages: Math.round(expenseBreakdown.administrative * 100) / 100,
        marketing: Math.round(expenseBreakdown.marketing * 100) / 100,
        other_expenses: Math.round(expenseBreakdown.operating * 100) / 100,
        total_operating_expenses: Math.round(incomeStatement.operatingExpenses.total * 100) / 100,
      },
      operating_income: Math.round(incomeStatement.operatingIncome * 100) / 100,
      other_income_expenses: {
        items: incomeStatement.otherIncomeExpenses.items.map(i => ({ code: i.code, name: i.name, amount: Math.round(i.amount * 100) / 100 })),
        interest_income: 0,
        interest_expense: Math.round(incomeStatement.otherIncomeExpenses.items.filter(i => i.code === "7001").reduce((s, i) => s + i.amount, 0) * 100) / 100,
        total_other: Math.round(incomeStatement.otherIncomeExpenses.total * 100) / 100,
      },
      net_income: Math.round(incomeStatement.netIncome * 100) / 100,
      monthlyTrend: trend,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error generating P&L report:", error)
    return NextResponse.json({ error: "Failed to generate P&L report" }, { status: 500 })
  }
}
