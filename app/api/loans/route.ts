import { NextResponse } from "next/server"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

// API endpoint for recording loans with automatic balance synchronization
export async function POST(request: Request) {
  const auth = await requirePermission("accounting:create")
  if (!auth.authorized) return auth.response
  try {
    const body = await request.json()
    const { amount, description, lenderName, loanType, receivedVia } = body
    
    // Validate input
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid loan amount is required" }, { status: 400 })
    }
    
    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

    const now = new Date()
    const loanDescription = description || `Loan received from ${lenderName || 'Lender'}`
    
    // BUG-1: Replace placeholders with numeric codes
    let cashAccount = "1103" // Default Bank
    if (receivedVia === "cash") cashAccount = "1101"

    const liabilityAccount = loanType === "long-term" ? "2201" : "2210" // 2201: Long-term, 2210: Short-term Notes
    
    const entries = [
      {
        accountCode: cashAccount,
        accountName: receivedVia === "cash" ? "Cash on Hand" : "Bank Account",
        debit: amount,
        credit: 0,
        description: loanDescription
      },
      {
        accountCode: liabilityAccount,
        accountName: loanType === "long-term" ? "Long-Term Loans" : "Short-Term Loans",
        debit: 0,
        credit: amount,
        description: `Loan payable to ${lenderName || 'Lender'}`
      }
    ]
    
    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.GENERAL,
      entries,
      `LOAN-${Date.now()}`,
      `Loan recording: ${loanDescription}`
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      journalEntryId: result.entryId,
      loan: {
        amount,
        description: loanDescription,
        lenderName,
        liabilityAccount,
        loanType: loanType || "short-term",
        date: now
      }
    })
  } catch (error) {
    console.error("Error recording loan:", error)
    return NextResponse.json({ error: "Failed to record loan" }, { status: 500 })
  }
}

// GET endpoint to fetch loans
export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { db, COLLECTIONS } = await import("@/lib/firebase")
    
    // BUG-1: Update detection logic for numeric codes
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).get()
    
    const loans: any[] = []
    journalSnapshot.docs.forEach(doc => {
      const entry = doc.data()
      if (entry.entries) {
        // Loan = Debit 1101/1103 (Cash/Bank) AND Credit 2201/2210 (Loans Payable)
        const hasCashDebit = entry.entries.some((subEntry: any) => 
          (subEntry.account_id === "1101" || subEntry.account_id === "1103") && subEntry.debit > 0
        )
        const hasLiabilityCredit = entry.entries.some((subEntry: any) => 
          (subEntry.account_id === "2201" || subEntry.account_id === "2210") && subEntry.credit > 0
        )
        
        if (hasCashDebit && hasLiabilityCredit) {
          const cashEntry = entry.entries.find((subEntry: any) => 
            (subEntry.account_id === "1101" || subEntry.account_id === "1103") && subEntry.debit > 0
          )
          const liabilityEntry = entry.entries.find((subEntry: any) => 
            (subEntry.account_id === "2201" || subEntry.account_id === "2210") && subEntry.credit > 0
          )
          
          loans.push({
            id: doc.id,
            amount: cashEntry?.debit || 0,
            description: entry.description || cashEntry?.description || "",
            liabilityAccount: liabilityEntry?.account_id || "",
            loanType: liabilityEntry?.account_id === "2201" ? "long-term" : "short-term",
            date: entry.date?.toDate ? entry.date.toDate() : (entry.date || new Date())
          })
        }
      }
    })
    
    return NextResponse.json({ success: true, loans, count: loans.length })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 })
  }
}
