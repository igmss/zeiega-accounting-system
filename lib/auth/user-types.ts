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
