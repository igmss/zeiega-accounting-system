import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { CHART_OF_ACCOUNTS, getAccountName } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/general-ledger
 * Generate General Ledger report - all transactions by account
 * Query params: from, to (YYYY-MM-DD format), accountCode (optional - filter by account)
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const fromDate = searchParams.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
        const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]
        const filterAccountCode = searchParams.get("accountCode")

        // Query all journal entries
        const journalEntriesRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
        const journalSnapshot = await journalEntriesRef
            .orderBy("date", "asc")
            .get()

        // Build ledger by account
        const ledger: {
            [accountCode: string]: {
                code: string
                name: string
                openingBalance: number
                transactions: Array<{
                    date: string
                    entryId: string
                    description: string
                    debit: number
                    credit: number
                    runningBalance: number
                }>
                closingBalance: number
            }
        } = {}

        // Initialize all accounts or just the filtered one
        const accountCodes = filterAccountCode
            ? [filterAccountCode]
            : Object.keys(CHART_OF_ACCOUNTS)

        for (const code of accountCodes) {
            if (CHART_OF_ACCOUNTS[code]) {
                ledger[code] = {
                    code,
                    name: getAccountName(code),
                    openingBalance: 0,
                    transactions: [],
                    closingBalance: 0
                }
            }
        }

        // Process journal entries
        journalSnapshot.docs.forEach((doc) => {
            const entry = doc.data()
            const lines = entry.entries || entry.lines || []
            const entryDate = entry.date?.toDate?.()
                ? entry.date.toDate().toISOString().split("T")[0]
                : entry.date || ""

            // Check if within date range
            if (entryDate < fromDate || entryDate > toDate) return

            lines.forEach((line: any) => {
                const accountCode = line.account_id || line.accountCode || ""

                if (!ledger[accountCode]) return // Skip if not tracking this account

                const debit = line.debit || 0
                const credit = line.credit || 0

                ledger[accountCode].transactions.push({
                    date: entryDate,
                    entryId: entry.entryNumber || doc.id,
                    description: entry.description || line.description || "",
                    debit,
                    credit,
                    runningBalance: 0 // Will calculate after
                })
            })
        })

        // Calculate running balances for each account
        for (const code of Object.keys(ledger)) {
            let runningBalance = ledger[code].openingBalance

            // Determine if debit-normal account
            const isDebitNormal = ["ASSET", "EXPENSE", "COGS"].some(type =>
                CHART_OF_ACCOUNTS[code]?.type.toLowerCase().includes(type.toLowerCase())
            ) || code.startsWith("1") || code.startsWith("5") || code.startsWith("6")

            ledger[code].transactions.forEach((tx, index) => {
                if (isDebitNormal) {
                    runningBalance += tx.debit - tx.credit
                } else {
                    runningBalance += tx.credit - tx.debit
                }
                ledger[code].transactions[index].runningBalance = runningBalance
            })

            ledger[code].closingBalance = runningBalance
        }

        // Convert to array and filter out accounts with no transactions
        const accounts = Object.values(ledger)
            .filter(account => account.transactions.length > 0 || filterAccountCode)
            .sort((a, b) => a.code.localeCompare(b.code))

        return NextResponse.json({
            period: { from: fromDate, to: toDate },
            accounts,
            totalAccounts: accounts.length,
            totalTransactions: accounts.reduce((sum, a) => sum + a.transactions.length, 0)
        })
    } catch (error) {
        console.error("General Ledger report error:", error)
        return NextResponse.json(
            { error: "Failed to generate general ledger report" },
            { status: 500 }
        )
    }
}
