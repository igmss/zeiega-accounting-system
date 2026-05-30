/**
 * Seed Script for Creating Initial ERP Users via Supabase Auth
 *
 * Prerequisites:
 *   1. Add Supabase env vars to .env.local (NEXT_PUBLIC_SUPABASE_URL,
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
 *   2. Apply SQL migrations first (tables must exist)
 *
 * Run: npx ts-node --require dotenv/config scripts/seed-users.ts
 *   (dotenv reads .env.local automatically)
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
// Node.js 20 polyfill — suppress TS error since ws is only used at runtime
// @ts-ignore
import WebSocket from "ws"
;(globalThis as any).WebSocket = WebSocket
import { userStore, UserRole } from "../lib/auth/user-model"

const DEFAULT_USERS = [
    {
        email: "admin@zeiega.com",
        password: "admin123",
        name: "System Admin",
        role: UserRole.ADMIN,
    },
    {
        email: "accountant@zeiega.com",
        password: "demo123",
        name: "Demo Accountant",
        role: UserRole.ACCOUNTANT,
    },
    {
        email: "warehouse@zeiega.com",
        password: "demo123",
        name: "Demo Warehouse Manager",
        role: UserRole.WAREHOUSE,
    },
    {
        email: "sales@zeiega.com",
        password: "demo123",
        name: "Demo Sales Rep",
        role: UserRole.SALES,
    },
    {
        email: "production@zeiega.com",
        password: "demo123",
        name: "Demo Production Manager",
        role: UserRole.PRODUCTION,
    },
]

async function seedUsers() {
    console.log("🌱 Seeding ERP users...")

    for (const userData of DEFAULT_USERS) {
        const result = await userStore.createUser(userData)
        if (result.success) {
            console.log(`✅ Created: ${userData.email} (${userData.role})`)
        } else {
            console.log(`⚠️ Skipped: ${userData.email} - ${result.error}`)
        }
    }

    console.log("\n✨ Seed complete!")
    console.log("\nDefault credentials:")
    console.log("  Admin: admin@zeiega.com / admin123")
    console.log("  Others: [role]@zeiega.com / demo123")
}

// Run if called directly
if (require.main === module) {
    seedUsers()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Seed failed:", error)
            process.exit(1)
        })
}

export { seedUsers, DEFAULT_USERS }
