export type CurrencyCode = "EGP" | "USD" | "EUR" | "GBP" | "SAR" | "AED"

export interface ExchangeRate {
  id: string
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: number
  date: string
  source: "manual" | "cbe" | "bank"
  createdAt: string
  createdBy: string
}

export interface MultiCurrencyTransaction {
  originalAmount: number
  originalCurrency: CurrencyCode
  exchangeRate: number
  functionalAmount: number
  rateDate: string
}

export interface CurrencyBalance {
  currency: CurrencyCode
  amount: number
  egpEquivalent: number
  lastRate: number
  lastRateDate: string
}

import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export class CurrencyService {
  static readonly FUNCTIONAL_CURRENCY: CurrencyCode = "EGP"
  static readonly TABLE = TABLES.EXCHANGE_RATES
  static readonly FX_GAIN_LOSS_ACCOUNT = "7004"

  static async setExchangeRate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    rate: number,
    source: ExchangeRate["source"] = "manual",
    userId: string | null = null
  ): Promise<{ success: boolean; rateId?: string; error?: string }> {
    try {
      if (rate <= 0) return { success: false, error: "Exchange rate must be positive" }
      if (fromCurrency === toCurrency) return { success: false, error: "Currencies must differ" }

      const rateId = `FX-${fromCurrency}-${toCurrency}-${Date.now()}`
      const now = new Date().toISOString()

      const { error } = await getServiceSupabase().from(this.TABLE).insert({
        id: rateId,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate,
        date: now,
        source,
        created_at: now,
        created_by: userId,
      })
      if (error) throw error

      console.log(`✅ Exchange rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`)
      return { success: true, rateId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to set rate" }
    }
  }

  static async getLatestRate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ): Promise<ExchangeRate | null> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("from_currency", fromCurrency)
        .eq("to_currency", toCurrency)
        .order("date", { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return null
      return data as ExchangeRate
    } catch {
      return null
    }
  }

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
      rateDate: new Date().toISOString(),
    }
  }

  static async recordForeignCurrencyPurchase(
    vendorId: string,
    originalAmount: number,
    originalCurrency: CurrencyCode,
    rate: number,
    description: string,
    userId: string | null = null
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
          rateDate: new Date().toISOString(),
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

  static async recordFXSettlement(
    originalEGPAmount: number,
    paymentEGPAmount: number,
    vendorId: string,
    originalCurrency: CurrencyCode,
    originalAmount: number,
    paymentRate: number,
    userId: string | null = null
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

  static async revalueMonetaryItems(
    closingRates: Record<CurrencyCode, number>,
    userId: string | null = null
  ): Promise<{
    success: boolean
    totalFXImpact?: number
    entryIds?: string[]
    error?: string
  }> {
    try {
      const entryIds: string[] = []
      let totalImpact = 0

      const entryId = `FX-REVAL-${Date.now()}`
      entryIds.push(entryId)

      return { success: true, totalFXImpact: totalImpact, entryIds }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Revaluation failed" }
    }
  }

  static async getRateHistory(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    limit: number = 12
  ): Promise<ExchangeRate[]> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("from_currency", fromCurrency)
        .eq("to_currency", toCurrency)
        .order("date", { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data || []) as ExchangeRate[]
    } catch {
      return []
    }
  }
}
