import { NextResponse } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/balance-sheet
 * Generate balance sheet using the proper Chart of Accounts structure
 * Query params: from, to (YYYY-MM-DD format) - uses 'to' as asOfDate
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: "Date range is required (from, to)" },
        { status: 400 }
      )
    }

    // Use 'to' date as the balance sheet date (point-in-time report)
    const asOfDate = new Date(to)

    // Generate balance sheet using the service that correctly uses new COA
    const balanceSheet = await FinancialStatementsService.generateBalanceSheet(asOfDate)

    // Transform to the expected API response format
    const response = {
      asOfDate: balanceSheet.asOfDate.toISOString().split("T")[0],
      assets: {
        current_assets: {
          items: balanceSheet.assets.currentAssets.items.map(item => ({
            code: item.code,
            name: item.name,
            amount: Math.round(item.amount * 100) / 100
          })),
          total_current_assets: Math.round(balanceSheet.assets.currentAssets.total * 100) / 100,
        },
        fixed_assets: {
          items: balanceSheet.assets.fixedAssets.items.map(item => ({
            code: item.code,
            name: item.name,
            amount: Math.round(item.amount * 100) / 100
          })),
          total_fixed_assets: Math.round(balanceSheet.assets.fixedAssets.total * 100) / 100,
        },
        total_assets: Math.round(balanceSheet.assets.totalAssets * 100) / 100,
      },
      liabilities: {
        current_liabilities: {
          items: balanceSheet.liabilities.currentLiabilities.items.map(item => ({
            code: item.code,
            name: item.name,
            amount: Math.round(item.amount * 100) / 100
          })),
          total_current_liabilities: Math.round(balanceSheet.liabilities.currentLiabilities.total * 100) / 100,
        },
        long_term_liabilities: {
          items: balanceSheet.liabilities.longTermLiabilities.items.map(item => ({
            code: item.code,
            name: item.name,
            amount: Math.round(item.amount * 100) / 100
          })),
          total_long_term_liabilities: Math.round(balanceSheet.liabilities.longTermLiabilities.total * 100) / 100,
        },
        total_liabilities: Math.round(balanceSheet.liabilities.totalLiabilities * 100) / 100,
      },
      equity: {
        items: balanceSheet.equity.items.map(item => ({
          code: item.code,
          name: item.name,
          amount: Math.round(item.amount * 100) / 100
        })),
        total_equity: Math.round(balanceSheet.equity.total * 100) / 100,
      },
      total_liabilities_and_equity: Math.round(balanceSheet.totalLiabilitiesAndEquity * 100) / 100,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error generating balance sheet report:", error)
    return NextResponse.json(
      { error: "Failed to generate balance sheet report" },
      { status: 500 }
    )
  }
}
