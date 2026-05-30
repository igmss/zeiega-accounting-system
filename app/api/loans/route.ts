import { NextResponse } from "next/server"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

export async function POST(request: Request) {
  const auth = await requirePermission("accounting:create")
  if (!auth.authorized) return auth.response
  try {
    const body = await request.json()
    const { amount, description, lenderName, loanType, receivedVia } = body
    
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid loan amount is required" }, { status: 400 })
    }
    
    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

    const now = new Date()
    const loanDescription = description || `Loan received from ${lenderName || 'Lender'}`
    
    let cashAccount = "1103"
    if (receivedVia === "cash") cashAccount = "1101"

    const liabilityAccount = loanType === "long-term" ? "2201" : "2210"
    
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

export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { getServiceClient, TABLES } = await import("@/lib/supabase")
    
    const { data, error } = await getServiceClient()
      .from(TABLES.JOURNAL_ENTRIES)
      .select("*")
    
    if (error) throw error
    
    const loans: any[] = []
    for (const entry of (data || [])) {
      if (entry.entries) {
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
            id: entry.id,
            amount: cashEntry?.debit || 0,
            description: entry.description || cashEntry?.description || "",
            liabilityAccount: liabilityEntry?.account_id || "",
            loanType: liabilityEntry?.account_id === "2201" ? "long-term" : "short-term",
            date: entry.date ? new Date(entry.date).toISOString() : new Date().toISOString()
          })
        }
      }
    }
    
    return NextResponse.json({ success: true, loans, count: loans.length })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 })
  }
}
