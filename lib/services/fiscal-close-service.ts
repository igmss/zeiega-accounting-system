import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName, AccountType, getAccountsByType } from "../accounting/account-types"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

/**
 * Fiscal Year-End Close Service
 *
 * Performs the year-end accounting close:
 *   1. Close all revenue accounts (4xxx) to Current Year P/L (3200)
 *   2. Close all COGS accounts (5xxx) to Current Year P/L (3200)
 *   3. Close all expense accounts (6xxx) to Current Year P/L (3200)
 *   4. Close other income/expense (7xxx) to Current Year P/L (3200)
 *   5. Close Current Year P/L (3200) to Retained Earnings (3100)
 *   6. Close drawings accounts (3021-3023) to partner capital (3011-3013)
 *   7. Mark fiscal period as closed
 */
export class FiscalCloseService {

  /**
   * Execute full year-end close for a fiscal year
   */
  static async executeYearEndClose(
    fiscalYear: number,
    userId: string = "system"
  ): Promise<{
    success: boolean
    netIncome?: number
    entryIds?: string[]
    error?: string
  }> {
    try {
      const startDate = new Date(fiscalYear, 0, 1)
      const endDate = new Date(fiscalYear, 11, 31, 23, 59, 59)
      const now = new Date()
      const entryIds: string[] = []

      // Step 1: Get balances for all temporary accounts
      const revenueAccounts = getAccountsByType(AccountType.REVENUE)
      const contraRevenueAccounts = getAccountsByType(AccountType.CONTRA_REVENUE)
      const cogsAccounts = getAccountsByType(AccountType.COGS)
      const expenseAccounts = getAccountsByType(AccountType.EXPENSE)
      const otherAccounts = getAccountsByType(AccountType.OTHER)

      // Helper to get balance for period
      const getBal = async (code: string) => {
        const snap = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
          .where("account_ids", "array-contains", code)
          .where("date", "<=", endDate)
          .get()
        let d = 0, c = 0
        for (const doc of snap.docs) {
          for (const line of doc.data().entries || []) {
            if (line.account_id === code) { d += line.debit || 0; c += line.credit || 0 }
          }
        }
        return c - d  // Positive = credit balance (revenue/contra normally credit)
      }

      const recordCloseEntry = async (
        idPrefix: string,
        description: string,
        lines: { account_id: string; account_name: string; debit: number; credit: number; description: string }[]
      ): Promise<void> => {
        const result = await JournalEntryService.createJournalEntry(
          JournalEntryType.CLOSING_ENTRY,
          lines.map(l => ({
            accountCode: l.account_id,
            accountName: l.account_name,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
          `FY${fiscalYear}-CLOSE`,
          description,
          userId,
          endDate
        )
        if (result.success && result.entryId) {
          entryIds.push(result.entryId)
        }
      }

      // Step 2: Close Revenue to P&L
      let totalRevenue = 0
      const closeRevenueLines: any[] = []
      for (const acct of revenueAccounts) {
        const bal = await getBal(acct.code)
        if (Math.abs(bal) > 0.01) {
          closeRevenueLines.push({
            account_id: acct.code,
            account_name: acct.name,
            debit: bal > 0 ? bal : 0,
            credit: bal < 0 ? Math.abs(bal) : 0,
            description: `Close ${acct.name} to P&L`,
          })
          totalRevenue += bal
        }
      }
      for (const acct of contraRevenueAccounts) {
        const bal = await getBal(acct.code)
        if (Math.abs(bal) > 0.01) {
          closeRevenueLines.push({
            account_id: acct.code,
            account_name: acct.name,
            debit: bal < 0 ? Math.abs(bal) : 0,
            credit: bal > 0 ? bal : 0,
            description: `Close ${acct.name} to P&L`,
          })
          totalRevenue -= Math.abs(bal)
        }
      }

      // Net revenue → CR P&L
      if (totalRevenue > 0) {
        closeRevenueLines.push({
          account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
          account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
          debit: 0,
          credit: totalRevenue,
          description: `Total revenue for FY${fiscalYear}`,
        })
      } else if (totalRevenue < 0) {
        closeRevenueLines.push({
          account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
          account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
          debit: Math.abs(totalRevenue),
          credit: 0,
          description: `Net revenue (negative) for FY${fiscalYear}`,
        })
      }

      if (closeRevenueLines.length > 0) {
        await recordCloseEntry(
          `CLOSE-REV-${fiscalYear}`,
          `Close revenue accounts to P&L for FY${fiscalYear}`,
          closeRevenueLines
        )
      }

      // Step 3: Close COGS to P&L
      let totalCOGS = 0
      const closeCOGSLines: any[] = []
      for (const acct of cogsAccounts) {
        const bal = await getBal(acct.code)
        if (Math.abs(bal) > 0.01) {
          closeCOGSLines.push({
            account_id: acct.code,
            account_name: acct.name,
            debit: bal < 0 ? Math.abs(bal) : 0,
            credit: bal > 0 ? bal : 0,
            description: `Close ${acct.name} to P&L`,
          })
          totalCOGS += bal  // COGS normally debit, so bal = -netDebit
        }
      }
      // totalCOGS is negative (expense), so DR P&L
      if (Math.abs(totalCOGS) > 0.01) {
        closeCOGSLines.push({
          account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
          account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
          debit: Math.abs(totalCOGS),
          credit: 0,
          description: `Total COGS for FY${fiscalYear}`,
        })
      }

      if (closeCOGSLines.length > 0) {
        await recordCloseEntry(
          `CLOSE-COGS-${fiscalYear}`,
          `Close COGS accounts to P&L for FY${fiscalYear}`,
          closeCOGSLines
        )
      }

      // Step 4: Close Expenses to P&L
      let totalExpenses = 0
      const closeExpLines: any[] = []
      for (const acct of expenseAccounts) {
        const bal = await getBal(acct.code)
        if (Math.abs(bal) > 0.01) {
          closeExpLines.push({
            account_id: acct.code,
            account_name: acct.name,
            debit: bal < 0 ? Math.abs(bal) : 0,
            credit: bal > 0 ? bal : 0,
            description: `Close ${acct.name} to P&L`,
          })
          totalExpenses += bal
        }
      }
      if (Math.abs(totalExpenses) > 0.01) {
        closeExpLines.push({
          account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
          account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
          debit: Math.abs(totalExpenses),
          credit: 0,
          description: `Total operating expenses for FY${fiscalYear}`,
        })
      }

      if (closeExpLines.length > 0) {
        await recordCloseEntry(
          `CLOSE-EXP-${fiscalYear}`,
          `Close expense accounts to P&L for FY${fiscalYear}`,
          closeExpLines
        )
      }

      // Step 5: Close Other Income/Expense to P&L
      let totalOther = 0
      const closeOtherLines: any[] = []
      for (const acct of otherAccounts) {
        const bal = await getBal(acct.code)
        if (Math.abs(bal) > 0.01) {
          closeOtherLines.push({
            account_id: acct.code,
            account_name: acct.name,
            debit: bal < 0 ? Math.abs(bal) : 0,
            credit: bal > 0 ? bal : 0,
            description: `Close ${acct.name} to P&L`,
          })
          totalOther += bal
        }
      }
      if (Math.abs(totalOther) > 0.01) {
        closeOtherLines.push({
          account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
          account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
          debit: totalOther < 0 ? Math.abs(totalOther) : 0,
          credit: totalOther > 0 ? totalOther : 0,
          description: `Total other income/expense for FY${fiscalYear}`,
        })
      }

      if (closeOtherLines.length > 0) {
        await recordCloseEntry(
          `CLOSE-OTHER-${fiscalYear}`,
          `Close other income/expense to P&L for FY${fiscalYear}`,
          closeOtherLines
        )
      }

      // Calculate net income (revenue - COGS - expenses + other)
      const netIncome = totalRevenue + totalCOGS + totalExpenses + totalOther

      // Step 6: Close Current Year P&L to Retained Earnings
      const absNI = Math.abs(netIncome)
      await recordCloseEntry(
        `CLOSE-PL-${fiscalYear}`,
        `Close P&L to Retained Earnings: Net ${netIncome >= 0 ? "Income" : "Loss"} EGP ${absNI}`,
        [
          {
            account_id: ACCOUNT_CODES.CURRENT_YEAR_PL,
            account_name: getAccountName(ACCOUNT_CODES.CURRENT_YEAR_PL),
            debit: netIncome < 0 ? absNI : 0,
            credit: netIncome >= 0 ? absNI : 0,
            description: `Close P&L account`,
          },
          {
            account_id: ACCOUNT_CODES.RETAINED_EARNINGS,
            account_name: getAccountName(ACCOUNT_CODES.RETAINED_EARNINGS),
            debit: netIncome < 0 ? 0 : absNI,
            credit: netIncome < 0 ? absNI : 0,
            description: `Net ${netIncome >= 0 ? "income" : "loss"} for FY${fiscalYear}`,
          },
        ]
      )
      // Step 7: Close drawings to partner capital
      const partnerMappings = [
        { drawings: ACCOUNT_CODES.DRAWINGS_AHMED, capital: ACCOUNT_CODES.CAPITAL_AHMED },
        { drawings: ACCOUNT_CODES.DRAWINGS_IBRAHIM, capital: ACCOUNT_CODES.CAPITAL_IBRAHIM },
        { drawings: ACCOUNT_CODES.DRAWINGS_FATHY, capital: ACCOUNT_CODES.CAPITAL_FATHY },
      ]

      for (const { drawings, capital } of partnerMappings) {
        const drawBal = await getBal(drawings)
        if (Math.abs(drawBal) > 0.01) {
          const absDraw = Math.abs(drawBal)
          const result = await JournalEntryService.createJournalEntry(
            JournalEntryType.CLOSING_ENTRY,
            [
              {
                accountCode: capital,
                accountName: getAccountName(capital),
                debit: drawBal > 0 ? absDraw : 0,
                credit: drawBal < 0 ? absDraw : 0,
                description: `Close drawings to capital`,
              },
              {
                accountCode: drawings,
                accountName: getAccountName(drawings),
                debit: drawBal < 0 ? absDraw : 0,
                credit: drawBal > 0 ? absDraw : 0,
                description: `Close drawings account`,
              },
            ],
            `FY${fiscalYear}-CLOSE`,
            `Close drawings to capital`,
            userId,
            endDate
          )
          if (result.success && result.entryId) {
            entryIds.push(result.entryId)
          }
        }
      }

      // Step 8: Mark fiscal year as closed
      await db.collection(COLLECTIONS.FISCAL_YEARS).doc(`FY${fiscalYear}`).set({
        year: fiscalYear,
        isCurrent: false,
        closedAt: now,
        closedBy: userId,
        netIncome,
        closingEntryIds: entryIds,
      }, { merge: true })

      console.log(`✅ Fiscal year ${fiscalYear} closed. Net Income: EGP ${netIncome}`)
      
      return { success: true, netIncome, entryIds }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute year-end close"
      }
    }
  }
}
