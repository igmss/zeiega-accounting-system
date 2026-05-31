import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"
import { getAccountName } from "@/lib/accounting/account-types"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { date, accounts } = body

        if (!date) {
            return NextResponse.json({ error: "Date is required" }, { status: 400 })
        }

        const userId = auth.user?.id || null
        const effectiveDate = new Date(date)

        // If accounts array is provided (simpler format), use it directly
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

        // Legacy format: cashOnHand, bankAccounts, partnerCapital, etc.
        const { cashOnHand, bankAccounts, receivables, inventory, fixedAssets, partnerCapital } = body
        const jeLines: any[] = []
        const add = (code: string, name: string, dr: number, cr: number, desc: string) => {
            if (dr > 0 || cr > 0) jeLines.push({ accountCode: code, accountName: name, debit: dr, credit: cr, description: desc })
        }

        if (cashOnHand > 0) add("1101", "Cash on Hand", cashOnHand, 0, "Opening cash")
        if (Array.isArray(bankAccounts)) {
            for (const b of bankAccounts) {
                if (b.amount > 0) add(b.accountId || "1103", b.name || "Bank", b.amount, 0, "Opening bank balance")
            }
        }
        if (receivables > 0) add("1110", "Accounts Receivable", receivables, 0, "Opening receivables")
        if (inventory?.rawMaterials > 0) add("1201", "Raw Materials", inventory.rawMaterials, 0, "Opening inventory")
        if (inventory?.finishedGoods > 0) add("1220", "Finished Goods", inventory.finishedGoods, 0, "Opening FG")
        if (fixedAssets?.machinery > 0) add("1301", "Machinery", fixedAssets.machinery, 0, "Opening machinery")
        if (fixedAssets?.equipment > 0) add("1303", "Equipment", fixedAssets.equipment, 0, "Opening equipment")
        if (fixedAssets?.furniture > 0) add("1306", "Furniture", fixedAssets.furniture, 0, "Opening furniture")
        if (fixedAssets?.vehicles > 0) add("1305", "Vehicles", fixedAssets.vehicles, 0, "Opening vehicles")

        if (partnerCapital?.ahmed > 0) add("3011", "Ahmed Capital", 0, partnerCapital.ahmed, "Capital - Ahmed")
        if (partnerCapital?.ibrahim > 0) add("3012", "Ibrahim Capital", 0, partnerCapital.ibrahim, "Capital - Ibrahim")
        if (partnerCapital?.fathy > 0) add("3013", "Fathy Capital", 0, partnerCapital.fathy, "Capital - Fathy")

        if (jeLines.length < 2) {
            return NextResponse.json({ error: "At least 2 accounts required" }, { status: 400 })
        }

        const result = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.GENERAL, jeLines, "OB-INIT",
            `Opening Balances as of ${date}`, userId, effectiveDate
        )

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json({ success: true, message: "Opening balances recorded", entryId: result.entryId })

    } catch (error) {
        console.error("Error creating opening balances:", error)
        return NextResponse.json({ error: "Failed to create opening balances" }, { status: 500 })
    }
}
