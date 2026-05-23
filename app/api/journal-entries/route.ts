import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { db, COLLECTIONS } from "@/lib/firebase"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { FiscalPeriodService } from "@/lib/services/fiscal-period-service"
import { authOptions } from "@/lib/auth/auth-options"

/**
 * GET /api/journal-entries
 * Get all journal entries with optional filtering
 */
export async function GET(request: NextRequest) {
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

        return createSuccessResponse({
            entries: filteredEntries,
            count: filteredEntries.length,
        })
    } catch (error) {
        return createErrorResponse(
            error instanceof Error ? error.message : "Failed to fetch journal entries"
        )
    }
}

/**
 * POST /api/journal-entries
 * Create a new journal entry
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { date, memo, reference, entries, type } = body

        // Validate required fields
        if (!entries || !Array.isArray(entries) || entries.length < 2) {
            return createErrorResponse("At least 2 journal lines are required", 400)
        }

        // Validate balanced entry
        const totalDebits = entries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0)
        const totalCredits = entries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0)

        if (Math.abs(totalDebits - totalCredits) > 0.01) {
            return createErrorResponse(
                `Journal entry must be balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`,
                400
            )
        }

        // Validate each line has account and amount
        for (const entry of entries) {
            if (!entry.account_id) {
                return createErrorResponse("Each line must have an account selected", 400)
            }
            if (entry.debit === 0 && entry.credit === 0) {
                return createErrorResponse("Each line must have a debit or credit amount", 400)
            }
            if (entry.debit > 0 && entry.credit > 0) {
                return createErrorResponse("A line cannot have both debit and credit", 400)
            }
        }

        // Validate fiscal period is open
        const entryDate = date ? new Date(date) : new Date()
        const periodValidation = await FiscalPeriodService.validatePostingDate(entryDate)

        // Allow posting even if no fiscal period exists (auto-initialize)
        if (!periodValidation.valid && periodValidation.error !== "No fiscal period found for this date") {
            return createErrorResponse(periodValidation.error || "Cannot post to closed period", 400)
        }

        // Extract unique account IDs for indexing (CRITICAL-FIX: was missing, broke trial balance)
        const accountIds = Array.from(new Set(entries.map((e: any) => e.account_id)))

        // Get authenticated user for audit trail
        const session = await getServerSession(authOptions)
        const userId = session?.user?.id || "system"
        const userName = session?.user?.name || session?.user?.email || "system"

        // Generate journal entry ID
        const entryId = `JE-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`

        // Create journal entry document
        const journalEntry = {
            id: entryId,
            type: type || "GENERAL",
            date: entryDate,
            memo: memo || "",
            reference: reference || null,
            entries: entries.map((e: any) => ({
                account_id: e.account_id,
                account_name: e.account_name || "",
                description: e.description || "",
                debit: e.debit || 0,
                credit: e.credit || 0,
            })),
            account_ids: accountIds,
            total_debits: totalDebits,
            total_credits: totalCredits,
            status: "posted",
            created_at: new Date(),
            created_by: userId,
            created_by_name: userName,
        }

        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

        console.log(`✅ Journal entry ${entryId} created`)

        return createSuccessResponse({
            message: "Journal entry created successfully",
            entryId,
            totalDebits,
            totalCredits,
        }, 201)

    } catch (error) {
        console.error("Error creating journal entry:", error)
        return createErrorResponse(
            error instanceof Error ? error.message : "Failed to create journal entry"
        )
    }
}
