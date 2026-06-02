import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { isDebitNormalBalance, CHART_OF_ACCOUNTS } from "../accounting/account-types"

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
    ASSET_PURCHASE = "ASSET_PURCHASE",
    LIABILITY_INCURRED = "LIABILITY_INCURRED",
    LIABILITY_REPAYMENT = "LIABILITY_REPAYMENT",
    OPENING_BALANCE = "OPENING_BALANCE",
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
        userId: string | null = null,
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
            // BUG-14: Validate all account codes exist in Chart of Accounts
            for (const line of lines) {
                if (!CHART_OF_ACCOUNTS[line.accountCode]) {
                    return {
                        success: false,
                        error: `Invalid account code: ${line.accountCode} (${line.accountName}) — not found in Chart of Accounts`
                    }
                }
            }

            // BUG-17: Use maybeSingle() so missing periods don't throw (treat as open)
            const { data: period } = await client
                .from(TABLES.FISCAL_PERIODS)
                .select("status")
                .eq("id", periodId)
                .maybeSingle()

            if (period && (period.status === "closed" || period.status === "locked")) {
                if (entryType !== JournalEntryType.CLOSING_ENTRY) {
                    return {
                        success: false,
                        error: `Cannot post to a closed or locked fiscal period: ${periodId}`
                    }
                }
            }

            const accountIds = Array.from(new Set(lines.map(l => l.accountCode)))
            const entryNumber = `JE-${entryDate.getFullYear()}${String(entryDate.getMonth() + 1).padStart(2, "0")}${String(entryDate.getDate()).padStart(2, "0")}-${crypto.randomUUID().substring(0, 8)}`

            const { data: entry, error: entryError } = await client
                .from(TABLES.JOURNAL_ENTRIES)
                .insert({
                    entry_number: entryNumber,
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
                journal_entry_id: entry.id,
                account_code: line.accountCode,
                account_name: line.accountName,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            }))

            const { data: insertedLines, error: linesError } = await client
                .from(TABLES.JOURNAL_ENTRY_LINES)
                .insert(lineInserts)
                .select("*")

            if (linesError) {
                console.error("Error inserting journal entry lines:", linesError)
                return { success: false, error: linesError.message }
            }

            console.log(`Inserted ${(insertedLines || []).length} journal entry lines for ${entry.id}`)

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

            return { success: true, entryId: entry.id }

        } catch (error) {
            console.error("Error creating journal entry:", error)
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create journal entry"
            }
        }
    }

    static async voidJournalEntry(entryId: string, userId: string | null): Promise<{ success: boolean; voidEntryId?: string; error?: string }> {
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

                // BUG-16: Update account balance cache for the voided entry's lines.
                // The reversing entry already updated balances in createJournalEntry above,
                // but we must also reverse the original entry's line contributions.
                const entryDate = (entry as any).date ? new Date((entry as any).date) : new Date()
                for (const line of existingLines) {
                    const l = line as any
                    const { data: currentBal } = await client
                        .from(TABLES.ACCOUNT_BALANCES)
                        .select("total_debits, total_credits")
                        .eq("account_code", l.account_code)
                        .maybeSingle()

                    const revDebits = (currentBal?.total_debits || 0) - (l.debit || 0) + (l.credit || 0)
                    const revCredits = (currentBal?.total_credits || 0) - (l.credit || 0) + (l.debit || 0)
                    const isDebit = isDebitNormalBalance(l.account_code)
                    const balance = isDebit ? revDebits - revCredits : revCredits - revDebits

                    const periodStart = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1).toISOString().split("T")[0]
                    const periodEnd = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).toISOString().split("T")[0]

                    await client.from(TABLES.ACCOUNT_BALANCES).upsert({
                        account_code: l.account_code,
                        period_start: periodStart,
                        period_end: periodEnd,
                        total_debits: revDebits,
                        total_credits: revCredits,
                        closing_balance: balance,
                    }, { onConflict: "account_code, period_end" })
                }
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
