import { NextRequest, NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    // Fetch chart of accounts from Supabase
    const { data: accountsData, error: accountsError } = await getServiceClient()
      .from(TABLES.CHART_OF_ACCOUNTS)
      .select("*")

    const accounts = (accountsData || []).map((data: Record<string, any>) => {
      return {
        code: data.code,
        name: data.name || "",
        type: data.type || "",
        normal_balance: data.normal_balance || "debit",
        isActive: data.is_active !== false,
        deprecatedReason: data.deprecated_reason || null,
        balance: 0,
        description: data.description || null,
        parent_code: data.parent_code || null,
      }
    })

    // Fallback: use account_balances only for accounts with no chart-doc balance
    const { data: balanceData, error: balanceError } = await getServiceClient()
      .from(TABLES.ACCOUNT_BALANCES)
      .select("*")

    const balanceMap: Record<string, number> = {}
    if (!balanceError && balanceData) {
      ;(balanceData as any[]).forEach((row: Record<string, any>) => {
        if (row.closing_balance !== undefined) {
          balanceMap[row.account_code] = row.closing_balance
        }
      })
    }

    for (const account of accounts) {
      if (balanceMap[account.code] !== undefined) {
        account.balance = balanceMap[account.code]
      }
    }

    // Fetch journal entries from Supabase
    const { data: journalData, error: journalError } = await getServiceClient()
      .from(TABLES.JOURNAL_ENTRIES)
      .select("*")

    const journalEntries = (journalData || []).map((doc: Record<string, any>) => ({
      id: doc.id,
      ...doc,
      date: doc.date || null
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
      const result = await getServiceClient()
        .from(TABLES.CHART_OF_ACCOUNTS)
        .insert({
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()

      const created = result.data as any[] | null
      if (result.error || !created || created.length === 0) throw result.error || new Error("Failed to create account")

      return NextResponse.json({
        code: created[0].code,
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
