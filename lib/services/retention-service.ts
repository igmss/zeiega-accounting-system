/**
 * Retention Service — Customer Holdback Accounting
 *
 * Handles the common MTO/garment pattern where customers withhold a percentage
 * (typically 5–10%) of each invoice until final delivery / quality sign-off.
 *
 * Accounting treatment:
 *
 *   On invoice with retention:
 *     DR  Accounts Receivable (1110)        billedAmount    (net of retention)
 *     DR  Retention Receivable (1116)       retentionAmount
 *         CR  Revenue (4003)                        totalInvoiceAmount
 *         CR  VAT Payable (2110)                    vatAmount  [if applicable]
 *
 *   On retention release (sign-off):
 *     DR  Accounts Receivable (1110)        retentionAmount
 *         CR  Retention Receivable (1116)           retentionAmount
 */

import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import type { RetentionSchedule } from "../types"
import { EnhancedAccountingService, JournalEntryType } from "./enhanced-accounting-service"

export class RetentionService {
  private static readonly COLLECTION = COLLECTIONS.RETENTION_SCHEDULES

  /**
   * Create an invoice with a retention split.
   * Records the journal entry and persists the RetentionSchedule document.
   *
   * @param contractId         Contract this invoice belongs to
   * @param invoiceId          Invoice reference number
   * @param customerId         Customer ID
   * @param totalInvoiceAmount Total gross amount (EGP) before VAT
   * @param retentionPct       Retention percentage (e.g. 10 for 10%)
   * @param vatAmount          VAT on the billed (non-retention) portion
   * @param revenueAccountCode Revenue account to credit (default: 4003 Custom MTO)
   * @param expectedReleaseDate When retention is expected to be released
   */
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

    // Journal entry lines
    interface JLine { accountCode: string; accountName: string; debit: number; credit: number; description: string }
    const lines: JLine[] = [
      // Billed AR (net of retention)
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
        debit: billedAmount + vatAmount,
        credit: 0,
        description: `Billed AR (net retention): Invoice ${invoiceId}`,
      },
      // Retention receivable
      {
        accountCode: ACCOUNT_CODES.RETENTION_RECEIVABLE, // 1116
        accountName: getAccountName(ACCOUNT_CODES.RETENTION_RECEIVABLE),
        debit: retentionAmount,
        credit: 0,
        description: `${retentionPct}% retention withheld by customer`,
      },
      // Revenue credit
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
        accountCode: ACCOUNT_CODES.VAT_PAYABLE, // 2110
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
      `Retention invoice: EGP ${totalInvoiceAmount} total, ${retentionPct}% held (EGP ${retentionAmount})`,
      userId
    )

    if (!result.success) return result

    // Persist retention schedule
    const scheduleId = `RET-${invoiceId}-${Date.now()}`
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
      created_at: new Date(),
    }

    await db.collection(this.COLLECTION).doc(scheduleId).set(schedule)

    console.log(
      `✅ Retention invoice: EGP ${billedAmount} billed, ` +
      `EGP ${retentionAmount} withheld (${retentionPct}%)`
    )
    return { success: true, scheduleId, entryId: result.entryId }
  }

  /**
   * Release a retention when the customer signs off on delivery.
   *
   * DR  Accounts Receivable (1110)        retentionAmount
   *     CR  Retention Receivable (1116)           retentionAmount
   */
  static async releaseRetention(
    scheduleId: string,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const doc = await db.collection(this.COLLECTION).doc(scheduleId).get()
      if (!doc.exists) return { success: false, error: "Retention schedule not found" }

      const schedule = doc.data() as RetentionSchedule
      if (schedule.status === "released") {
        return { success: false, error: "Retention already released" }
      }

      const amount = schedule.retentionAmount
      interface JLine { accountCode: string; accountName: string; debit: number; credit: number; description: string }
      const lines: JLine[] = [
        {
          accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, // 1110
          accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
          debit: amount,
          credit: 0,
          description: `Retention released: ${scheduleId}`,
        },
        {
          accountCode: ACCOUNT_CODES.RETENTION_RECEIVABLE, // 1116
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

      // Update schedule status
      await doc.ref.update({
        status: "released",
        actualReleaseDate: new Date(),
        releaseJournalEntryId: result.entryId,
      })

      console.log(`✅ Retention released: EGP ${amount} (Schedule ${scheduleId})`)
      return { success: true, entryId: result.entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to release retention",
      }
    }
  }

  /**
   * Get all outstanding (withheld) retentions.
   * Used for cash flow forecasting and DSO analysis.
   */
  static async getOutstandingRetentions(): Promise<RetentionSchedule[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("status", "==", "withheld")
        .get()
      return snapshot.docs.map(d => d.data() as RetentionSchedule)
    } catch {
      return []
    }
  }

  /**
   * Get total outstanding retention balance (EGP).
   */
  static async getTotalRetentionBalance(): Promise<number> {
    const schedules = await this.getOutstandingRetentions()
    return schedules.reduce((sum, s) => sum + s.retentionAmount, 0)
  }

  /**
   * Get retentions due for release within the next N days.
   */
  static async getRetentionsDueForRelease(daysAhead: number = 30): Promise<RetentionSchedule[]> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)
    const outstanding = await this.getOutstandingRetentions()
    return outstanding.filter(
      s => s.expectedReleaseDate && s.expectedReleaseDate <= cutoff
    )
  }
}
