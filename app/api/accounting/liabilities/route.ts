import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission, requireAuth } from "@/lib/auth"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"
import { getAccountName } from "@/lib/accounting/account-types"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { amount, description, liabilityAccount, offsetAccount, transactionType } = body

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
        }
        if (!liabilityAccount) {
            return NextResponse.json({ error: "Liability account is required" }, { status: 400 })
        }

        const isRepayment = transactionType === 'repay'
        const desc = description || (isRepayment ? "Liability Repayment" : "New Liability Record")
        const offsetAcc = offsetAccount || "1101"

        const liabName = getAccountName(liabilityAccount)
        const offsetName = getAccountName(offsetAcc)

        const result = await EnhancedAccountingService.createJournalEntry(
            isRepayment ? JournalEntryType.LIABILITY_REPAYMENT : JournalEntryType.LIABILITY_INCURRED,
            [
                {
                    accountCode: liabilityAccount,
                    accountName: liabName,
                    debit: isRepayment ? amount : 0,
                    credit: isRepayment ? 0 : amount,
                    description: desc,
                },
                {
                    accountCode: offsetAcc,
                    accountName: offsetName,
                    debit: isRepayment ? 0 : amount,
                    credit: isRepayment ? amount : 0,
                    description: desc,
                },
            ],
            `LIAB-${Date.now()}`,
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

        const { data, error } = await getServiceClient()
            .from(TABLES.JOURNAL_ENTRIES)
            .select("*")
            .in('type', ['LIABILITY_INCURRED', 'LIABILITY_REPAYMENT'])
            .order('date', { ascending: false })

        if (error) throw error

        const liabilities: any[] = (data || []).map((row: Record<string, any>) => ({
            id: row.id,
            date: row.date || null,
            description: row.description,
            amount: row.total_credits || row.total_debits || 0,
            type: row.type
        }))

        return NextResponse.json({ success: true, liabilities })
    } catch (error) {
        console.error("Error fetching liabilities:", error)
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }
}
