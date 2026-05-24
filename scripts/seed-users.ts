/**
 * Seed Script for Creating Initial ERP Users
 * 
 * Run this script to create initial users in Firestore:
 * npx ts-node scripts/seed-users.ts
 * 
 * Or run via the API endpoint: POST /api/admin/seed-users (requires admin auth)
 */

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
