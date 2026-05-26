import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth"

import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("accounting:create")
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { accountIds, syncAll } = body
    
    let results: Record<string, number> = {}
    
    if (syncAll) {
      console.log("🔄 Syncing ALL account balances...")
      results = await CentralizedAccountingService.syncAllAccountBalances()
    } else if (accountIds && Array.isArray(accountIds)) {
      console.log(`🔄 Syncing specific accounts: ${accountIds.join(', ')}`)
      results = await CentralizedAccountingService.syncMultipleAccountBalances(accountIds)
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
    
    const accountsSnapshot = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).get()
    const accounts = accountsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    return NextResponse.json({
      success: true,
      accounts: accounts,
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
