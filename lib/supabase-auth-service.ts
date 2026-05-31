import { getServiceSupabase, getAdminSupabase } from "./supabase"

export enum UserRole {
  ADMIN = "admin",
  ACCOUNTANT = "accountant",
  WAREHOUSE = "warehouse",
  SALES = "sales",
  PRODUCTION = "production",
  VIEWER = "viewer",
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: ["*"],
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

export class UserStore {
  async findByEmail(email: string): Promise<User | null> {
    try {
      const admin = getAdminSupabase()
      const { data: authUsers, error: authError } = await admin.listUsers()

      if (authError) {
        console.error("Error listing users:", authError)
        return null
      }

      const authUser = authUsers.users.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      )
      if (!authUser) return null

      const client = getServiceSupabase()
      const { data: profile, error: profileError } = await client
        .from("erp_user_profiles")
        .select("id, name, role, is_active, created_at, updated_at")
        .eq("id", authUser.id)
        .maybeSingle()

      if (profileError) {
        console.error("Error fetching user profile:", profileError)
      }

      if (!profile) {
        return {
          id: authUser.id,
          email: authUser.email || email,
          name: authUser.user_metadata?.name || "",
          role: (authUser.user_metadata?.role as UserRole) || UserRole.VIEWER,
          isActive: true,
          createdAt: new Date(authUser.created_at || new Date()),
          updatedAt: new Date(authUser.updated_at || new Date()),
        }
      }

      return this.toUser(authUser, profile)
    } catch (error) {
      console.error("Error finding user by email:", error)
      return null
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const client = getServiceSupabase()
      const { data: profile, error } = await client
        .from("erp_user_profiles")
        .select("id, name, role, is_active, created_at, updated_at")
        .eq("id", id)
        .single()

      if (error || !profile) return null

      const admin = getAdminSupabase()
      const { data } = await admin.getUserById(id)
      const authUser = data?.user
      if (!authUser?.email) return null

      return this.toUser(authUser, profile)
    } catch (error) {
      console.error("Error finding user by ID:", error)
      return null
    }
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    try {
      const { error } = await getServiceSupabase().auth.signInWithPassword({
        email: user.email,
        password,
      })
      return !error
    } catch {
      return false
    }
  }

  async recordLogin(userId: string): Promise<void> {
    try {
      await getServiceSupabase()
        .from("erp_user_profiles")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", userId)
    } catch (error) {
      console.error("Error recording login:", error)
    }
  }

  async createUser(data: {
    email: string
    password: string
    name: string
    role: UserRole
  }): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      const admin = getAdminSupabase()
      const { data: authData, error: authError } = await admin.createUser({
        email: data.email.toLowerCase(),
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name, role: data.role },
      })

      if (authError || !authData.user) {
        return { success: false, error: authError?.message || "Failed to create user" }
      }

      const { error: profileError } = await getServiceSupabase()
        .from("erp_user_profiles")
        .insert({
          id: authData.user.id,
          name: data.name,
          role: data.role,
          is_active: true,
        })

      if (profileError) {
        await admin.deleteUser(authData.user.id)
        return { success: false, error: profileError.message }
      }

      return { success: true, userId: authData.user.id }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create user",
      }
    }
  }

  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    try {
      const admin = getAdminSupabase()
      const { error } = await admin.updateUserById(userId, {
        password: newPassword,
      })
      return !error
    } catch (error) {
      console.error("Error updating password:", error)
      return false
    }
  }

  async deactivateUser(userId: string): Promise<boolean> {
    try {
      const { error } = await getServiceSupabase()
        .from("erp_user_profiles")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", userId)

      if (error) {
        console.error("Error deactivating user:", error)
        return false
      }

      const admin = getAdminSupabase()
      await admin.updateUserById(userId, { ban_duration: "876600h" }) // ~100 years
      return true
    } catch (error) {
      console.error("Error deactivating user:", error)
      return false
    }
  }

  async getAllUsers(): Promise<Omit<User, "password">[]> {
    try {
      const { data: profiles, error } = await getServiceSupabase()
        .from("erp_user_profiles")
        .select("id, name, role, is_active, created_at, updated_at")

      if (error || !profiles) return []

      const admin = getAdminSupabase()
      const { data: authUsers } = await admin.listUsers({ perPage: 100 })
      const emailMap = new Map(
        (authUsers?.users || []).map((u: any) => [u.id, u.email || ""])
      )

      return profiles.map((p: any) => ({
        id: p.id,
        email: emailMap.get(p.id) || "",
        name: p.name,
        role: p.role as UserRole,
        isActive: p.is_active,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }))
    } catch (error) {
      console.error("Error getting all users:", error)
      return []
    }
  }

  private toUser(authUser: { id: string; email?: string | null }, profile: Record<string, unknown>): User {
    return {
      id: authUser.id,
      email: authUser.email || "",
      name: (profile.name as string) || "",
      role: (profile.role as UserRole) || UserRole.VIEWER,
      isActive: (profile.is_active as boolean) ?? true,
      createdAt: new Date((profile.created_at as string) || new Date()),
      updatedAt: new Date((profile.updated_at as string) || new Date()),
    }
  }
}

export const userStore = new UserStore()

export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole]
  if (permissions.includes("*")) return true
  if (permissions.includes(permission)) return true
  const [resource] = permission.split(":")
  return permissions.includes(`${resource}:*`)
}

export function getSafeUser(user: User): Omit<User, "password"> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  }
}
