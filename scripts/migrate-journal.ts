
import { supabase, TABLES, getServiceSupabase } from "../lib/supabase"

const MAPPING: Record<string, string> = {
  "CASH": "1101",
  "AR": "1110",
  "ACCOUNTS_RECEIVABLE": "1110",
  "REVENUE": "4001",
  "SALES_REVENUE": "4001",
  "COGS": "5301",
  "INVENTORY_RAW": "1201",
  "INVENTORY_WIP": "1210",
  "INVENTORY_FG": "1220",
  "VAT_PAYABLE": "2110",
  "RETURNS": "4091",
}

async function migrateJournalEntries() {
  console.log("Starting journal entry migration...")
  
  const { data, error } = await getServiceSupabase()
    .from(TABLES.JOURNAL_ENTRIES)
    .select("*")
  
  if (error || !data) {
    console.error("Failed to fetch journal entries:", error)
    return
  }
  
  let count = 0
  
  for (const doc of data) {
    let changed = false
    
    if (doc.entries && Array.isArray(doc.entries)) {
      const newEntries = doc.entries.map((entry: any) => {
        if (MAPPING[entry.account_id]) {
          changed = true
          return { ...entry, account_id: MAPPING[entry.account_id] }
        }
        return entry
      })
      
      if (changed) {
        const accountIds = Array.from(new Set(newEntries.map((l: any) => l.account_id)))
        await getServiceSupabase()
          .from(TABLES.JOURNAL_ENTRIES)
          .update({
            entries: newEntries,
            account_ids: accountIds,
            migrated: true,
            migrated_at: new Date().toISOString()
          })
          .eq("id", doc.id)
        count++
        
        if (count % 50 === 0) {
          console.log(`Updated ${count} entries...`)
        }
      }
    }
  }
  
  console.log(`Migration complete. Updated ${count} journal entries.`)
}

migrateJournalEntries().catch(err => {
  console.error("Migration failed:", err)
  process.exit(1)
})
