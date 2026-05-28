import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    // Fetch chart of accounts from Firestore
    const accountsSnapshot = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).get()
    const accounts = accountsSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        code: data.code || doc.id,
        name: data.name || "",
        type: data.type || "",
        normal_balance: data.normal_balance || "debit",
        isActive: data.is_active !== false,
        deprecatedReason: data.deprecated_reason || null,
        balance: data.balance || 0,
        description: data.description || null,
        parent_code: data.parent_code || null,
      }
    })

    // Fetch live balances from acc_account_balances (maintained by EnhancedAccountingService)
    const balanceSnapshot = await db.collection(COLLECTIONS.ACCOUNT_BALANCES).get()
    const balanceMap: Record<string, number> = {}
    balanceSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.balance !== undefined) {
        balanceMap[doc.id] = data.balance
      }
    })

    // Merge live balances into accounts
    // Priority: data.balance from chart doc (sync writes here) > acc_account_balances cache
    for (const account of accounts) {
      const originalBalance = account.balance
      const codeBalance = balanceMap[account.code]
      const idBalance = balanceMap[account.id]
      // Only use cache if chart doc has no balance set
      if (originalBalance === 0) {
        if (codeBalance !== undefined) account.balance = codeBalance
        else if (idBalance !== undefined) account.balance = idBalance
      }
    }

    // Fetch journal entries from Firestore
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).get()
    const journalEntries = journalSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date()
    }))

    return NextResponse.json({
      success: true,
      accounts: accounts.length > 0 ? accounts : [],
      journalEntries: journalEntries.length > 0 ? journalEntries : []
    })
  } catch (error) {
    console.error("Error fetching chart of accounts:", error)
    return NextResponse.json(
      { error: "Failed to fetch chart of accounts" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    if (type === "account") {
      // Add new account
      const accountRef = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).add({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })

      return NextResponse.json({
        id: accountRef.id,
        message: "Account created successfully"
      })
    }

    return NextResponse.json(
      { error: "Invalid request type. Use /api/journal-entries POST for journal entries." },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error creating chart of accounts data:", error)
    return NextResponse.json(
      { error: "Failed to create chart of accounts data" },
      { status: 500 }
    )
  }
}
