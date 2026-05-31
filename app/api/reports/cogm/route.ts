import { NextRequest, NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const fromDate = searchParams.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
        const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

        const start = new Date(fromDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)

        const { data: journalEntries, error } = await getServiceClient()
            .from(TABLES.JOURNAL_ENTRIES)
            .select("*")
            .gte("date", start.toISOString())
            .lte("date", end.toISOString())

        if (error) throw error

        const entryIds = (journalEntries || []).map((e: any) => e.id)
        const { data: allLines } = entryIds.length > 0
            ? await getServiceClient().from(TABLES.JOURNAL_ENTRY_LINES).select("*").in("journal_entry_id", entryIds)
            : { data: [] }

        const linesByEntry = new Map<string, any[]>()
        for (const l of (allLines || [])) {
            const arr = linesByEntry.get(l.journal_entry_id) || []
            arr.push(l)
            linesByEntry.set(l.journal_entry_id, arr)
        }

        let rawMaterialsPurchases = 0
        let directLabor = 0
        let overheadApplied = 0
        let factoryOH = 0

        for (const entry of (journalEntries || [])) {
            const lines = linesByEntry.get(entry.id) || []
            for (const line of lines) {
                const code = line.account_code
                const d = line.debit || 0
                const c = line.credit || 0
                const net = d - c

                if (code === "1201" && d > 0 && c === 0) rawMaterialsPurchases += net
                if (code === "5002" || code === "5003") directLabor += net
                if (code === "5009") overheadApplied += c - d
                if (code >= "5004" && code <= "5008") factoryOH += net
            }
        }

        const rmAccounts = ["1201", "1202"]
        const wipAccounts = ["1210", "1710", "1711", "1712"]

        const beforePeriod = new Date(start.getTime() - 1)

        const [begRM, begWIP, endRM, endWIP] = await Promise.all([
            Promise.all(rmAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, beforePeriod))),
            Promise.all(wipAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, beforePeriod))),
            Promise.all(rmAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, end))),
            Promise.all(wipAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, end))),
        ])

        const beginningRawMaterials = begRM.reduce((s: number, v: number) => s + v, 0)
        const beginningWIP = begWIP.reduce((s: number, v: number) => s + v, 0)
        const endingRawMaterials = endRM.reduce((s: number, v: number) => s + v, 0)
        const endingWIP = endWIP.reduce((s: number, v: number) => s + v, 0)

        const totalMaterialsAvailable = beginningRawMaterials + rawMaterialsPurchases
        const materialsUsed = totalMaterialsAvailable - endingRawMaterials
        const totalOverhead = overheadApplied + factoryOH
        const totalManufacturingCosts = materialsUsed + directLabor + totalOverhead
        const costOfGoodsManufactured = totalManufacturingCosts + beginningWIP - endingWIP

        return NextResponse.json({
            period: { from: fromDate, to: toDate },
            direct_materials: {
                beginning_inventory: beginningRawMaterials,
                purchases: rawMaterialsPurchases,
                total_available: totalMaterialsAvailable,
                ending_inventory: endingRawMaterials,
                materials_used: materialsUsed
            },
            direct_labor: directLabor,
            manufacturing_overhead: {
                applied_oh: overheadApplied,
                factory_oh: factoryOH,
                total: totalOverhead
            },
            total_manufacturing_costs: totalManufacturingCosts,
            wip: {
                beginning: beginningWIP,
                ending: endingWIP
            },
            cost_of_goods_manufactured: costOfGoodsManufactured
        })
    } catch (error) {
        console.error("COGM report error:", error)
        return NextResponse.json(
            { error: "Failed to generate COGM report" },
            { status: 500 }
        )
    }
}
