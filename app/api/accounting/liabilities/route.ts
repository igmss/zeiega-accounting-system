import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission, requireAuth } from "@/lib/auth"
import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

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

        const now = new Date()
        const entryId = `LIAB-${Date.now()}`
        const isRepayment = transactionType === 'repay'
        const desc = description || (isRepayment ? "Liability Repayment" : "New Liability Record")

        // Default Offset if missing
        // If Incurring (Credit Liability), Debit Offset (Bank/Cash)
        // If Repaying (Debit Liability), Credit Offset (Bank/Cash)
        const offsetAcc = offsetAccount || "1101"

        // Prepare Entries
        // Liability Account (2xxx)
        // Repayment: Debit Liability (Decrease), Credit Asset (Decrease)
        // Incurring: Credit Liability (Increase), Debit Asset (Increase) or Expense

        const liabilityEntry = {
            account_id: liabilityAccount,
            description: desc,
            debit: isRepayment ? amount : 0,
            credit: isRepayment ? 0 : amount
        }

        const offsetEntry = {
            account_id: offsetAcc,
            description: desc,
            debit: isRepayment ? 0 : amount,
            credit: isRepayment ? amount : 0
        }

        const journalEntry = {
            id: entryId,
            date: now,
            description: desc,
            reference: `LIAB-${Math.floor(Math.random() * 10000)}`,
            type: isRepayment ? 'LIABILITY_REPAYMENT' : 'LIABILITY_INCURED',
            entries: [liabilityEntry, offsetEntry],
            account_ids: [liabilityAccount, offsetAcc], // BUG-1.2 Fix
            total_debits: amount,
            total_credits: amount,
            created_at: now,
            status: 'posted'
        }

        // Save journal entry
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

        // Sync affected account balances so COA reflects immediately
        await CentralizedAccountingService.syncMultipleAccountBalances([liabilityAccount, offsetAcc])

        return NextResponse.json({ success: true, message: "Liability recorded", journalEntryId: entryId })

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
