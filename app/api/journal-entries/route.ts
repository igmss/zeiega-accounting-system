import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { db, COLLECTIONS } from "@/lib/firebase"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { authOptions } from "@/lib/auth/auth-options"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"

/**
 * GET /api/journal-entries
 * Get all journal entries with optional filtering
 */
export async function GET(request: NextRequest) {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response
    try {
        const searchParams = request.nextUrl.searchParams
        const limit = parseInt(searchParams.get("limit") || "50")
        const startDate = searchParams.get("startDate")
        const endDate = searchParams.get("endDate")
        const type = searchParams.get("type")

        let query = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            .orderBy("date", "desc")
            .limit(limit) as FirebaseFirestore.Query

        const snapshot = await query.get()

        const entries = snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || data.date,
                created_at: data.created_at?.toDate?.() || data.created_at,
            }
        })

        // Filter by date range if specified
        let filteredEntries = entries
        if (startDate) {
            const start = new Date(startDate)
            filteredEntries = filteredEntries.filter(e => new Date(e.date) >= start)
        }
        if (endDate) {
            const end = new Date(endDate)
            filteredEntries = filteredEntries.filter(e => new Date(e.date) <= end)
        }
        if (type) {
            filteredEntries = filteredEntries.filter((e: any) => e.type === type)
        }

        return NextResponse.json({
            success: true,
            entries: filteredEntries,
            count: filteredEntries.length,
        })
    } catch (error) {
        console.error("Error fetching journal entries:", error instanceof Error ? error.message : error)
        return createErrorResponse("Failed to fetch journal entries")
    }
}

/**
 * POST /api/journal-entries
 * Create a new journal entry
 */
export async function POST(request: NextRequest) {
    const auth = await requirePermission("journal-entries:create")
    if (!auth.authorized) return auth.response
    try {
        const body = await request.json()
        const { date, memo, reference, entries, type } = body

        if (!entries || !Array.isArray(entries) || entries.length < 2) {
            return createErrorResponse("At least 2 journal lines are required", 400)
        }

        const session = await getServerSession(authOptions)
        const userId = session?.user?.id || "system"

        const entryDate = date ? new Date(date) : new Date()
        const entryType = (type || "GENERAL") as JournalEntryType

        const lines = entries.map((e: any) => ({
            accountCode: e.account_id,
            accountName: e.account_name || "",
            debit: e.debit || 0,
            credit: e.credit || 0,
            description: e.description || "",
        }))

        const result = await EnhancedAccountingService.createJournalEntry(
            entryType,
            lines,
            reference || `ENTRY_${Date.now()}`,
            memo,
            userId,
            entryDate
        )

        if (!result.success) {
            return createErrorResponse(result.error || "Failed to create journal entry", 400)
        }

        const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0)
        const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0)

        return createSuccessResponse({
            message: "Journal entry created successfully",
            entryId: result.entryId,
            totalDebits,
            totalCredits,
        }, 201)

    } catch (error) {
        console.error("Error creating journal entry:", error)
        return createErrorResponse("Failed to create journal entry")
    }
}
