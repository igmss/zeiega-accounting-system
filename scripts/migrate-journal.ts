import { db, COLLECTIONS } from "../lib/firebase"

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
  
  const snapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).get()
  let count = 0
  
  const batch = db.batch()
  
  for (const doc of snapshot.docs) {
    const data = doc.data()
    let changed = false
    
    if (data.entries && Array.isArray(data.entries)) {
      const newEntries = data.entries.map((entry: any) => {
        if (MAPPING[entry.account_id]) {
          changed = true
          return { ...entry, account_id: MAPPING[entry.account_id] }
        }
        return entry
      })
      
      if (changed) {
        const accountIds = Array.from(new Set(newEntries.map((l: any) => l.account_id)))
        batch.update(doc.ref, { 
          entries: newEntries,
          account_ids: accountIds,
          migrated: true,
          migrated_at: new Date()
        })
        count++
      }
    }
    
    // Commit every 500 docs (Firestore batch limit)
    if (count > 0 && count % 400 === 0) {
      await batch.commit()
      console.log(`Committed ${count} entries...`)
    }
  }
  
  if (count % 400 !== 0) {
    await batch.commit()
  }
  
  console.log(`Migration complete. Updated ${count} journal entries.`)
}

migrateJournalEntries().catch(err => {
  console.error("Migration failed:", err)
  process.exit(1)
})
