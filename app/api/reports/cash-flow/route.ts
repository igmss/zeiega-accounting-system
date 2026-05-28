import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const fromDateStr = searchParams.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
        const toDateStr = searchParams.get("to") || new Date().toISOString().split("T")[0]

        const start = new Date(fromDateStr)
        start.setHours(0, 0, 0, 0)
        const end = new Date(toDateStr)
        end.setHours(23, 59, 59, 999)

        // 1. Get core cash flow metrics from centralized service
        const { FinancialStatementsService } = await import("@/lib/services/financial-statements-service")
        const statement = await FinancialStatementsService.generateCashFlowStatement(start, end)

        // 2. Fetch live cash balances for beginning and ending
        // Beginning balance is the balance before the start date
        const beforeStart = new Date(start.getTime() - 1)
        
        const cashAccountCodes = ["1101", "1102", "1103", "1104", "1105", "1106", "1107"]
        
        let beginningCash = 0
        let endingCash = 0

        for (const code of cashAccountCodes) {
            beginningCash += await FinancialStatementsService.getAccountBalance(code, undefined, beforeStart)
            endingCash += await FinancialStatementsService.getAccountBalance(code, undefined, end)
        }

        // 3. Map to existing response schema
        return NextResponse.json({
            period: { from: fromDateStr, to: toDateStr },
            operating: {
                net_income: statement.operating.netIncome,
                depreciation: statement.operating.depreciation,
                ar_change: statement.operating.arAdjustment,
                inventory_change: statement.operating.inventoryAdjustment,
                ap_change: statement.operating.apAdjustment,
                net_cash: statement.operating.total
            },
            investing: {
                equipment_purchase: -statement.investing.equipmentAdjustment, // Original expects positive for purchase
                asset_sales: 0, // Service currently combines into adjustment
                net_cash: statement.investing.total
            },
            financing: {
                loan_proceeds: statement.financing.loansAdjustment > 0 ? statement.financing.loansAdjustment : 0,
                loan_repayments: statement.financing.loansAdjustment < 0 ? Math.abs(statement.financing.loansAdjustment) : 0,
                owner_drawings: statement.financing.equityAdjustment < 0 ? Math.abs(statement.financing.equityAdjustment) : 0,
                net_cash: statement.financing.total
            },
            net_change_in_cash: statement.netCashFlow,
            beginning_cash: beginningCash,
            ending_cash: endingCash
        })
    } catch (error) {
        console.error("Cash flow report error:", error)
        return NextResponse.json(
            { error: "Failed to generate cash flow report" },
            { status: 500 }
        )
    }
}
