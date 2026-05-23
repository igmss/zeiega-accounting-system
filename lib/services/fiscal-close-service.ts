import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName, AccountType, getAccountsByType } from "../accounting/account-types"

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
        const totalD = closeRevenueLines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalC = closeRevenueLines.reduce((s, l) => s + (l.credit || 0), 0)
        const revEntryId = `CLOSE-REV-${fiscalYear}-${Date.now()}`
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(revEntryId).set({
          id: revEntryId, date: endDate, type: "CLOSING_ENTRY",
          reference_doc: `FY${fiscalYear}-CLOSE`,
          description: `Close revenue accounts to P&L for FY${fiscalYear}`,
          entries: closeRevenueLines,
          account_ids: [...new Set(closeRevenueLines.map(l => l.account_id))],
          total_debits: totalD, total_credits: totalC,
          created_at: now, created_by: userId,
        })
        entryIds.push(revEntryId)
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
        const totalD = closeCOGSLines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalC = closeCOGSLines.reduce((s, l) => s + (l.credit || 0), 0)
        const cogsEntryId = `CLOSE-COGS-${fiscalYear}-${Date.now()}`
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(cogsEntryId).set({
          id: cogsEntryId, date: endDate, type: "CLOSING_ENTRY",
          reference_doc: `FY${fiscalYear}-CLOSE`,
          description: `Close COGS accounts to P&L for FY${fiscalYear}`,
          entries: closeCOGSLines,
          account_ids: [...new Set(closeCOGSLines.map(l => l.account_id))],
          total_debits: totalD, total_credits: totalC,
          created_at: now, created_by: userId,
        })
        entryIds.push(cogsEntryId)
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
        const totalD = closeExpLines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalC = closeExpLines.reduce((s, l) => s + (l.credit || 0), 0)
        const expEntryId = `CLOSE-EXP-${fiscalYear}-${Date.now()}`
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(expEntryId).set({
          id: expEntryId, date: endDate, type: "CLOSING_ENTRY",
          reference_doc: `FY${fiscalYear}-CLOSE`,
          description: `Close expense accounts to P&L for FY${fiscalYear}`,
          entries: closeExpLines,
          account_ids: [...new Set(closeExpLines.map(l => l.account_id))],
          total_debits: totalD, total_credits: totalC,
          created_at: now, created_by: userId,
        })
        entryIds.push(expEntryId)
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
        const totalD = closeOtherLines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalC = closeOtherLines.reduce((s, l) => s + (l.credit || 0), 0)
        const otherEntryId = `CLOSE-OTHER-${fiscalYear}-${Date.now()}`
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(otherEntryId).set({
          id: otherEntryId, date: endDate, type: "CLOSING_ENTRY",
          reference_doc: `FY${fiscalYear}-CLOSE`,
          description: `Close other income/expense to P&L for FY${fiscalYear}`,
          entries: closeOtherLines,
          account_ids: [...new Set(closeOtherLines.map(l => l.account_id))],
          total_debits: totalD, total_credits: totalC,
          created_at: now, created_by: userId,
        })
        entryIds.push(otherEntryId)
      }

      // Calculate net income (revenue - COGS - expenses + other)
      const netIncome = totalRevenue + totalCOGS + totalExpenses + totalOther

      // Step 6: Close Current Year P&L to Retained Earnings
      const pAndLEntryId = `CLOSE-PL-${fiscalYear}-${Date.now()}`
      const absNI = Math.abs(netIncome)
      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(pAndLEntryId).set({
        id: pAndLEntryId,
        date: endDate,
        type: "CLOSING_ENTRY",
        reference_doc: `FY${fiscalYear}-CLOSE`,
        description: `Close P&L to Retained Earnings: Net ${netIncome >= 0 ? "Income" : "Loss"} EGP ${absNI}`,
        entries: [
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
        ],
        account_ids: [ACCOUNT_CODES.CURRENT_YEAR_PL, ACCOUNT_CODES.RETAINED_EARNINGS],
        total_debits: absNI,
        total_credits: absNI,
        created_at: now,
        created_by: userId,
      })
      entryIds.push(pAndLEntryId)

      // Step 7: Close drawings to partner capital
      const partnerMappings = [
        { drawings: ACCOUNT_CODES.DRAWINGS_AHMED, capital: ACCOUNT_CODES.CAPITAL_AHMED },
        { drawings: ACCOUNT_CODES.DRAWINGS_IBRAHIM, capital: ACCOUNT_CODES.CAPITAL_IBRAHIM },
        { drawings: ACCOUNT_CODES.DRAWINGS_FATHY, capital: ACCOUNT_CODES.CAPITAL_FATHY },
      ]

      for (const { drawings, capital } of partnerMappings) {
        const drawBal = await getBal(drawings)
        if (Math.abs(drawBal) > 0.01) {
          const drawEntryId = `CLOSE-DRAW-${drawings}-${Date.now()}`
          const absDraw = Math.abs(drawBal)
          await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(drawEntryId).set({
            id: drawEntryId, date: endDate, type: "CLOSING_ENTRY",
            reference_doc: `FY${fiscalYear}-CLOSE`,
            description: `Close drawings to capital`,
            entries: [
              {
                account_id: capital,
                account_name: getAccountName(capital),
                debit: drawBal > 0 ? absDraw : 0,
                credit: drawBal < 0 ? absDraw : 0,
                description: `Close drawings to capital`,
              },
              {
                account_id: drawings,
                account_name: getAccountName(drawings),
                debit: drawBal < 0 ? absDraw : 0,
                credit: drawBal > 0 ? absDraw : 0,
                description: `Close drawings account`,
              },
            ],
            account_ids: [capital, drawings],
            total_debits: absDraw,
            total_credits: absDraw,
            created_at: now,
            created_by: userId,
          })
          entryIds.push(drawEntryId)
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
