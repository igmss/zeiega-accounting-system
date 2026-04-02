import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { EnhancedAccountingService, JournalEntryType, ACCOUNTS } from "@/lib/services/enhanced-accounting-service"
import { CHART_OF_ACCOUNTS, AccountType } from "@/lib/accounting/account-types"

/**
 * POST /api/accounting/fiscal-year/close
 * Accepts { fiscalYearId }
 * Returns success and the journal entry ID
 */
export async function POST(request: Request) {
  try {
    const { fiscalYearId } = await request.json()

    if (!fiscalYearId) {
      return NextResponse.json({ error: "fiscalYearId is required" }, { status: 400 })
    }

    // 1. Get Fiscal Year info
    const fyDoc = await db.collection(COLLECTIONS.FISCAL_YEARS).doc(fiscalYearId).get()
    if (!fyDoc.exists) {
      return NextResponse.json({ error: "Fiscal year not found" }, { status: 404 })
    }

    const fyData = fyDoc.data() as any
    if (fyData.isClosed) {
      return NextResponse.json({ error: "Fiscal year is already closed" }, { status: 400 })
    }

    const startDate = fyData.startDate?.toDate?.() || new Date(fyData.startDate)
    const endDate = fyData.endDate?.toDate?.() || new Date(fyData.endDate)

    // 2. Identify P&L accounts (Revenue, COGS, Expense)
    const plAccountTypes = [
      AccountType.REVENUE, 
      AccountType.COGS, 
      AccountType.EXPENSE, 
      AccountType.OTHER_INCOME, 
      AccountType.OTHER_EXPENSE
    ]
    const plAccounts = Object.values(CHART_OF_ACCOUNTS).filter(acc => plAccountTypes.includes(acc.type))

    const lines: any[] = []
    let netIncome = 0

    // 3. Batch fetch balances and create closing lines
    console.log(`Closing fiscal year ${fyData.year} for ${plAccounts.length} P&L accounts...`)
    
    for (const acc of plAccounts) {
      const balance = await FinancialStatementsService.getAccountBalance(acc.code, startDate, endDate)
      
      if (Math.abs(balance) > 0.001) { // Ignore zero balances
        const isDebitNormal = [
          AccountType.EXPENSE, 
          AccountType.COGS, 
          AccountType.OTHER_EXPENSE
        ].includes(acc.type)
        
        if (isDebitNormal) {
          // Debit balance: To zero it, we CREDIT the account
          lines.push({
            accountCode: acc.code,
            accountName: acc.name,
            debit: 0,
            credit: Math.abs(balance),
            description: `Closing entry for ${acc.name} - ${fyData.year}`
          })
          netIncome -= balance 
        } else {
          // Credit balance: To zero it, we DEBIT the account (Revenue/Other Income)
          lines.push({
            accountCode: acc.code,
            accountName: acc.name,
            debit: Math.abs(balance),
            credit: 0,
            description: `Closing entry for ${acc.name} - ${fyData.year}`
          })
          netIncome += balance 
        }
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: "No active balances found to close for this fiscal year." }, { status: 400 })
    }

    // 4. Transfer Net Income to Retained Earnings (3100)
    lines.push({
      accountCode: ACCOUNTS.RETAINED_EARNINGS || "3100",
      accountName: "Retained Earnings",
      debit: netIncome > 0 ? 0 : Math.abs(netIncome),
      credit: netIncome > 0 ? Math.abs(netIncome) : 0,
      description: `Transfer Net Income for ${fyData.year} to Retained Earnings`
    })

    // 5. Post the Closing Entry (Dated the last day of the fiscal year)
    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.CLOSING_ENTRY,
      lines,
      fiscalYearId,
      `Fiscal year closing entries for ${fyData.year}`,
      "admin",
      endDate
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // 6. Mark year as closed in the repository
    await fyDoc.ref.update({
      isClosed: true,
      status: "closed",
      closedAt: new Date(),
      closingEntryId: result.entryId
    })

    console.log(`✅ Fiscal year ${fyData.year} closed. Net Income: ${netIncome.toLocaleString()}`)

    return NextResponse.json({
      success: true,
      entryId: result.entryId,
      netIncome,
      message: `Fiscal year ${fyData.year} successfully closed. income/expense accounts zeroed.`
    })

  } catch (error) {
    console.error("Error in fiscal year closing process:", error)
    return NextResponse.json({ error: "Failed to process fiscal year closing" }, { status: 500 })
  }
}
