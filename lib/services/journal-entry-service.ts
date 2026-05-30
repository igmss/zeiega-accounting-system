import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { isDebitNormalBalance } from "../accounting/account-types"

export enum JournalEntryType {
    MATERIAL_RECEIPT = "MATERIAL_RECEIPT",
    MATERIAL_ISSUE_TO_WIP = "MATERIAL_ISSUE_TO_WIP",
    LABOR_APPLIED = "LABOR_APPLIED",
    OVERHEAD_APPLIED = "OVERHEAD_APPLIED",
    WIP_TO_FINISHED_GOODS = "WIP_TO_FINISHED_GOODS",
    WIP_OPENING = "WIP_OPENING",
    SALES_INVOICE = "SALES_INVOICE",
    SALES_COGS = "SALES_COGS",
    SALES_RETURN = "SALES_RETURN",
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
    PAYMENT_MADE = "PAYMENT_MADE",
    INVENTORY_ADJUSTMENT = "INVENTORY_ADJUSTMENT",
    PRIOR_PERIOD_ADJUSTMENT = "PRIOR_PERIOD_ADJUSTMENT",
    DEPRECIATION = "DEPRECIATION",
    GENERAL = "GENERAL",
    CLOSING_ENTRY = "CLOSING_ENTRY",
    TAX_PAYMENT = "TAX_PAYMENT",
    SCRAP_RECORD = "SCRAP_RECORD",
    REWORK_COSTS = "REWORK_COSTS",
    FX_ADJUSTMENT = "FX_ADJUSTMENT",
    INCOME_TAX_ACCRUAL = "INCOME_TAX_ACCRUAL",
    INVENTORY_WRITEDOWN = "INVENTORY_WRITEDOWN",
    RETENTION_INVOICE = "RETENTION_INVOICE",
    RETENTION_RELEASE = "RETENTION_RELEASE",
}

export interface JournalLine {
    accountCode: string
    accountName: string
    debit: number
    credit: number
    description: string
}

export class JournalEntryService {
    static async createJournalEntry(
        entryType: JournalEntryType,
        lines: JournalLine[],
        referenceDoc: string,
        notes?: string,
        userId: string = "00000000-0000-0000-0000-000000000000",
        customDate?: Date,
        _tx?: unknown,
        metadata?: Record<string, unknown>
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        try {
            const now = new Date()
            const entryDate = customDate || new Date()

            const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0)
            const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0)

            if (Math.abs(totalDebits - totalCredits) > 0.01) {
                return {
                    success: false,
                    error: `Journal entry not balanced: Debits=${totalDebits}, Credits=${totalCredits}`
                }
            }

            for (const line of lines) {
                if (line.debit > 0 && line.credit > 0) {
                    return {
                        success: false,
                        error: `Line cannot have both debit and credit: ${line.accountName}`
                    }
                }
                if (line.debit < 0 || line.credit < 0) {
                    return {
                        success: false,
                        error: `Negative amounts not allowed: ${line.accountName}`
                    }
                }
            }

            const entryYear = entryDate.getFullYear()
            const entryMonth = entryDate.getMonth() + 1
            const periodId = `FY-${entryYear}-${String(entryMonth).padStart(2, "0")}`

            const client = getServiceSupabase()
            const { data: period } = await client
                .from(TABLES.FISCAL_PERIODS)
                .select("status")
                .eq("id", periodId)
                .single()

            if (period && (period.status === "closed" || period.status === "locked")) {
                if (entryType !== JournalEntryType.CLOSING_ENTRY) {
                    return {
                        success: false,
                        error: `Cannot post to a closed or locked fiscal period: ${periodId}`
                    }
                }
            }

            const accountIds = Array.from(new Set(lines.map(l => l.accountCode)))
            const entryId = `JE-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

            const linesJson = lines.map(line => ({
                account_code: line.accountCode,
                account_name: line.accountName,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            }))

            const { data: entry, error: entryError } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .insert({
                    id: entryId,
                    date: entryDate.toISOString().split("T")[0],
                    type: entryType,
                    reference_id: referenceDoc,
                    reference_type: "sales_order",
                    description: notes || `Journal entry for ${referenceDoc}`,
                    account_ids: accountIds,
                    created_by: userId,
                    is_posted: true,
                })
                .select("id")
                .single()

            if (entryError) {
                console.error("Error inserting journal entry:", entryError)
                return { success: false, error: entryError.message }
            }

            const lineInserts = lines.map(line => ({
                journal_entry_id: entryId,
                account_code: line.accountCode,
                account_name: line.accountName,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            }))

            const { error: linesError } = await client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .insert(lineInserts)

            if (linesError) {
                console.error("Error inserting journal entry lines:", linesError)
                return { success: false, error: linesError.message }
            }

            for (const line of lines) {
                const { data: existing } = await client
                    .from(TABLES.ACCOUNT_BALANCES)
                    .select("total_debits, total_credits")
                    .eq("account_code", line.accountCode)
                    .maybeSingle()

                const newTotalDebits = (existing?.total_debits || 0) + line.debit
                const newTotalCredits = (existing?.total_credits || 0) + line.credit
                const isDebit = isDebitNormalBalance(line.accountCode)
                const balance = isDebit
                    ? newTotalDebits - newTotalCredits
                    : newTotalCredits - newTotalDebits

                const periodStart = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1).toISOString().split("T")[0]
                const periodEnd = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).toISOString().split("T")[0]

                await client
                    .from(TABLES.ACCOUNT_BALANCES)
                    .upsert({
                        account_code: line.accountCode,
                        period_start: periodStart,
                        period_end: periodEnd,
                        total_debits: newTotalDebits,
                        total_credits: newTotalCredits,
                        closing_balance: balance,
                    }, { onConflict: "account_code, period_end" })
            }

            return { success: true, entryId }

        } catch (error) {
            console.error("Error creating journal entry:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create journal entry"
            }
        }
    }

    static async voidJournalEntry(entryId: string, userId: string): Promise<{ success: boolean; voidEntryId?: string; error?: string }> {
        try {
            const client = getServiceSupabase()
            const { data: entry } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .select("*")
                .eq("id", entryId)
                .single()

            if (!entry) {
                return { success: false, error: "Journal entry not found" }
            }

            const { data: existingLines } = await client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .select("*")
                .eq("journal_entry_id", entryId)

            if (!existingLines?.length) {
                return { success: false, error: "Journal entry has no lines" }
            }

            const reversingLines: JournalLine[] = existingLines.map((line: any) => ({
                accountCode: line.account_code,
                accountName: line.account_name || "",
                debit: line.credit,
                credit: line.debit,
                description: `VOID: ${line.description || ""}`,
            }))

            const result = await this.createJournalEntry(
                entry.type as JournalEntryType,
                reversingLines,
                entryId,
                `Voided original entry: ${entryId}`,
                userId
            )

            if (result.success) {
                await client
                    .from(TABLES.JOURNAL_ENTRIES)
                    .update({
                        is_posted: false,
                    })
                    .eq("id", entryId)
            }

            return {
                success: result.success,
                voidEntryId: result.entryId,
                error: result.error
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to void entry"
            }
        }
    }
}
