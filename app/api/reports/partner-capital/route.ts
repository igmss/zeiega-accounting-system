import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const now = to ? new Date(to) : new Date()
    const yearStart = from ? new Date(from) : new Date(now.getFullYear(), 0, 1)

    const partners: any = {
      ahmed: { code: "3011", name: "Ahmed", share: 60 },
      ibrahim: { code: "3012", name: "Ibrahim", share: 25 },
      fathy: { code: "3013", name: "Fathy", share: 15 },
    }

    const getBal = async (code: string, asOf: Date) => {
      const balances = await FinancialStatementsService.getAccountBalancesBatch([code], undefined, asOf)
      return balances[code] || 0
    }

    // Fetch all partner balances in one batch
    const allCodes = ["3011", "3012", "3013", "3021", "3022", "3023"]
    const [openingBals, closingBals] = await Promise.all([
      FinancialStatementsService.getAccountBalancesBatch(allCodes, undefined, new Date(yearStart.getTime() - 86400000)),
      FinancialStatementsService.getAccountBalancesBatch(allCodes, undefined, now),
    ])

    const incomeStmt = await FinancialStatementsService.generateIncomeStatement(yearStart, now)
    const netIncome = incomeStmt.netIncome

    const partnerData: any[] = []

    for (const [, p] of Object.entries(partners)) { const partner = p as any
      const openingBal = openingBals[partner.code] || 0
      const closingBal = closingBals[partner.code] || 0
      const drawingsCode = partner.code.replace("301", "302")
      const drawings = Math.abs(closingBals[drawingsCode] || 0)
      const profitShare = netIncome * (partner.share / 100)

      partnerData.push({
        partner: partner.name,
        share_percent: partner.share,
        opening_balance: Math.round(openingBal),
        profit_share: Math.round(profitShare),
        drawings: Math.round(drawings),
        closing_balance: Math.round(closingBal + profitShare - drawings),
      })
    }

    return NextResponse.json({
      partners: partnerData,
      summary: {
        totalOpeningCapital: partnerData.reduce((s: number, p: any) => s + p.opening_balance, 0),
        totalProfitShare: Math.round(netIncome),
        totalDrawings: partnerData.reduce((s: number, p: any) => s + p.drawings, 0),
        totalClosingCapital: partnerData.reduce((s: number, p: any) => s + p.closing_balance, 0),
        period: `${yearStart.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate partner capital statement" }, { status: 500 })
  }
}
