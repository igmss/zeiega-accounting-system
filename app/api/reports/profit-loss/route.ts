import { NextResponse } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/profit-loss
 * Generate Profit & Loss (Income Statement) using the proper Chart of Accounts structure
 * Query params: from, to (YYYY-MM-DD format)
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: "Date range is required (from, to)" },
        { status: 400 }
      )
    }

    const startDate = new Date(from)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(to)
    endDate.setHours(23, 59, 59, 999)

    // Generate income statement using the service that correctly uses new COA
    const incomeStatement = await FinancialStatementsService.generateIncomeStatement(
      startDate,
      endDate
    )

    // Calculate expense breakdown from operating expenses items
    const expenseBreakdown = incomeStatement.operatingExpenses.items.reduce((acc, item) => {
      const code = parseInt(item.code)
      // Categorize by account code ranges
      if (code >= 6001 && code <= 6006) {
        acc.administrative += item.amount
      } else if (code >= 6101 && code <= 6107) {
        acc.marketing += item.amount
      } else if (code >= 6201 && code <= 6206) {
        acc.operating += item.amount
      }
      return acc
    }, { administrative: 0, marketing: 0, operating: 0 })

    // Generate monthly trend data for charts
    async function generateMonthlyTrend(from: Date, to: Date) {
      const months: string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const trend: Array<{ month: string; revenue: number; expenses: number; profit: number }> = []
      const current = new Date(from.getFullYear(), from.getMonth(), 1)
      const end = new Date(to.getFullYear(), to.getMonth(), 1)

      while (current <= end) {
        const monthStart = new Date(current)
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
        try {
          const stmt = await FinancialStatementsService.generateIncomeStatement(monthStart, monthEnd)
          trend.push({
            month: months[current.getMonth()],
            revenue: Math.round(stmt.revenue.total * 100) / 100,
            expenses: Math.round((stmt.costOfGoodsSold.total + stmt.operatingExpenses.total) * 100) / 100,
            profit: Math.round(stmt.netIncome * 100) / 100,
          })
        } catch {
          trend.push({ month: months[current.getMonth()], revenue: 0, expenses: 0, profit: 0 })
        }
        current.setMonth(current.getMonth() + 1)
      }
      return trend
    }

    // Transform to the expected API response format
    const response = {
      periodStart: incomeStatement.periodStart.toISOString().split("T")[0],
      periodEnd: incomeStatement.periodEnd.toISOString().split("T")[0],
      revenue: {
        items: incomeStatement.revenue.items.map(item => ({
          code: item.code,
          name: item.name,
          amount: Math.round(item.amount * 100) / 100
        })),
        sales_revenue: Math.round(incomeStatement.revenue.total * 100) / 100,
        other_income: 0,
        total_revenue: Math.round(incomeStatement.revenue.total * 100) / 100,
      },
      cost_of_goods_sold: {
        items: incomeStatement.costOfGoodsSold.items.map(item => ({
          code: item.code,
          name: item.name,
          amount: Math.round(item.amount * 100) / 100
        })),
        raw_materials: Math.round(
          incomeStatement.costOfGoodsSold.items
            .filter(i => i.code === "5001")
            .reduce((sum, i) => sum + i.amount, 0) * 100
        ) / 100,
        direct_labor: Math.round(
          incomeStatement.costOfGoodsSold.items
            .filter(i => i.code === "5002" || i.code === "5003")
            .reduce((sum, i) => sum + i.amount, 0) * 100
        ) / 100,
        manufacturing_overhead: Math.round(
          incomeStatement.costOfGoodsSold.items
            .filter(i => parseInt(i.code) >= 5004 && parseInt(i.code) <= 5008)
            .reduce((sum, i) => sum + i.amount, 0) * 100
        ) / 100,
        total_cogs: Math.round(incomeStatement.costOfGoodsSold.total * 100) / 100,
      },
      gross_profit: Math.round(incomeStatement.grossProfit * 100) / 100,
      operating_expenses: {
        items: incomeStatement.operatingExpenses.items.map(item => ({
          code: item.code,
          name: item.name,
          amount: Math.round(item.amount * 100) / 100
        })),
        onlineSalesCosts: {
          items: (incomeStatement.operatingExpenses.onlineSalesCosts?.items || []).map(item => ({
            code: item.code,
            name: item.name,
            amount: Math.round(item.amount * 100) / 100
          })),
          total: Math.round((incomeStatement.operatingExpenses.onlineSalesCosts?.total || 0) * 100) / 100,
        },
        salaries_wages: Math.round(expenseBreakdown.administrative * 100) / 100,
        marketing: Math.round(expenseBreakdown.marketing * 100) / 100,
        other_expenses: Math.round(expenseBreakdown.operating * 100) / 100,
        total_operating_expenses: Math.round(incomeStatement.operatingExpenses.total * 100) / 100,
      },
      operating_income: Math.round(incomeStatement.operatingIncome * 100) / 100,
      other_income_expenses: {
        items: incomeStatement.otherIncomeExpenses.items.map(item => ({
          code: item.code,
          name: item.name,
          amount: Math.round(item.amount * 100) / 100
        })),
        interest_income: 0,
        interest_expense: Math.round(
          incomeStatement.otherIncomeExpenses.items
            .filter(i => i.code === "7001")
            .reduce((sum, i) => sum + i.amount, 0) * 100
        ) / 100,
        total_other: Math.round(incomeStatement.otherIncomeExpenses.total * 100) / 100,
      },
      net_income: Math.round(incomeStatement.netIncome * 100) / 100,
      // Monthly trend data for charts
      monthlyTrend: await generateMonthlyTrend(startDate, endDate),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error generating P&L report:", error)
    return NextResponse.json(
      { error: "Failed to generate P&L report" },
      { status: 500 }
    )
  }
}
