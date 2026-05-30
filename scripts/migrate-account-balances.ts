/**
 * One-time migration: computes running account balances from all journal entries
 * and populates the account_balances table.
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/migrate-account-balances.ts
 * Or: npx tsx scripts/migrate-account-balances.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing ${envVar}. Ensure .env.local exists at project root.`)
    process.exit(1)
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

const TABLES = {
  JOURNAL_ENTRIES: "journal_entries",
  ACCOUNT_BALANCES: "account_balances",
} as const

function isDebitNormal(code: string): boolean {
  const prefix = parseInt(code.charAt(0))
  return prefix === 1 || prefix === 5 || prefix === 6 || prefix === 7
}

async function migrate() {
  console.log("Starting balance cache migration...")
  const balances: Map<string, { totalDebits: number; totalCredits: number }> = new Map()
  let processed = 0

  const { data: entries, error } = await supabase
    .from(TABLES.JOURNAL_ENTRIES)
    .select("*")

  if (error) throw error

  for (const entry of entries) {
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

  const balanceRows = Array.from(balances.entries()).map(([accountCode, { totalDebits, totalCredits }]) => {
    const isDebit = isDebitNormal(accountCode)
    const balance = isDebit
      ? totalDebits - totalCredits
      : totalCredits - totalDebits

    return {
      accountCode,
      totalDebits,
      totalCredits,
      balance,
      lastEntryId: "migration",
      updatedAt: new Date().toISOString(),
    }
  })

  const batchSize = 400

  for (let i = 0; i < balanceRows.length; i += batchSize) {
    const chunk = balanceRows.slice(i, i + batchSize)

    const { error: upsertError } = await supabase
      .from(TABLES.ACCOUNT_BALANCES)
      .upsert(chunk, { onConflict: "accountCode" })

    if (upsertError) throw upsertError

    console.log(`  Committed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(balanceRows.length / batchSize)}`)
  }

  console.log(`\u2705 Migration complete: ${balances.size} account balances populated`)
}

migrate().catch(console.error)
