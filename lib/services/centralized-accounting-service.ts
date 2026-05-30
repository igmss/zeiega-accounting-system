import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export class CentralizedAccountingService {
  
  static async syncAccountBalance(accountId: string): Promise<number> {
    console.warn(`DEPRECATED: syncAccountBalance called for ${accountId}. Use live computation for reports.`)

    try {
      console.log(`🔄 Auto-syncing ${accountId} balance...`)
      
      const now = new Date().toISOString()
      
      const { data: account, error: acctErr } = await (getServiceSupabase() as any).from(TABLES.CHART_OF_ACCOUNTS).select("*").eq("id", accountId).single()
      
      if (acctErr || !account) {
        console.log(`Account ${accountId} not found, skipping...`)
        return 0
      }
      
      const { data: journalRows, error: jeErr } = await (getServiceSupabase() as any).from(TABLES.JOURNAL_ENTRIES)
        .select(`id, date, type, ${TABLES.JOURNAL_ENTRY_LINES}(account_code, account_name, debit, credit, description)`)
        .contains("account_ids", [accountId])
      if (jeErr) throw jeErr
      
      let balance = 0
      for (const entry of (journalRows || [])) {
        const lines = (entry as any).journal_entry_lines || []
        for (const line of lines) {
          if (line.account_code === accountId) {
            if (account.type === 'asset') {
              balance += (line.debit || 0) - (line.credit || 0)
            } else if (account.type === 'liability' || account.type === 'equity') {
              balance += (line.credit || 0) - (line.debit || 0)
            } else if (account.type === 'revenue') {
              balance += (line.credit || 0) - (line.debit || 0)
            } else if (account.type === 'expense') {
              balance += (line.debit || 0) - (line.credit || 0)
            }
          }
        }
      }
      
      const { error: updErr } = await (getServiceSupabase() as any).from(TABLES.CHART_OF_ACCOUNTS).update({
        closing_balance: balance,
        last_updated: now
      }).eq("id", accountId)
      if (updErr) throw updErr
      
      console.log(`✅ Auto-synced ${accountId} closing_balance to $${balance.toLocaleString()}`)
      return balance
      
    } catch (error) {
      console.error(`Error auto-syncing ${accountId} balance:`, error)
      throw error
    }
  }
  
  static async syncMultipleAccountBalances(accountIds: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {}
    
    for (const accountId of accountIds) {
      try {
        results[accountId] = await this.syncAccountBalance(accountId)
      } catch (error) {
        console.error(`Failed to sync ${accountId}:`, error)
        results[accountId] = 0
      }
    }
    
    return results
  }
  
  static async syncAllAccountBalances(): Promise<Record<string, number>> {
    try {
      console.log("🔄 Auto-syncing ALL account balances...")
      
      const { data: accountsRows, error } = await (getServiceSupabase() as any).from(TABLES.CHART_OF_ACCOUNTS).select("id")
      if (error) throw error
      const accountIds = (accountsRows || []).map((row: any) => row.id)
      
      console.log(`Found ${accountIds.length} accounts to sync`)
      
      return await this.syncMultipleAccountBalances(accountIds)
      
    } catch (error) {
      console.error("Error syncing all account balances:", error)
      throw error
    }
  }
  
  static async createJournalEntryAndSync(entries: any[], linkedDoc?: string, skipSync: boolean = true): Promise<string> {
    try {
      const lines = entries.map(e => ({
        accountCode: e.account_id,
        accountName: e.account_name || "",
        debit: e.debit || 0,
        credit: e.credit || 0,
        description: e.description || "",
      }))
      
      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.GENERAL,
        lines,
        linkedDoc || `ENTRY_${Date.now()}`,
        `Journal entry for ${linkedDoc || "auto-sync"}`,
        "system"
      )
      
      if (!result.success || !result.entryId) {
        throw new Error(result.error || "Failed to create journal entry")
      }
      
      console.log(`✅ Created journal entry: ${result.entryId}`)
      
      const affectedAccountIds = [...new Set(entries.map(entry => entry.account_id))]
      
      if (!skipSync) {
        await this.syncMultipleAccountBalances(affectedAccountIds)
      }
      
      return result.entryId
      
    } catch (error) {
      console.error("Error creating journal entry and syncing:", error)
      throw error
    }
  }
  
  static validateJournalEntry(entries: any[]): { isValid: boolean; error?: string } {
    let totalDebits = 0
    let totalCredits = 0
    
    entries.forEach(entry => {
      totalDebits += entry.debit || 0
      totalCredits += entry.credit || 0
    })
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return {
        isValid: false,
        error: `Debits (${totalDebits}) do not equal Credits (${totalCredits})`
      }
    }
    
    return { isValid: true }
  }
}
