import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { CHART_OF_ACCOUNTS } from "@/lib/accounting/account-types"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { data: assets } = await getServiceClient().from(TABLES.ASSETS).select("*")
    const { data: journalEntries } = await getServiceClient().from(TABLES.JOURNAL_ENTRIES)
      .select("*").order("date", { ascending: false })

    const entryIds = (journalEntries || []).map((e: any) => e.id)
    const { data: lines } = entryIds.length > 0
      ? await getServiceClient().from(TABLES.JOURNAL_ENTRY_LINES).select("*").in("journal_entry_id", entryIds)
      : { data: [] }

    const fixedAssetCodes = ["1301", "1302", "1303", "1304", "1305", "1306", "1307"]
    const schedule: any[] = []

    for (const asset of (assets || [])) {
      const purchaseCost = asset.purchase_cost || 0
      const usefulLife = asset.useful_life_years || 5
      const salvage = asset.salvage_value || 0
      const annualDep = usefulLife > 0 ? (purchaseCost - salvage) / usefulLife : 0
      const monthlyDep = annualDep / 12

      const assetLines = (lines || []).filter((l: any) =>
        l.account_code && (l.account_code >= "1351" && l.account_code <= "1354")
      )
      let accumDep = assetLines.reduce((s: number, l: any) => s + (l.debit || 0), 0)

      schedule.push({
        id: asset.id,
        name: asset.name || asset.asset_code || "Asset",
        category: asset.category || "",
        purchase_date: asset.purchase_date || "",
        purchase_cost: purchaseCost,
        useful_life: usefulLife,
        salvage_value: salvage,
        annual_depreciation: Math.round(annualDep * 100) / 100,
        monthly_depreciation: Math.round(monthlyDep * 100) / 100,
        accumulated_depreciation: Math.round(accumDep * 100) / 100,
        net_book_value: Math.round((purchaseCost - accumDep) * 100) / 100,
      })
    }

    return NextResponse.json({
      schedule,
      summary: {
        totalCost: schedule.reduce((s: number, a: any) => s + a.purchase_cost, 0),
        totalAccumDep: schedule.reduce((s: number, a: any) => s + a.accumulated_depreciation, 0),
        totalNBV: schedule.reduce((s: number, a: any) => s + a.net_book_value, 0),
      }
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate depreciation schedule" }, { status: 500 })
  }
}
