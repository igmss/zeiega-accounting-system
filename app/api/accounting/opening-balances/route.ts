import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"
import { getAccountName } from "@/lib/accounting/account-types"
import { getServiceSupabase, TABLES } from "@/lib/supabase"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { date, accounts } = body

        if (!date) {
            return NextResponse.json({ error: "Date is required" }, { status: 400 })
        }

        if (isNaN(Date.parse(date))) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
        }

        const userId = auth.user?.id || null
        const effectiveDate = new Date(date)

        // If accounts array is provided, use it directly
        if (accounts && Array.isArray(accounts) && accounts.length >= 2) {
            const lines = accounts.map((a: any) => {
                const code = a.code || a.account_id
                const balance = a.balance || 0
                return {
                    accountCode: code,
                    accountName: a.name || getAccountName(code) || code,
                    debit: balance > 0 ? balance : 0,
                    credit: balance < 0 ? Math.abs(balance) : 0,
                    description: a.description || `Opening balance`,
                }
            })

            const result = await EnhancedAccountingService.createJournalEntry(
                JournalEntryType.GENERAL, lines, "OB-INIT",
                `Opening Balances as of ${date}`, userId, effectiveDate
            )

            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 })
            }

            return NextResponse.json({ success: true, message: "Opening balances recorded", entryId: result.entryId })
        }

        // Legacy form format
        const {
            cashOnHand, bankAccounts, receivables, inventory, fixedAssets,
            digitalAssets, partnerCapital, rebalancingEnabled, loans,
            liabilities, otherLiabilities
        } = body

        const jeLines: any[] = []
        const add = (code: string, name: string, dr: number, cr: number, desc: string) => {
            if (dr > 0 || cr > 0) jeLines.push({ accountCode: code, accountName: name, debit: dr, credit: cr, description: desc })
        }

        // -- OB-01: Cash & Bank --
        if (cashOnHand > 0) add("1101", "Cash on Hand", cashOnHand, 0, "OB-01: Opening cash")
        if (Array.isArray(bankAccounts)) {
            for (const b of bankAccounts) {
                if (b.amount > 0) add(b.accountId || "1103", b.name || "Bank", b.amount, 0, "OB-01: Opening bank balance")
            }
        }

        // -- OB-01: Receivables --
        if (receivables > 0) add("1110", "Accounts Receivable", receivables, 0, "OB-01: Opening receivables")

        // -- OB-02: Inventory --
        if (inventory?.rawMaterials > 0) add("1201", "Raw Materials", inventory.rawMaterials, 0, "OB-02: Opening inventory - RM")
        if (inventory?.wip > 0) add("1210", "WIP Inventory", inventory.wip, 0, "OB-02: Opening inventory - WIP")
        if (inventory?.finishedGoods > 0) add("1220", "Finished Goods", inventory.finishedGoods, 0, "OB-02: Opening inventory - FG")

        // -- OB-03: Fixed Assets --
        if (fixedAssets?.machinery > 0) add("1301", "Sewing Machines", fixedAssets.machinery, 0, "OB-03: Opening fixed asset")
        if (fixedAssets?.equipment > 0) add("1303", "Production Equipment", fixedAssets.equipment, 0, "OB-03: Opening fixed asset")
        if (fixedAssets?.office > 0) add("1304", "Office Equipment", fixedAssets.office, 0, "OB-03: Opening fixed asset")
        if (fixedAssets?.furniture > 0) add("1306", "Furniture & Fixtures", fixedAssets.furniture, 0, "OB-03: Opening fixed asset")
        if (fixedAssets?.vehicles > 0) add("1307", "Vehicles", fixedAssets.vehicles, 0, "OB-03: Opening fixed asset")

        // -- OB-03: Digital Assets --
        if (digitalAssets?.domains > 0) add("1451", "Domain Names & Websites", digitalAssets.domains, 0, "OB-03: Opening digital asset")
        if (digitalAssets?.software > 0) add("1452", "Software Licenses", digitalAssets.software, 0, "OB-03: Opening digital asset")
        if (digitalAssets?.ip > 0) add("1453", "Digital Designs & IP", digitalAssets.ip, 0, "OB-03: Opening digital asset")
        if (digitalAssets?.crypto > 0) add("1454", "Cryptocurrency", digitalAssets.crypto, 0, "OB-03: Opening digital asset")

        // -- OB-04: Liabilities --
        if (liabilities?.accountsPayable > 0) add("2101", "Accounts Payable", 0, liabilities.accountsPayable, "OB-04: Opening AP")
        if (liabilities?.accruedExpenses > 0) add("2140", "Accrued Expenses", 0, liabilities.accruedExpenses, "OB-04: Opening accruals")
        if (Array.isArray(otherLiabilities)) {
            for (const ol of otherLiabilities) {
                if (ol.amount > 0) add(ol.accountId || "2101", ol.name || "Other Liability", 0, ol.amount, "OB-04: Opening other liability")
            }
        }

        // -- OB-04: Loans --
        if (Array.isArray(loans)) {
            for (const loan of loans) {
                if (loan.amount > 0) add(loan.accountId || "2201", loan.name || "Loan", 0, loan.amount, "OB-04: Opening loan")
            }
        }

        // -- OB-05: Partner Capital --
        if (partnerCapital?.ahmed > 0) add("3011", "Ahmed Capital", 0, partnerCapital.ahmed, "OB-05: Capital - Ahmed (60%)")
        if (partnerCapital?.ibrahim > 0) add("3012", "Ibrahim Capital", 0, partnerCapital.ibrahim, "OB-05: Capital - Ibrahim (25%)")
        if (partnerCapital?.fathy > 0) add("3013", "Fathy Capital", 0, partnerCapital.fathy, "OB-05: Capital - Fathy (15%)")

        // -- OB-06: Capital Rebalancing --
        if (rebalancingEnabled) {
            const totalCapital = (partnerCapital?.ahmed || 0) + (partnerCapital?.ibrahim || 0) + (partnerCapital?.fathy || 0)
            if (totalCapital > 0) {
                const targetAhmed = Math.round(totalCapital * 0.60 * 100) / 100
                const targetIbrahim = Math.round(totalCapital * 0.25 * 100) / 100
                const targetFathy = Math.round(totalCapital * 0.15 * 100) / 100

                const diffAhmed = targetAhmed - (partnerCapital?.ahmed || 0)
                const diffIbrahim = targetIbrahim - (partnerCapital?.ibrahim || 0)
                const diffFathy = targetFathy - (partnerCapital?.fathy || 0)

                if (Math.abs(diffAhmed) > 0.01) {
                    add("3011", "Ahmed Capital", diffAhmed < 0 ? Math.abs(diffAhmed) : 0, diffAhmed > 0 ? diffAhmed : 0,
                        `OB-06: Rebalance Ahmed to 60% (${diffAhmed > 0 ? '+' : ''}${diffAhmed.toFixed(0)})`)
                }
                if (Math.abs(diffIbrahim) > 0.01) {
                    add("3012", "Ibrahim Capital", diffIbrahim < 0 ? Math.abs(diffIbrahim) : 0, diffIbrahim > 0 ? diffIbrahim : 0,
                        `OB-06: Rebalance Ibrahim to 25% (${diffIbrahim > 0 ? '+' : ''}${diffIbrahim.toFixed(0)})`)
                }
                if (Math.abs(diffFathy) > 0.01) {
                    add("3013", "Fathy Capital", diffFathy < 0 ? Math.abs(diffFathy) : 0, diffFathy > 0 ? diffFathy : 0,
                        `OB-06: Rebalance Fathy to 15% (${diffFathy > 0 ? '+' : ''}${diffFathy.toFixed(0)})`)
                }
            }
        }

        if (jeLines.length < 2) {
            return NextResponse.json({
                error: "At least 2 accounts with non-zero amounts are required. Please enter opening balance values."
            }, { status: 400 })
        }

        const { data: existingOB } = await getServiceSupabase()
            .from(TABLES.JOURNAL_ENTRIES)
            .select("id")
            .eq("reference_id", "OB-INIT")
            .limit(1)
        if (existingOB && existingOB.length > 0) {
            return NextResponse.json({
                error: "Opening balances have already been recorded. Use the edit function to modify them.",
                existingEntryId: existingOB[0].id,
            }, { status: 409 })
        }

        const result = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.GENERAL, jeLines, "OB-INIT",
            `Opening Balances as of ${date}`, userId, effectiveDate
        )

        if (!result.success) {
            return NextResponse.json({
                error: result.error,
                hint: "Ensure total debits equal total credits. If assets (debits) exceed liabilities + capital (credits), the difference will be posted to Retained Earnings as a balancing entry."
            }, { status: 400 })
        }

        return NextResponse.json({ success: true, message: "Opening balances recorded", entryId: result.entryId })

    } catch (error) {
        console.error("Error creating opening balances:", error)
        return NextResponse.json({ error: "Failed to create opening balances" }, { status: 500 })
    }
}
