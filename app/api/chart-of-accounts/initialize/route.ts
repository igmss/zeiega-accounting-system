import { NextResponse } from "next/server"
import { getServiceClient, TABLES } from "@/lib/supabase"
import { CHART_OF_ACCOUNTS } from "@/lib/accounting/account-types"
import { FiscalPeriodService } from "@/lib/services/fiscal-period-service"
import { requireAdmin } from "@/lib/auth"

export async function POST() {
  try {
    const auth = await requireAdmin()
    if (!auth.authorized) return auth.response

    console.log("Initializing chart of accounts with enhanced structure...")

    const expectedAccountCount = Object.keys(CHART_OF_ACCOUNTS).length

    const { data: rawAccounts, error: fetchError } = await getServiceClient()
      .from(TABLES.CHART_OF_ACCOUNTS)
      .select("code")

    if (fetchError) throw fetchError

    const existingAccounts: { code: string }[] = (rawAccounts || []) as any

    if (existingAccounts && existingAccounts.length > 0 && existingAccounts.length >= expectedAccountCount) {
      const hasNewAccount = existingAccounts.some(account => account.code === "1454")
      const hasOldAccount = existingAccounts.some(account => account.code === "1122")

      if (hasNewAccount && !hasOldAccount) {
        console.log("Chart of accounts already exists with new structure")
        return NextResponse.json({
          success: true,
          message: "Chart of accounts already exists with new structure",
          accountCount: existingAccounts.length
        })
      }
    }

    const accounts = Object.values(CHART_OF_ACCOUNTS).map((account) => ({
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
    }))

    console.log(`Upserting ${accounts.length} accounts...`)

    const { error: upsertError } = await getServiceClient()
      .from(TABLES.CHART_OF_ACCOUNTS)
      .upsert(accounts as any, { onConflict: "code" })

    if (upsertError) throw upsertError

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
