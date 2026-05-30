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

        let rawMaterialsPurchases = 0
        let directLabor = 0
        let factoryRent = 0
        let factoryUtilities = 0
        let depreciation = 0
        let maintenance = 0
        let indirectLabor = 0
        let wipMaterials = 0
        let wipLabor = 0
        let wipOverhead = 0

        journalEntries.forEach((entry: any) => {
            const lines = entry.entries || entry.lines || []

            lines.forEach((line: any) => {
                const accountCode = line.account_id || line.accountCode || ""
                const debit = line.debit || 0
                const credit = line.credit || 0

                switch (accountCode) {
                    case "5001":
                        rawMaterialsPurchases += debit - credit
                        break
                    case "5002":
                        directLabor += debit - credit
                        break
                    case "5003":
                        directLabor += debit - credit
                        break
                    case "5004":
                        indirectLabor += debit - credit
                        break
                    case "5005":
                        factoryRent += debit - credit
                        break
                    case "5006":
                        factoryUtilities += debit - credit
                        break
                    case "5007":
                        maintenance += debit - credit
                        break
                    case "5008":
                        depreciation += debit - credit
                        break
                    case "5101":
                        wipMaterials += debit - credit
                        break
                    case "5102":
                        wipLabor += debit - credit
                        break
                    case "5103":
                        wipOverhead += debit - credit
                        break
                }
            })
        })

        const rmAccounts = ["1201", "1202", "1203"]
        const wipAccounts = ["1210", "1710", "1711", "1712"]

        const beforePeriod = new Date(start.getTime() - 1)

        const [begRM, begWIP, endRM, endWIP] = await Promise.all([
            Promise.all(rmAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, beforePeriod))),
            Promise.all(wipAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, beforePeriod))),
            Promise.all(rmAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, end))),
            Promise.all(wipAccounts.map(code => FinancialStatementsService.getAccountBalance(code, undefined, end))),
        ])

        const beginningRawMaterials = begRM.reduce((sum: number, val: number) => sum + val, 0)
        const beginningWIP = begWIP.reduce((sum: number, val: number) => sum + val, 0)
        const endingRawMaterials = endRM.reduce((sum: number, val: number) => sum + val, 0)
        const endingWIP = endWIP.reduce((sum: number, val: number) => sum + val, 0)

        const totalMaterialsAvailable = beginningRawMaterials + rawMaterialsPurchases
        const materialsUsed = totalMaterialsAvailable - endingRawMaterials
        const totalOverhead = factoryRent + factoryUtilities + depreciation + maintenance + indirectLabor
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
                factory_rent: factoryRent,
                utilities: factoryUtilities,
                depreciation: depreciation,
                maintenance: maintenance,
                indirect_labor: indirectLabor,
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
