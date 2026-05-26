import bcrypt from "bcryptjs"
import { db } from "../firebase"

/**
 * User roles for the ERP system
 */
export enum UserRole {
    ADMIN = "admin",
    ACCOUNTANT = "accountant",
    WAREHOUSE = "warehouse",
    SALES = "sales",
    PRODUCTION = "production",
    VIEWER = "viewer",
}

/**
 * User interface for authentication
 * Stored in Firestore collection: erp_users
 */
export interface User {
    id: string
    email: string
    password: string // hashed with bcrypt
    name: string
    role: UserRole
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    lastLoginAt?: Date
}

/**
 * Role-based permissions
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
    [UserRole.ADMIN]: ["*"], // Full access
    [UserRole.ACCOUNTANT]: [
        "dashboard:view",
        "journal-entries:*",
        "invoices:*",
        "payments:*",
        "reports:view",
        "customers:view",
        "sales-orders:view",
        "chart-of-accounts:view",
        "accounting:*",
        "work-orders:view",
    ],
    [UserRole.WAREHOUSE]: [
        "dashboard:view",
        "inventory:*",
        "purchase-orders:*",
        "vendors:*",
        "work-orders:view",
        "bom:view",
    ],
    [UserRole.SALES]: [
        "dashboard:view",
        "sales-orders:*",
        "customers:*",
        "invoices:view",
        "inventory:view",
        "designs:view",
    ],
    [UserRole.PRODUCTION]: [
        "dashboard:view",
        "work-orders:*",
        "bom:*",
        "designs:*",
        "inventory:view",
    ],
    [UserRole.VIEWER]: [
        "dashboard:view",
        "reports:view",
    ],
}

// Firestore collection for ERP users (separate from other data)
const USERS_COLLECTION = "erp_users"

/**
 * Firestore-based User Store for ERP Authentication
 * Users are stored in a separate Firestore collection 'erp_users'
 * No signup - users are created manually via admin or Firebase console
 */
export class UserStore {

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
        try {
            const snapshot = await db.collection(USERS_COLLECTION)
                .where("email", "==", email.toLowerCase())
                .limit(1)
                .get()

            if (snapshot.empty) return null

            const doc = snapshot.docs[0]
            return this.docToUser(doc)
        } catch (error) {
            console.error("Error finding user by email:", error)
            return null
        }
    }

    /**
     * Find user by ID
     */
    async findById(id: string): Promise<User | null> {
        try {
            const doc = await db.collection(USERS_COLLECTION).doc(id).get()
            if (!doc.exists) return null
            return this.docToUser(doc)
        } catch (error) {
            console.error("Error finding user by ID:", error)
            return null
        }
    }

    /**
     * Verify password against stored hash
     */
    async verifyPassword(user: User, password: string): Promise<boolean> {
        return bcrypt.compare(password, user.password)
    }

    /**
     * Record login timestamp
     */
    async recordLogin(userId: string): Promise<void> {
        try {
            await db.collection(USERS_COLLECTION).doc(userId).update({
                lastLoginAt: new Date(),
            })
        } catch (error) {
            console.error("Error recording login:", error)
        }
    }

    /**
     * Create a new user (for admin use only)
     * Call this from Firebase console or admin API
     */
    async createUser(data: {
        email: string
        password: string
        name: string
        role: UserRole
    }): Promise<{ success: boolean; userId?: string; error?: string }> {
        try {
            // Check if email already exists
            const existing = await this.findByEmail(data.email)
            if (existing) {
                return { success: false, error: "Email already exists" }
            }

            const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
            const hashedPassword = await bcrypt.hash(data.password, 12)
            const now = new Date()

            const user: User = {
                id: userId,
                email: data.email.toLowerCase(),
                password: hashedPassword,
                name: data.name,
                role: data.role,
                isActive: true,
                createdAt: now,
                updatedAt: now,
            }

            await db.collection(USERS_COLLECTION).doc(userId).set(user)

            console.log(`✅ Created user ${user.name} (${user.email}) with role ${user.role}`)
            return { success: true, userId }
        } catch (error) {
            console.error("Error creating user:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to create user" }
        }
    }

    /**
     * Update user password
     */
    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 12)
            await db.collection(USERS_COLLECTION).doc(userId).update({
                password: hashedPassword,
                updatedAt: new Date(),
            })
            return true
        } catch (error) {
            console.error("Error updating password:", error)
            return false
        }
    }

    /**
     * Deactivate user
     */
    async deactivateUser(userId: string): Promise<boolean> {
        try {
            await db.collection(USERS_COLLECTION).doc(userId).update({
                isActive: false,
                updatedAt: new Date(),
            })
            return true
        } catch (error) {
            console.error("Error deactivating user:", error)
            return false
        }
    }

    /**
     * Get all users (for admin)
     */
    async getAllUsers(): Promise<Omit<User, "password">[]> {
        try {
            const snapshot = await db.collection(USERS_COLLECTION).get()
            return snapshot.docs.map(doc => {
                const user = this.docToUser(doc)
                const { password, ...safeUser } = user
                return safeUser
            })
        } catch (error) {
            console.error("Error getting all users:", error)
            return []
        }
    }

    /**
     * Helper to convert Firestore doc to User
     */
    private docToUser(doc: FirebaseFirestore.DocumentSnapshot): User {
        const data = doc.data()!
        return {
            id: doc.id,
            email: data.email,
            password: data.password,
            name: data.name,
            role: data.role as UserRole,
            isActive: data.isActive ?? true,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
            updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
            lastLoginAt: data.lastLoginAt?.toDate?.() || (data.lastLoginAt ? new Date(data.lastLoginAt) : undefined),
        }
    }
}

// Singleton instance
export const userStore = new UserStore()

/**
 * Check if user has permission
 */
export function hasPermission(userRole: UserRole, permission: string): boolean {
    const permissions = ROLE_PERMISSIONS[userRole]

    // Admin has all permissions
    if (permissions.includes("*")) return true

    // Check exact permission
    if (permissions.includes(permission)) return true

    // Check wildcard permissions (e.g., "inventory:*" matches "inventory:view")
    const [resource] = permission.split(":")
    if (permissions.includes(`${resource}:*`)) return true

    return false
}

/**
 * Get safe user object (without password)
 */
export function getSafeUser(user: User): Omit<User, "password"> {
    const { password, ...safeUser } = user
    return safeUser
}
