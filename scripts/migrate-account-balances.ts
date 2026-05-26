/**
 * One-time migration: computes running account balances from all journal entries
 * and populates the acc_account_balances collection.
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/migrate-account-balances.ts
 * Or: npx tsx scripts/migrate-account-balances.ts
 */

import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const requiredEnvVars = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing ${envVar}. Ensure .env.local exists at project root.`)
    process.exit(1)
  }
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    } as any),
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
}

const db = getFirestore()

function isDebitNormal(code: string): boolean {
  // Assets (1xxx including 1xxx sub-accounts) and expenses (5xxx, 6xxx, 7xxx)
  // are debit-normal. Liabilities (2xxx), equity (3xxx), revenue (4xxx) are credit-normal.
  const prefix = parseInt(code.charAt(0))
  return prefix === 1 || prefix === 5 || prefix === 6 || prefix === 7
}

async function migrate() {
  console.log("Starting balance cache migration...")
  const balances: Map<string, { totalDebits: number; totalCredits: number }> = new Map()
  let processed = 0

  // Stream all journal entries in batches
  const snapshot = await db.collection("acc_journal_entries").get()

  for (const doc of snapshot.docs) {
    const entry = doc.data()
    if (!entry.entries || !Array.isArray(entry.entries)) continue

    for (const line of entry.entries) {
      const code = line.account_id
      if (!code) continue

      const existing = balances.get(code) || { totalDebits: 0, totalCredits: 0 }
      existing.totalDebits += line.debit || 0
      existing.totalCredits += line.credit || 0
      balances.set(code, existing)
    }
    processed++
    if (processed % 500 === 0) {
      console.log(`  Processed ${processed} journal entries...`)
    }
  }

  console.log(`Processed ${processed} journal entries total. Writing ${balances.size} account balances...`)

  // Write balances in batches of 400 (Firestore limit is 500)
  const entries = Array.from(balances.entries())
  const batchSize = 400

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch()
    const chunk = entries.slice(i, i + batchSize)

    for (const [accountCode, { totalDebits, totalCredits }] of chunk) {
      const isDebit = isDebitNormal(accountCode)
      const balance = isDebit
        ? totalDebits - totalCredits
        : totalCredits - totalDebits

      batch.set(db.collection("acc_account_balances").doc(accountCode), {
        accountCode,
        totalDebits,
        totalCredits,
        balance,
        lastEntryId: "migration",
        updatedAt: new Date(),
      })
    }

    await batch.commit()
    console.log(`  Committed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}`)
  }

  console.log(`✅ Migration complete: ${balances.size} account balances populated`)
}

migrate().catch(console.error)
