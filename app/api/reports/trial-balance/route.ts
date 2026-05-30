import { NextRequest, NextResponse } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/trial-balance
 * Generate Trial Balance report
 * Query params: asOf (YYYY-MM-DD format)
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const asOf = searchParams.get("asOf")

        const asOfDate = asOf ? new Date(asOf) : new Date("2099-12-31")
        asOfDate.setHours(23, 59, 59, 999)

        const trialBalance = await FinancialStatementsService.generateTrialBalance(asOfDate)

        return NextResponse.json({
            ...trialBalance,
            asOfDate: typeof trialBalance.asOfDate === 'string' ? trialBalance.asOfDate.split("T")[0] : new Date(trialBalance.asOfDate).toISOString().split("T")[0]
        })
    } catch (error) {
        console.error("Trial Balance report error:", error)
        return NextResponse.json(
            { error: "Failed to generate trial balance report" },
            { status: 500 }
        )
    }
}
