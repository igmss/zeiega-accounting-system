import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import type { RetentionSchedule } from "../types"
import { EnhancedAccountingService, JournalEntryType } from "./enhanced-accounting-service"
import { formatCurrency } from "@/lib/utils"

export class RetentionService {
  private static readonly TABLE = TABLES.RETENTION_SCHEDULES

  static async createRetentionInvoice(
    contractId: string,
    invoiceId: string,
    customerId: string,
    totalInvoiceAmount: number,
    retentionPct: number,
    vatAmount: number = 0,
    revenueAccountCode: string = ACCOUNT_CODES.SALES_CUSTOM_MTO,
    expectedReleaseDate?: Date,
    userId: string = "system"
  ): Promise<{ success: boolean; scheduleId?: string; entryId?: string; error?: string }> {
    if (totalInvoiceAmount <= 0) return { success: false, error: "Invoice amount must be positive" }
    if (retentionPct < 0 || retentionPct >= 100) return { success: false, error: "Retention % must be 0–99" }

    const retentionAmount = Math.round(totalInvoiceAmount * (retentionPct / 100) * 100) / 100
    const billedAmount    = totalInvoiceAmount - retentionAmount

    interface JLine { accountCode: string; accountName: string; debit: number; credit: number; description: string }
    const lines: JLine[] = [
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
        debit: billedAmount + vatAmount,
        credit: 0,
        description: `Billed AR (net retention): Invoice ${invoiceId}`,
      },
      {
        accountCode: ACCOUNT_CODES.RETENTION_RECEIVABLE,
        accountName: getAccountName(ACCOUNT_CODES.RETENTION_RECEIVABLE),
        debit: retentionAmount,
        credit: 0,
        description: `${retentionPct}% retention withheld by customer`,
      },
      {
        accountCode: revenueAccountCode,
        accountName: getAccountName(revenueAccountCode),
        debit: 0,
        credit: totalInvoiceAmount,
        description: `Revenue: Invoice ${invoiceId} (total incl. retention)`,
      },
    ]

    if (vatAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.VAT_PAYABLE,
        accountName: getAccountName(ACCOUNT_CODES.VAT_PAYABLE),
        debit: 0,
        credit: vatAmount,
        description: `VAT on billed portion of Invoice ${invoiceId}`,
      })
    }

    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.RETENTION_INVOICE,
      lines,
      invoiceId,
      `Retention invoice: ${formatCurrency(totalInvoiceAmount)} total, ${retentionPct}% held (${formatCurrency(retentionAmount)})`,
      userId
    )

    if (!result.success) return result

    const scheduleId = `RET-${invoiceId}-${Date.now()}`
    const now = new Date().toISOString()
    const schedule: RetentionSchedule = {
      id: scheduleId,
      contractId,
      invoiceId,
      customerId,
      totalInvoiceAmount,
      retentionPercentage: retentionPct,
      retentionAmount,
      billedAmount,
      status: "withheld",
      expectedReleaseDate,
      created_at: now,
    }

    const { error } = await getServiceSupabase().from(this.TABLE).insert(schedule)
    if (error) throw error

    console.log(
      `✅ Retention invoice: ${formatCurrency(billedAmount)} billed, ` +
      `${formatCurrency(retentionAmount)} withheld (${retentionPct}%)`
    )
    return { success: true, scheduleId, entryId: result.entryId }
  }

  static async releaseRetention(
    scheduleId: string,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE).select("*").eq("id", scheduleId).single()
      if (error || !data) return { success: false, error: "Retention schedule not found" }

      const schedule = data as RetentionSchedule
      if (schedule.status === "released") {
        return { success: false, error: "Retention already released" }
      }

      const amount = schedule.retentionAmount
      interface JLine { accountCode: string; accountName: string; debit: number; credit: number; description: string }
      const lines: JLine[] = [
        {
          accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
          accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
          debit: amount,
          credit: 0,
          description: `Retention released: ${scheduleId}`,
        },
        {
          accountCode: ACCOUNT_CODES.RETENTION_RECEIVABLE,
          accountName: getAccountName(ACCOUNT_CODES.RETENTION_RECEIVABLE),
          debit: 0,
          credit: amount,
          description: `Release retention withheld on Invoice ${schedule.invoiceId}`,
        },
      ]

      const result = await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.RETENTION_RELEASE,
        lines,
        scheduleId,
        `Retention release: EGP ${amount} from Invoice ${schedule.invoiceId}`,
        userId
      )

      if (!result.success) return result

      const { error: updErr } = await getServiceSupabase().from(this.TABLE).update({
        status: "released",
        actualReleaseDate: new Date().toISOString(),
        releaseJournalEntryId: result.entryId,
      }).eq("id", scheduleId)
      if (updErr) throw updErr

      console.log(`✅ Retention released: EGP ${amount} (Schedule ${scheduleId})`)
      return { success: true, entryId: result.entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to release retention",
      }
    }
  }

  static async getOutstandingRetentions(): Promise<RetentionSchedule[]> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("status", "withheld")
      if (error) throw error
      return (data || []) as RetentionSchedule[]
    } catch {
      return []
    }
  }

  static async getTotalRetentionBalance(): Promise<number> {
    const schedules = await this.getOutstandingRetentions()
    return schedules.reduce((sum, s) => sum + s.retentionAmount, 0)
  }

  static async getRetentionsDueForRelease(daysAhead: number = 30): Promise<RetentionSchedule[]> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)
    const outstanding = await this.getOutstandingRetentions()
    return outstanding.filter(
      s => s.expectedReleaseDate && new Date(s.expectedReleaseDate) <= cutoff
    )
  }
}
