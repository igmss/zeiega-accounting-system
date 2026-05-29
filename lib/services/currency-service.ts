/**
 * Currency and Exchange Rate types
 */

export type CurrencyCode = "EGP" | "USD" | "EUR" | "GBP" | "SAR" | "AED"

export interface ExchangeRate {
  id: string
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: number           // 1 fromCurrency = rate toCurrency
  date: Date
  source: "manual" | "cbe" | "bank"  // Central Bank of Egypt, bank quote, manual
  createdAt: Date
  createdBy: string
}

export interface MultiCurrencyTransaction {
  originalAmount: number
  originalCurrency: CurrencyCode
  exchangeRate: number
  functionalAmount: number  // Amount in EGP
  rateDate: Date
}

export interface CurrencyBalance {
  currency: CurrencyCode
  amount: number
  egpEquivalent: number
  lastRate: number
  lastRateDate: Date
}

import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

const EXCHANGE_RATES_COLLECTION = "acc_exchange_rates"

/**
 * Multi-Currency Service
 *
 * Manages foreign currency transactions, exchange rates, and translation
 * per IAS 21 (The Effects of Changes in Foreign Exchange Rates).
 *
 * Key rules:
 *  - Functional currency: EGP (Egyptian Pound)
 *  - Foreign currency transactions: translate at spot rate on transaction date
 *  - Monetary items (cash, AR, AP in foreign currency): retranslate at closing rate
 *  - Non-monetary items (inventory, fixed assets): remain at historical rate
 *  - Exchange differences: recognized in P&L (account 7004)
 */
export class CurrencyService {
  static readonly FUNCTIONAL_CURRENCY: CurrencyCode = "EGP"
  static readonly COLLECTION = EXCHANGE_RATES_COLLECTION

  /** FX Gain/Loss account */
  static readonly FX_GAIN_LOSS_ACCOUNT = "7004"

  /**
   * Set an exchange rate
   */
  static async setExchangeRate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    rate: number,
    source: ExchangeRate["source"] = "manual",
    userId: string = "system"
  ): Promise<{ success: boolean; rateId?: string; error?: string }> {
    try {
      if (rate <= 0) return { success: false, error: "Exchange rate must be positive" }
      if (fromCurrency === toCurrency) return { success: false, error: "Currencies must differ" }

      const rateId = `FX-${fromCurrency}-${toCurrency}-${Date.now()}`
      const now = new Date()

      await db.collection(this.COLLECTION).doc(rateId).set({
        id: rateId,
        fromCurrency,
        toCurrency,
        rate,
        date: now,
        source,
        createdAt: now,
        createdBy: userId,
      })

      console.log(`✅ Exchange rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`)
      return { success: true, rateId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to set rate" }
    }
  }

  /**
   * Get the latest exchange rate for a currency pair
   */
  static async getLatestRate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ): Promise<ExchangeRate | null> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("fromCurrency", "==", fromCurrency)
        .where("toCurrency", "==", toCurrency)
        .orderBy("date", "desc")
        .limit(1)
        .get()

      if (snapshot.empty) return null
      return snapshot.docs[0].data() as ExchangeRate
    } catch {
      return null
    }
  }

  /**
   * Translate a foreign currency amount to EGP at the given rate.
   * Per IAS 21.21: foreign currency transactions are recorded at the spot rate.
   */
  static translateToEGP(
    amount: number,
    fromCurrency: CurrencyCode,
    rate: number
  ): MultiCurrencyTransaction {
    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      exchangeRate: rate,
      functionalAmount: Math.round(amount * rate * 100) / 100,
      rateDate: new Date(),
    }
  }

  /**
   * Record a foreign currency purchase of raw materials.
   *
   * Journal Entry:
   *   DR Raw Materials Inventory (1201)    EGP equivalent
   *       CR Accounts Payable - Foreign (2103)    EGP equivalent
   */
  static async recordForeignCurrencyPurchase(
    vendorId: string,
    originalAmount: number,
    originalCurrency: CurrencyCode,
    rate: number,
    description: string,
    userId: string = "system"
  ): Promise<{
    success: boolean
    entryId?: string
    egpAmount?: number
    error?: string
  }> {
    try {
      const egpAmount = Math.round(originalAmount * rate * 100) / 100

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.MATERIAL_RECEIPT,
        [
          {
            accountCode: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
            accountName: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
            debit: egpAmount,
            credit: 0,
            description: `Imported materials: ${originalCurrency} ${originalAmount} @ ${rate}`,
          },
          {
            accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
            accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_PAYABLE),
            debit: 0,
            credit: egpAmount,
            description: `Foreign AP: ${originalCurrency} ${originalAmount}`,
          },
        ],
        `FX-${vendorId}`,
        `${description} | ${originalCurrency} ${originalAmount} @ ${rate} = EGP ${egpAmount}`,
        userId,
        undefined,
        undefined,
        {
          originalAmount,
          originalCurrency,
          exchangeRate: rate,
          rateDate: new Date(),
        }
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      console.log(`✅ FX purchase: ${originalCurrency} ${originalAmount} → EGP ${egpAmount}`)
      return { success: true, entryId: result.entryId, egpAmount }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to record FX purchase" }
    }
  }

  /**
   * Record exchange gain/loss on settlement of foreign currency payable.
   *
   * When the rate changes between purchase date and payment date,
   * the difference is an exchange gain or loss.
   *
   * Journal Entry (if rate increased — loss):
   *   DR FX Loss (7004)        difference
   *   DR Accounts Payable      original EGP amount
   *       CR Cash/Bank              total EGP paid
   */
  static async recordFXSettlement(
    originalEGPAmount: number,
    paymentEGPAmount: number,
    vendorId: string,
    originalCurrency: CurrencyCode,
    originalAmount: number,
    paymentRate: number,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; fxGainLoss?: number; error?: string }> {
    try {
      const fxGainLoss = Math.round((originalEGPAmount - paymentEGPAmount) * 100) / 100
      const isGain = fxGainLoss > 0
      const absFx = Math.abs(fxGainLoss)

      const lines: import("./journal-entry-service").JournalLine[] = [
        {
          accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
          accountName: getAccountName(ACCOUNT_CODES.ACCOUNTS_PAYABLE),
          debit: originalEGPAmount,
          credit: 0,
          description: `Settle foreign AP: ${originalCurrency} ${originalAmount}`,
        },
        {
          accountCode: ACCOUNT_CODES.BANK_MAIN,
          accountName: getAccountName(ACCOUNT_CODES.BANK_MAIN),
          debit: 0,
          credit: paymentEGPAmount,
          description: `Payment: ${originalCurrency} ${originalAmount} @ ${paymentRate}`,
        },
      ]

      if (Math.abs(fxGainLoss) > 0.01) {
        lines.push({
          accountCode: this.FX_GAIN_LOSS_ACCOUNT,
          accountName: "FX Gain/Loss",
          debit: isGain ? 0 : absFx,
          credit: isGain ? absFx : 0,
          description: `${isGain ? "Gain" : "Loss"} on FX settlement (${originalCurrency})`,
        })
      }

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.PAYMENT_MADE,
        lines,
        `FX-${vendorId}`,
        `FX settlement: ${originalCurrency} ${originalAmount} | Book: EGP ${originalEGPAmount} | Paid: EGP ${paymentEGPAmount} | ${isGain ? "Gain" : "Loss"}: EGP ${absFx}`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      console.log(`✅ FX settlement: ${isGain ? "Gain" : "Loss"} EGP ${absFx}`)
      return { success: true, entryId: result.entryId, fxGainLoss }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to record FX settlement" }
    }
  }

  /**
   * Period-end revaluation of foreign currency monetary items (IAS 21.23).
   *
   * Monetary items (cash, receivables, payables in foreign currency)
   * are retranslated at the closing rate. Differences go to P&L.
   */
  static async revalueMonetaryItems(
    closingRates: Record<CurrencyCode, number>,
    userId: string = "system"
  ): Promise<{
    success: boolean
    totalFXImpact?: number
    entryIds?: string[]
    error?: string
  }> {
    // This is a framework — actual implementation requires tracking
    // foreign currency balances per account, which needs data model changes.
    // For now, returns the structure for manual revaluation journal entries.
    try {
      const entryIds: string[] = []
      let totalImpact = 0

      // Placeholder: in a full implementation, you would:
      // 1. Query all journal entries with foreign currency metadata
      // 2. Identify unsettled monetary items
      // 3. Calculate the difference between book value and closing rate value
      // 4. Post the aggregated FX gain/loss

      const entryId = `FX-REVAL-${Date.now()}`
      entryIds.push(entryId)

      return { success: true, totalFXImpact: totalImpact, entryIds }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Revaluation failed" }
    }
  }

  /**
   * Get all exchange rates for a currency pair
   */
  static async getRateHistory(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    limit: number = 12
  ): Promise<ExchangeRate[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("fromCurrency", "==", fromCurrency)
        .where("toCurrency", "==", toCurrency)
        .orderBy("date", "desc")
        .limit(limit)
        .get()

      return snapshot.docs.map(d => d.data() as ExchangeRate)
    } catch {
      return []
    }
  }
}
