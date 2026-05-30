/**
 * Migrate users from Firestore `erp_users` → Supabase Auth + `erp_user_profiles`
 *
 * Prerequisites:
 *   1. Firebase env vars in .env.local (for reading old Firestore)
 *   2. Supabase env vars in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   3. SQL migrations already applied (erp_user_profiles table must exist)
 *
 * Run: npx ts-node --require dotenv/config scripts/migrate-users.ts
 */

import { db } from "../lib/firebase"
import { createClient } from "@supabase/supabase-js"
import * as crypto from "crypto"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase environment variables. Check .env.local for NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface FirestoreUser {
  email: string
  password: string
  name: string
  role: string
  isActive: boolean
  createdAt?: any
  updatedAt?: any
  lastLoginAt?: any
}

async function migrateUsers() {
  console.log("Reading users from Firestore erp_users...")

  const snapshot = await db.collection("erp_users").get()

  if (snapshot.empty) {
    console.log("No users found in erp_users collection.")
    return
  }

  console.log(`Found ${snapshot.size} user(s) in Firestore.\n`)

  // Pre-fetch all existing Supabase auth users for dedup
  console.log("Fetching existing Supabase auth users...")
  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100000 })
  if (listError) {
    console.error("Failed to list Supabase users:", listError.message)
    process.exit(1)
  }
  const existingEmails = new Set(existingUsers.users.map((u) => u.email?.toLowerCase()))
  console.log(`Found ${existingEmails.size} existing user(s) in Supabase Auth.\n`)

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const doc of snapshot.docs) {
    const user = doc.data() as FirestoreUser
    const email = user.email?.toLowerCase()
    const name = user.name || email
    const role = user.role || "viewer"
    const isActive = user.isActive ?? true

    if (!email) {
      console.log(`  [SKIP] Document ${doc.id}: missing email`)
      skipped++
      continue
    }

    // Check if already migrated
    if (existingEmails.has(email)) {
      console.log(`  [SKIP] ${email}: already exists in Supabase Auth`)
      skipped++
      continue
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(24).toString("hex")

    try {
      // Create user in Supabase Auth
      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name, role },
      })

      if (createError) {
        console.error(`  [FAIL] ${email}: ${createError.message}`)
        failed++
        continue
      }

      const userId = authUser.user.id

      // Insert user profile
      const { error: profileError } = await supabaseAdmin
        .from("erp_user_profiles")
        .insert({
          id: userId,
          name,
          role,
          is_active: isActive,
        })

      if (profileError) {
        console.error(`  [WARN] ${email}: auth user created but profile insert failed: ${profileError.message}`)
      }

      console.log(`  [OK] ${email} (${role}) — temp password: ${tempPassword}`)
      migrated++
    } catch (err: any) {
      console.error(`  [FAIL] ${email}: ${err.message}`)
      failed++
    }
  }

  console.log(`\n--- Migration Summary ---`)
  console.log(`Migrated: ${migrated}`)
  console.log(`Skipped:  ${skipped}`)
  console.log(`Failed:   ${failed}`)
  console.log(`Total:    ${snapshot.size}`)

  if (migrated > 0) {
    console.log(`\n⚠️  IMPORTANT: All migrated users now have randomly generated temporary passwords.`)
    console.log(`   The admin must reset passwords for these users before they can log in.`)
  }
}

migrateUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error)
    process.exit(1)
  })
