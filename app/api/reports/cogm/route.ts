import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const fromDate = searchParams.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
        const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

        const start = new Date(fromDate)
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999) // End of day

        // Query journal entries to calculate manufacturing costs for the period
        const journalEntriesRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            .where("date", ">=", start)
            .where("date", "<=", end)
        
        const journalSnapshot = await journalEntriesRef.get()

        // Initialize cost components
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

        journalSnapshot.docs.forEach((doc) => {
            const entry = doc.data()
            const lines = entry.entries || entry.lines || []

            lines.forEach((line: any) => {
                const accountCode = line.account_id || line.accountCode || ""
                const debit = line.debit || 0
                const credit = line.credit || 0

                // Manufacturing cost accounts
                switch (accountCode) {
                    case "5001": // Raw Materials Used
                        rawMaterialsPurchases += debit - credit
                        break
                    case "5002": // Direct Labor
                        directLabor += debit - credit
                        break
                    case "5003": // Production Overtime
                        directLabor += debit - credit
                        break
                    case "5004": // Manufacturing Overhead
                        indirectLabor += debit - credit
                        break
                    case "5005": // Factory Rent
                        factoryRent += debit - credit
                        break
                    case "5006": // Factory Utilities
                        factoryUtilities += debit - credit
                        break
                    case "5007": // Machine Maintenance
                        maintenance += debit - credit
                        break
                    case "5008": // Depreciation - Factory Equipment
                        depreciation += debit - credit
                        break
                    case "5101": // Direct Materials - WIP
                        wipMaterials += debit - credit
                        break
                    case "5102": // Direct Labor - WIP
                        wipLabor += debit - credit
                        break
                    case "5103": // Manufacturing Overhead - WIP
                        wipOverhead += debit - credit
                        break
                }
            })
        })

        // Get live inventory balances from journal entries (BUG-Integrity Fix)
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

        // Calculate totals
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
