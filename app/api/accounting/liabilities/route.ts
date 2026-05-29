import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission, requireAuth } from "@/lib/auth"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { amount, description, liabilityAccount, offsetAccount, transactionType } = body
        // transactionType: 'incur' (New Loan/Payable) or 'repay' (Repayment)

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
        }
        if (!liabilityAccount) {
            return NextResponse.json({ error: "Liability account is required" }, { status: 400 })
        }

        const isRepayment = transactionType === 'repay'
        const desc = description || (isRepayment ? "Liability Repayment" : "New Liability Record")

        // Default Offset if missing
        // If Incurring (Credit Liability), Debit Offset (Bank/Cash)
        // If Repaying (Debit Liability), Credit Offset (Bank/Cash)
        const offsetAcc = offsetAccount || "1101"

        const result = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.GENERAL,
            [
                {
                    accountCode: liabilityAccount,
                    accountName: desc,
                    debit: isRepayment ? amount : 0,
                    credit: isRepayment ? 0 : amount,
                    description: desc,
                },
                {
                    accountCode: offsetAcc,
                    accountName: offsetAcc,
                    debit: isRepayment ? 0 : amount,
                    credit: isRepayment ? amount : 0,
                    description: desc,
                },
            ],
            `LIAB-${Math.floor(Math.random() * 10000)}`,
            desc,
            auth.user?.id
        )

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json({ success: true, message: "Liability recorded", journalEntryId: result.entryId })

    } catch (error) {
        console.error("Error recording liability:", error)
        return NextResponse.json({ error: "Failed to record liability" }, { status: 500 })
    }
}

export async function GET() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const snapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            .where('type', 'in', ['LIABILITY_INCURED', 'LIABILITY_REPAYMENT', 'OPENING_BALANCE']) // Include Opening?
            .orderBy('date', 'desc')
            .get()

        // We probably want to fetch ALL entries touching 2xxx accounts?
        // Simpler for now: fetch recent entries typed as LIABILITY_*
        // Or if we want to show ALL liabilities, we should query COA.

        // Let's stick to returning specific transactions like Assets/Expenses page does.
        // But maybe also filter for any manual Journal Entry involving 2xxx?

        // For MVP: Return check output
        const liabilities: any[] = []
        snapshot.docs.forEach(doc => {
            const data = doc.data()
            // Format for UI
            liabilities.push({
                id: doc.id,
                date: data.date?.toDate ? data.date.toDate() : data.date,
                description: data.description,
                amount: data.total_credits || data.total_debits,
                type: data.type
            })
        })

        return NextResponse.json({ success: true, liabilities })
    } catch (error) {
        console.error("Error fetching liabilities:", error)
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }
}
