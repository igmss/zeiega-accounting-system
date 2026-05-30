import { NextResponse } from "next/server"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { EnhancedAccountingService, JournalEntryType, ACCOUNTS } from "@/lib/services/enhanced-accounting-service"
import { requirePermission } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("accounting:create")
    if (!auth.authorized) return auth.response

    const { amount, paymentMethod, periodDescription } = await request.json()

    if (!amount || amount <= 0 || !paymentMethod) {
      return NextResponse.json({ error: "amount and paymentMethod are required" }, { status: 400 })
    }

    const vatAccount = ACCOUNTS.VAT_PAYABLE || "2110"
    const currentBalance = await FinancialStatementsService.getAccountBalance(vatAccount)

    if (amount > currentBalance + 0.01) {
      return NextResponse.json({ 
        error: `Insufficient VAT Payable balance. Current: ${currentBalance.toLocaleString()}, Amount: ${amount.toLocaleString()}` 
      }, { status: 400 })
    }

    const creditAccount = (paymentMethod === "bank") ? (ACCOUNTS.BANK || "1103") : (ACCOUNTS.CASH || "1101")
    const creditAccountName = (paymentMethod === "bank") ? "Bank Account" : "Cash on Hand"

    const lines = [
      {
        accountCode: vatAccount,
        accountName: "VAT Payable",
        debit: amount,
        credit: 0,
        description: `VAT Settlement payment: ${periodDescription || "UNSPECIFIED"}`
      },
      {
        accountCode: creditAccount,
        accountName: creditAccountName,
        debit: 0,
        credit: amount,
        description: `VAT Payment via ${paymentMethod}`
      }
    ]

    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.TAX_PAYMENT,
      lines,
      `VAT-${Date.now()}`,
      `Recorded VAT settlement for period: ${periodDescription || "Business Taxes"}`,
      "admin"
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    console.log(`✅ Recorded VAT payment of ${amount.toLocaleString()} via ${paymentMethod}`)

    return NextResponse.json({
      success: true,
      entryId: result.entryId,
      paidAmount: amount,
      remainingBalance: currentBalance - amount,
      message: `VAT settlement entry ${result.entryId} posted successfully.`
    })

  } catch (error) {
    console.error("VAT payment processing error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
