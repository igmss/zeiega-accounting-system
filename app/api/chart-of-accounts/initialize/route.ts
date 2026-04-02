import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { CHART_OF_ACCOUNTS, AccountType } from "@/lib/accounting/account-types"
import { FiscalPeriodService } from "@/lib/services/fiscal-period-service"

export async function POST() {
  try {
    console.log("Initializing chart of accounts with enhanced structure...")

    // Get expected account count from our new structure
    const expectedAccountCount = Object.keys(CHART_OF_ACCOUNTS).length

    // Check if accounts already exist
    const existingAccountsSnapshot = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).get()

    // Only skip if we already have the full new structure (check for new account codes)
    if (!existingAccountsSnapshot.empty && existingAccountsSnapshot.size >= expectedAccountCount) {
      // Verify it's the new structure:
      // 1. Must have new account "1454" (Cryptocurrency Holdings)
      // 2. Must NOT have old account "1122" (Employee Advances - Duplicate)
      const hasNewAccount = existingAccountsSnapshot.docs.some(doc => doc.id === "1454")
      const hasOldAccount = existingAccountsSnapshot.docs.some(doc => doc.id === "1122")

      if (hasNewAccount && !hasOldAccount) {
        console.log("Chart of accounts already exists with new structure")
        return NextResponse.json({
          success: true,
          message: "Chart of accounts already exists with new structure",
          accountCount: existingAccountsSnapshot.size
        })
      }
    }

    // Clear ALL existing accounts to replace with new structure
    if (!existingAccountsSnapshot.empty) {
      console.log(`Clearing ${existingAccountsSnapshot.size} old accounts...`)
      const deleteBatch = db.batch()
      existingAccountsSnapshot.docs.forEach(doc => {
        deleteBatch.delete(doc.ref)
      })
      await deleteBatch.commit()
      console.log("Old accounts cleared")
    }

    // Initialize new chart of accounts from account-types
    const accounts = Object.values(CHART_OF_ACCOUNTS)
    console.log(`Creating ${accounts.length} accounts...`)

    // Firestore batch limit is 500, so we split into batches
    const batchSize = 400
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = db.batch()
      const batchAccounts = accounts.slice(i, i + batchSize)

      batchAccounts.forEach((account) => {
        const ref = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc(account.code)
        batch.set(ref, {
          id: account.code,
          code: account.code,
          name: account.name,
          name_ar: account.nameAr || null,
          type: account.type,
          sub_type: account.subType,
          normal_balance: account.normalBalance,
          parent_code: account.parentCode || null,
          is_active: account.isActive,
          is_system_account: account.isSystemAccount,
          is_cash_flow_tracked: account.isCashFlowTracked,
          description: account.description || null,
          balance: 0,
          created_at: new Date(),
          last_updated: new Date(),
        })
      })

      await batch.commit()
      console.log(`Created batch ${Math.floor(i / batchSize) + 1}`)
    }

    // Initialize current fiscal year
    const currentYear = new Date().getFullYear()
    const fiscalResult = await FiscalPeriodService.initializeFiscalYear(currentYear)
    if (fiscalResult.success) {
      console.log(`✅ Fiscal year ${currentYear} initialized`)
    }

    console.log(`✅ Chart of accounts initialized with ${accounts.length} accounts`)

    return NextResponse.json({
      success: true,
      message: "Chart of accounts initialized with enhanced structure",
      accountCount: accounts.length,
      fiscalYearInitialized: fiscalResult.success,
      features: [
        "50+ accounts with proper hierarchy",
        "Arabic localization support",
        "Account types and sub-types",
        "Parent/child relationships",
        "Fiscal period management",
      ]
    })

  } catch (error) {
    console.error("Error initializing chart of accounts:", error)
    return NextResponse.json(
      { error: "Failed to initialize chart of accounts", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

