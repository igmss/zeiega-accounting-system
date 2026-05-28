import { NextRequest } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { requirePermission } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/reports/income-statement
 * Generate income statement for a date range
 * Query params: startDate, endDate (YYYY-MM-DD format)
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const searchParams = request.nextUrl.searchParams
        const startDateStr = searchParams.get("startDate")
        const endDateStr = searchParams.get("endDate")

        // Default to current year if not specified
        const now = new Date()
        const startDate = startDateStr
            ? new Date(startDateStr)
            : new Date(now.getFullYear(), 0, 1)
        const endDate = endDateStr
            ? new Date(endDateStr)
            : new Date(now.getFullYear(), 11, 31)

        const statement = await FinancialStatementsService.generateIncomeStatement(
            startDate,
            endDate
        )

        return createSuccessResponse({
            ...statement,
            periodStart: statement.periodStart.toISOString().split("T")[0],
            periodEnd: statement.periodEnd.toISOString().split("T")[0],
        })
    } catch (error) {
        return createErrorResponse(
            error instanceof Error ? error.message : "Failed to generate income statement"
        )
    }
}
