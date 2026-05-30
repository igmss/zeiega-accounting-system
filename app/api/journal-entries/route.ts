import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
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

        let query = getServiceClient()
            .from(TABLES.JOURNAL_ENTRIES)
            .select("*")
            .order("date", { ascending: false })

        if (startDate) {
            query = query.gte("date", startDate)
        }
        if (endDate) {
            query = query.lte("date", endDate)
        }
        if (type) {
            query = query.eq("type", type)
        }

        const { data, error } = await query.limit(limit)

        if (error) throw error

        const entries = (data || []).map((doc: Record<string, any>) => {
            return {
                id: doc.id,
                ...doc,
                date: doc.date || null,
                created_at: doc.created_at || null,
            }
        })

        return NextResponse.json({
            success: true,
            entries,
            count: entries.length,
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
