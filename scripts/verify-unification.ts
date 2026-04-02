
import { db, COLLECTIONS } from "../lib/firebase"
import { FinancialStatementsService } from "../lib/services/financial-statements-service"

async function verify() {
  console.log("🔍 Verifying Account Balance Logic Unification...")

  const testAccountCode = "1101" // Cash on Hand
  
  // 1. Get initial states
  const accountDoc = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).where("code", "==", testAccountCode).get()
  const initialDocBalance = accountDoc.docs[0].data().balance || 0
  const initialLiveBalance = await FinancialStatementsService["getAccountBalance"](testAccountCode)

  console.log(`Initial Doc Balance: ${initialDocBalance}`)
  console.log(`Initial Live Balance: ${initialLiveBalance}`)

  // 2. Create a dummy journal entry (direct Firestore write)
  const entryId = `TEST-VERIFY-${Date.now()}`
  const amount = 100
  const journalEntry = {
    id: entryId,
    date: new Date(),
    description: "Verification Test Entry",
    type: "TEST",
    entries: [
      {
        account_id: testAccountCode,
        debit: amount,
        credit: 0,
        description: "Test Debit"
      },
      {
        account_id: "3001", // Equity
        debit: 0,
        credit: amount,
        description: "Test Credit"
      }
    ],
    account_ids: [testAccountCode, "3001"],
    total_debits: amount,
    total_credits: amount,
    created_at: new Date(),
    status: "posted"
  }

  console.log(`Creating test journal entry ${entryId} for ${amount}...`)
  await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

  // 3. Get final states
  const finalAccountDoc = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).where("code", "==", testAccountCode).get()
  const finalDocBalance = finalAccountDoc.docs[0].data().balance || 0
  const finalLiveBalance = await FinancialStatementsService["getAccountBalance"](testAccountCode)

  console.log(`Final Doc Balance: ${finalDocBalance}`)
  console.log(`Final Live Balance: ${finalLiveBalance}`)

  // 4. Validate
  const docBalanceChanged = finalDocBalance !== initialDocBalance
  const liveBalanceCorrect = finalLiveBalance === (initialLiveBalance + amount)

  if (!docBalanceChanged && liveBalanceCorrect) {
    console.log("✅ SUCCESS: Live balance updated, document balance stayed the same (drifted as expected).")
  } else {
    console.error("❌ FAILURE: Balance logic mismatch!")
    if (docBalanceChanged) console.error("   - Document balance was mutated!")
    if (!liveBalanceCorrect) console.error(`   - Live balance incorrect! Expected ${initialLiveBalance + amount}, got ${finalLiveBalance}`)
  }

  // Cleanup
  console.log("Cleaning up test entry...")
  await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).delete()
}

verify().catch(console.error)
