import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName, AccountType, getAccountsByType } from "../accounting/account-types"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export class FiscalCloseService {

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
      const startDate = new Date(fiscalYear, 0, 1).toISOString()
      const endDate = new Date(fiscalYear, 11, 31, 23, 59, 59)
      const now = new Date().toISOString()
      const entryIds: string[] = []

      const revenueAccounts = getAccountsByType(AccountType.REVENUE)
      const contraRevenueAccounts = getAccountsByType(AccountType.CONTRA_REVENUE)
      const cogsAccounts = getAccountsByType(AccountType.COGS)
      const expenseAccounts = getAccountsByType(AccountType.EXPENSE)
      const otherAccounts = getAccountsByType(AccountType.OTHER)

      const getBal = async (code: string) => {
        const { data: snap } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
          .select(`id, date, type, ${TABLES.JOURNAL_ENTRY_LINES}(account_code, account_name, debit, credit, description)`)
          .contains("account_ids", [code])
          .lte("date", endDate.toISOString())
        let d = 0, c = 0
        for (const entry of (snap || [])) {
          const lines = (entry as any).journal_entry_lines || []
          for (const line of lines) {
            if (line.account_code === code) { d += line.debit || 0; c += line.credit || 0 }
          }
        }
        return c - d
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
          totalCOGS += bal
        }
      }
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

      const netIncome = totalRevenue + totalCOGS + totalExpenses + totalOther

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

      const { error: markErr } = await getServiceSupabase().from(TABLES.FISCAL_YEARS).upsert({
        id: `FY${fiscalYear}`,
        year: fiscalYear,
        isCurrent: false,
        closedAt: now,
        closedBy: userId,
        netIncome,
        closingEntryIds: entryIds,
      }, { onConflict: "id" })
      if (markErr) console.error("Error marking fiscal year:", markErr)

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
