import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const fromDate = searchParams.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
        const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

        const VAT_RATE = 14 // Egypt VAT rate

        const fromDateObj = fromDate ? new Date(fromDate) : undefined
        if (fromDateObj) fromDateObj.setHours(0, 0, 0, 0)
        const toDateObj = new Date(toDate)
        toDateObj.setHours(23, 59, 59, 999)
        toDateObj.setHours(23, 59, 59, 999) // End of day

        // Fetch actual balances from FinancialStatementsService
        // 1. Output VAT (2110) - Liability (Credit Normal)
        const outputVATPosted = await FinancialStatementsService.getAccountBalance("2110", undefined, toDateObj)
        
        // 2. Input VAT (1120) - Asset (Debit Normal)
        const inputVATPosted = await FinancialStatementsService.getAccountBalance("1120", undefined, toDateObj)
        
        // 3. VAT already filed/declared (2112) - Liability (Credit Normal)
        const vatAlreadyFiled = await FinancialStatementsService.getAccountBalance("2112", undefined, toDateObj)

        const netVATPayable = outputVATPosted - inputVATPosted
        const vatOutstanding = netVATPayable - vatAlreadyFiled

        // Also fetch total sales/purchases for context (optional but helpful)
        // We can estimate these or just leave them if not strictly required from posted accounts
        const taxableSales = await FinancialStatementsService.getAccountBalance("4001", fromDateObj, toDateObj) +
                            await FinancialStatementsService.getAccountBalance("4002", fromDateObj, toDateObj) +
                            await FinancialStatementsService.getAccountBalance("4003", fromDateObj, toDateObj)
        
        const taxablePurchases = await FinancialStatementsService.getAccountBalance("1201", fromDateObj, toDateObj) +
                                await FinancialStatementsService.getAccountBalance("1202", fromDateObj, toDateObj)

        return NextResponse.json({
            period: { from: fromDate, to: toDate },
            vat_rate: VAT_RATE,
            taxable_sales: taxableSales,
            taxable_purchases: taxablePurchases,
            output_vat_posted: outputVATPosted,
            input_vat_posted: inputVATPosted,
            net_vat_payable: netVATPayable,
            vat_already_filed: vatAlreadyFiled,
            vat_outstanding: vatOutstanding
        })
    } catch (error) {
        console.error("Tax/VAT report error:", error)
        return NextResponse.json(
            { error: "Failed to generate tax/VAT report" },
            { status: 500 }
        )
    }
}
