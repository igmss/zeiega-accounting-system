import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Server-side client with service role (bypasses RLS)
let serviceClient: ReturnType<typeof createClient> | null = null

export function getServiceSupabase(): any {
  if (serviceClient) return serviceClient

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set")
  }

  serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return serviceClient
}

// Untyped Supabase client — use when the Database types are too restrictive
export function getServiceClient() {
  return getServiceSupabase() as any
}

// Admin client for user management operations
export function getAdminSupabase() {
  return getServiceSupabase().auth.admin
}

// ============================================
// TABLE NAMES (replaces COLLECTIONS constant)
// ============================================
export const TABLES = {
  CUSTOMERS: "customers",
  VENDORS: "vendors",
  CHART_OF_ACCOUNTS: "chart_of_accounts",
  JOURNAL_ENTRIES: "journal_entries",
  JOURNAL_ENTRY_LINES: "journal_entry_lines",
  ACCOUNT_BALANCES: "account_balances",
  SALES_ORDERS: "sales_orders",
  WORK_ORDERS: "work_orders",
  INVENTORY_ITEMS: "inventory_items",
  INVENTORY_MOVEMENTS: "inventory_movements",
  INVENTORY_LAYERS: "inventory_layers",
  INVOICES: "invoices",
  PAYMENTS: "payments",
  ASSETS: "assets",
  DESIGNS: "designs",
  BOM: "bom",
  PURCHASE_ORDERS: "purchase_orders",
  FISCAL_YEARS: "fiscal_years",
  FISCAL_PERIODS: "fiscal_periods",
  MANUAL_ORDERS: "manual_orders",
  SCRAP_RECORDS: "scrap_records",
  REWORK_ORDERS: "rework_orders",
  CHANGE_ORDERS: "change_orders",
  RETENTION_SCHEDULES: "retention_schedules",
  BUDGET_LINES: "budget_lines",
  OVERHEAD_CONFIG: "overhead_config",
  STANDARD_COSTS: "standard_costs",
  CONTRACTS: "contracts",
  REVENUE_RECOGNITION: "revenue_recognition",
  EXCHANGE_RATES: "exchange_rates",
  ORDERS: "orders",
  RETURNS: "returns",
  PRODUCTS: "products",
  WEBSITE_USERS: "website_users",
  ERP_USER_PROFILES: "erp_user_profiles",
} as const

// ============================================
// QUERY HELPERS
// ============================================

/** Shorthand: supabase.from(table) wrapper for service role client */
export function db(table: string) {
  return getServiceSupabase().from(table)
}

/** Run multiple inserts in a transaction via RPC */
export async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[]
) {
  const client = getServiceSupabase()
  const { data, error } = await client.rpc("batch_insert", {
    p_table: table,
    p_rows: rows,
  })
  if (error) throw error
  return data
}

/** Run a function within a database transaction via RPC */
export async function runTransaction<T>(fn: (client: ReturnType<typeof getServiceSupabase>) => Promise<T>): Promise<T> {
  return fn(getServiceSupabase())
}
