import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

// API endpoint for recording expenses with automatic balance synchronization
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { amount, description, expenseAccount, paymentMethod } = body

    // Validate input
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

    // Map payment method to actual COA codes
    let paymentAccountCode = '1101' // Default Cash on Hand
    let paymentAccountName = 'Cash on Hand'

    if (paymentMethod === 'bank') {
      paymentAccountCode = '1103' // BUG-16: Map bank to 1103 (Main Bank), not 1105
      paymentAccountName = 'Bank Account'
    } else if (paymentMethod === 'payable') {
      paymentAccountCode = '2101' // Accounts Payable
      paymentAccountName = 'Accounts Payable'
    }

    // Record via EnhancedAccountingService
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

// GET endpoint to fetch expenses
export async function GET() {
  try {
    // Get all journal entries that represent expenses
    // We look for entries of type 'EXPENSE' OR entries that hit 5xxx/6xxx accounts
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
      .orderBy('date', 'desc')
      .get()

    const expenses: any[] = []

    journalSnapshot.docs.forEach(doc => {
      const entry = doc.data()
      const entries = entry.entries || entry.lines || [] // Handle both structures

      // Find the expense line (Debit to 6xxx for Operating Expenses only) - BUG-16 Fix
      const expenseLine = entry.type === 'GENERAL' ? entries.find((line: any) => {
        const code = line.account_id || line.accountCode || ""
        return code.startsWith('6') && (line.debit > 0)
      }) : null

      // Find the payment line (Credit to 1xxx or 2xxx)
      const paymentLine = entries.find((line: any) => {
        const code = line.account_id || line.accountCode || ""
        return (code.startsWith('1') || code.startsWith('2')) && (line.credit > 0)
      })

      if (expenseLine) {
        expenses.push({
          id: doc.id,
          amount: expenseLine.debit || 0,
          description: entry.description || entry.memo || expenseLine.description || '',
          expenseAccount: expenseLine.account_id || expenseLine.accountCode || '',
          paymentAccount: paymentLine?.account_id || paymentLine?.accountCode || '',
          date: entry.date?.toDate ? entry.date.toDate() : (entry.date || new Date()),
          created_at: entry.created_at?.toDate ? entry.created_at.toDate() : (entry.created_at || new Date())
        })
      }
    })

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
