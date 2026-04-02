import { db, COLLECTIONS } from "../firebase"

// Centralized Accounting Service for systematic balance management
export class CentralizedAccountingService {
  
  /**
   * @deprecated Universal function to sync any account balance from journal entries.
   * Account balances should be derived live from journal entries for reports.
   * This method now only updates the display cache.
   */
  static async syncAccountBalance(accountId: string): Promise<number> {
    console.warn(`DEPRECATED: syncAccountBalance called for ${accountId}. Use live computation for reports.`)

    try {
      console.log(`🔄 Auto-syncing ${accountId} balance...`)
      
      const now = new Date()
      
      // First, get the account type
      const accountRef = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc(accountId)
      const accountDoc = await accountRef.get()
      const account = accountDoc.data()
      
      if (!account) {
        console.log(`Account ${accountId} not found, skipping...`)
        return 0
      }
      
      // Calculate balance from journal entries using indexed query (BUG-11)
      const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
        .where("account_ids", "array-contains", accountId)
        .get()
      
      let balance = 0
      journalSnapshot.docs.forEach(doc => {
        const entry = doc.data()
        if (entry.entries) {
          entry.entries.forEach((subEntry: any) => {
            if (subEntry.account_id === accountId) {
              if (account.type === 'asset') {
                // For asset accounts: debit increases, credit decreases
                balance += (subEntry.debit || 0) - (subEntry.credit || 0)
              } else if (account.type === 'liability' || account.type === 'equity') {
                // For liability and equity accounts: credit increases, debit decreases
                balance += (subEntry.credit || 0) - (subEntry.debit || 0)
              } else if (account.type === 'revenue') {
                // For revenue accounts: credit increases, debit decreases
                balance += (subEntry.credit || 0) - (subEntry.debit || 0)
              } else if (account.type === 'expense') {
                // For expense accounts: debit increases, credit decreases (same as assets)
                balance += (subEntry.debit || 0) - (subEntry.credit || 0)
              }
            }
          })
        }
      })
      
      // Update account balance
      await accountRef.update({
        balance: balance,
        last_updated: now
      })
      
      console.log(`✅ Auto-synced ${accountId} balance to $${balance.toLocaleString()}`)
      return balance
      
    } catch (error) {
      console.error(`Error auto-syncing ${accountId} balance:`, error)
      throw error
    }
  }
  
  /**
   * @deprecated Sync multiple accounts at once.
   */
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
  
  /**
   * @deprecated Sync all accounts in chart of accounts.
   */
  static async syncAllAccountBalances(): Promise<Record<string, number>> {
    try {
      console.log("🔄 Auto-syncing ALL account balances...")
      
      // Get all accounts from chart of accounts
      const accountsSnapshot = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).get()
      const accountIds = accountsSnapshot.docs.map(doc => doc.id)
      
      console.log(`Found ${accountIds.length} accounts to sync`)
      
      return await this.syncMultipleAccountBalances(accountIds)
      
    } catch (error) {
      console.error("Error syncing all account balances:", error)
      throw error
    }
  }
  
  /**
   * Create journal entry and optionally auto-sync affected accounts (deprecated).
   * Default behavior is now to SKIP sync to ensure journal entries are the only source of truth.
   */
  static async createJournalEntryAndSync(entries: any[], linkedDoc?: string, skipSync: boolean = true): Promise<string> {
    try {
      const now = new Date()
      
      // Create journal entry with account_ids index (BUG-12)
      const journalEntry = {
        date: now,
        entries: entries,
        account_ids: [...new Set(entries.map(e => e.account_id))],
        linked_doc: linkedDoc || `ENTRY_${Date.now()}`,
        created_at: now
      }
      
      const docRef = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add(journalEntry)
      console.log(`✅ Created journal entry: ${docRef.id}`)
      
      // Get unique account IDs from entries
      const affectedAccountIds = [...new Set(entries.map(entry => entry.account_id))]
      
      // Auto-sync all affected accounts ONLY if explicitly requested (DEPRECATED)
      if (!skipSync) {
        await this.syncMultipleAccountBalances(affectedAccountIds)
      }
      
      return docRef.id
      
    } catch (error) {
      console.error("Error creating journal entry and syncing:", error)
      throw error
    }
  }
  
  // Validate double-entry bookkeeping
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
