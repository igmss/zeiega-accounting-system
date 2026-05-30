import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { CHART_OF_ACCOUNTS } from "@/lib/accounting/account-types"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("accounting:create")
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { accountIds, syncAll } = body

    let results: Record<string, number> = {}

    if (syncAll) {
      console.log("🔄 Refreshing ALL account balances...")
      for (const code of Object.keys(CHART_OF_ACCOUNTS)) {
        const { balance } = await EnhancedAccountingService.getAccountBalance(code)
        results[code] = balance
      }
    } else if (accountIds && Array.isArray(accountIds)) {
      console.log(`🔄 Refreshing specific accounts: ${accountIds.join(', ')}`)
      for (const accountId of accountIds) {
        const { balance } = await EnhancedAccountingService.getAccountBalance(accountId)
        results[accountId] = balance
      }
    } else {
      return NextResponse.json(
        { error: "Either 'syncAll: true' or 'accountIds' array is required" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Account balances synchronized successfully",
      results: results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error("Error in balance sync API:", error)
    return NextResponse.json(
      { error: "Failed to synchronize account balances" },
      { status: 500 }
    )
  }
}

// GET endpoint to check current balances
export async function GET() {
  try {
    console.log("📊 Fetching current account balances...")

    const { data: accounts, error } = await getServiceClient()
      .from(TABLES.CHART_OF_ACCOUNTS)
      .select("*")

    if (error) throw error

    return NextResponse.json({
      success: true,
      accounts: accounts || [],
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error("Error fetching account balances:", error)
    return NextResponse.json(
      { error: "Failed to fetch account balances" },
      { status: 500 }
    )
  }
}
