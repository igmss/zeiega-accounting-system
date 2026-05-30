import { NextResponse } from "next/server"
import { requirePermission, requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("accounting:create")
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { amount, description, expenseAccount, paymentMethod } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Valid expense amount is required" },
        { status: 400 }
      )
    }

    if (!expenseAccount) {
      return NextResponse.json(
        { error: "Expense account is required" },
        { status: 400 }
      )
    }

    const now = new Date()
    const expenseDescription = description || `Business expense - ${amount.toLocaleString()}`

    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

    let paymentAccountCode = '1101'
    let paymentAccountName = 'Cash on Hand'

    if (paymentMethod === 'bank') {
      paymentAccountCode = '1103'
      paymentAccountName = 'Bank Account'
    } else if (paymentMethod === 'payable') {
      paymentAccountCode = '2101'
      paymentAccountName = 'Accounts Payable'
    }

    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.GENERAL,
      [
        {
          accountCode: expenseAccount,
          accountName: "Expense Account",
          debit: amount,
          credit: 0,
          description: expenseDescription
        },
        {
          accountCode: paymentAccountCode,
          accountName: paymentAccountName,
          debit: 0,
          credit: amount,
          description: `Payment for ${expenseDescription}`
        }
      ],
      `EXP-${Date.now()}`,
      expenseDescription
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Expense of ${amount.toLocaleString()} recorded successfully`,
      journalEntryId: result.entryId,
      expense: {
        amount: amount,
        description: expenseDescription,
        expenseAccount: expenseAccount,
        paymentAccount: paymentAccountCode,
        date: now
      }
    })

  } catch (error) {
    console.error("Error recording expense:", error)
    return NextResponse.json(
      { error: "Failed to record expense" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const { getServiceClient, TABLES } = await import("@/lib/supabase")

    const { data, error } = await getServiceClient()
      .from(TABLES.JOURNAL_ENTRIES)
      .select(`*, ${TABLES.JOURNAL_ENTRY_LINES}(*)`)
      .order("date", { ascending: false })

    if (error) throw error

    const expenses: any[] = []

    for (const rawEntry of (data || [])) {
      const entry: any = rawEntry
      const entries = entry.journal_entry_lines || entry.lines || []

      const expenseLine = entry.type === 'GENERAL' ? entries.find((line: any) => {
        const code = line.account_id || line.accountCode || ""
        return code.startsWith('6') && (line.debit > 0)
      }) : null

      const paymentLine = entries.find((line: any) => {
        const code = line.account_id || line.accountCode || ""
        return (code.startsWith('1') || code.startsWith('2')) && (line.credit > 0)
      })

      if (expenseLine) {
        expenses.push({
          id: entry.id,
          amount: expenseLine.debit || 0,
          description: entry.description || entry.memo || expenseLine.description || '',
          expenseAccount: expenseLine.account_id || expenseLine.accountCode || '',
          paymentAccount: paymentLine?.account_id || paymentLine?.accountCode || '',
          date: entry.date ? new Date(entry.date) : new Date(),
          created_at: entry.created_at ? new Date(entry.created_at) : new Date()
        })
      }
    }

    return NextResponse.json({
      success: true,
      expenses: expenses,
      count: expenses.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error("Error fetching expenses:", error)
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    )
  }
}
