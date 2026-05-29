import { db, COLLECTIONS } from "../firebase"
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
        userId: string = "system",
        customDate?: Date,
        tx?: FirebaseFirestore.Transaction,
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
            const periodRef = db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId)
            const periodDoc = tx ? await tx.get(periodRef) : await periodRef.get()

            let isClosed = false
            let periodName = "Unknown"

            if (periodDoc.exists) {
                const period = periodDoc.data()!
                periodName = periodDoc.id
                if (period.status === "closed" || period.status === "locked") {
                    isClosed = true
                }
            }

            if (isClosed && entryType !== JournalEntryType.CLOSING_ENTRY) {
                return {
                    success: false,
                    error: `Cannot post to a closed or locked fiscal period: ${periodName}`
                }
            }

            const entryId = `JE-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

            const accountIds = Array.from(new Set(lines.map(l => l.accountCode)))

            const balanceSnapshots: Map<string, FirebaseFirestore.DocumentSnapshot> = new Map()
            for (const accountCode of accountIds) {
                const balRef = db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(accountCode)
                const balDoc = tx ? await tx.get(balRef) : await balRef.get()
                balanceSnapshots.set(accountCode, balDoc)
            }

            const journalEntry: Record<string, unknown> = {
                id: entryId,
                date: entryDate,
                type: entryType,
                reference_doc: referenceDoc,
                description: notes || `Journal entry for ${referenceDoc}`,
                entries: lines.map(line => ({
                    account_id: line.accountCode,
                    account_name: line.accountName,
                    debit: line.debit,
                    credit: line.credit,
                    description: line.description,
                })),
                account_ids: accountIds,
                total_debits: totalDebits,
                total_credits: totalCredits,
                created_at: now,
                created_by: userId,
            }

            if (metadata) {
                journalEntry.metadata = metadata
            }

            const jeRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId)
            if (tx) {
                tx.set(jeRef, journalEntry)
            } else {
                await jeRef.set(journalEntry)
            }

            for (const line of lines) {
                const balDoc = balanceSnapshots.get(line.accountCode)
                const existing = balDoc?.exists ? balDoc.data()! : { totalDebits: 0, totalCredits: 0 }
                const newTotalDebits = (existing.totalDebits || 0) + line.debit
                const newTotalCredits = (existing.totalCredits || 0) + line.credit
                const isDebit = isDebitNormalBalance(line.accountCode)
                const balance = isDebit
                    ? newTotalDebits - newTotalCredits
                    : newTotalCredits - newTotalDebits

                const balanceData = {
                    accountCode: line.accountCode,
                    totalDebits: newTotalDebits,
                    totalCredits: newTotalCredits,
                    balance,
                    lastEntryId: entryId,
                    updatedAt: now,
                }

                const balRef = db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(line.accountCode)
                if (tx) {
                    tx.set(balRef, balanceData)
                } else {
                    await balRef.set(balanceData)
                }
            }

            console.log(`✅ Journal entry ${entryId} created: ${entryType}`)
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
            const entryRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId)
            const entryDoc = await entryRef.get()
            
            if (!entryDoc.exists) {
                return { success: false, error: "Journal entry not found" }
            }
            
            const entryData = entryDoc.data()
            if (entryData?.voided) {
                return { success: false, error: "Journal entry is already voided" }
            }
            
            const reversingLines: JournalLine[] = entryData?.entries.map((line: any) => ({
                accountCode: line.account_id,
                accountName: line.account_name,
                debit: line.credit,
                credit: line.debit,
                description: `VOID: ${line.description}`,
            }))
            
            const result = await this.createJournalEntry(
                entryData?.type as JournalEntryType,
                reversingLines,
                entryId,
                `Voided original entry: ${entryId}`,
                userId
            )
            
            if (result.success) {
                await entryRef.update({
                    voided: true,
                    voided_at: new Date(),
                    voided_by: userId,
                    reversing_entry_id: result.entryId
                })
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
