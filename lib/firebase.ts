import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

let _db: ReturnType<typeof getFirestore> | null = null

function getDb(): ReturnType<typeof getFirestore> {
  if (_db) return _db
  _db = getFirestore()
  return _db
}

function ensureInitialized() {
  if (getApps().length) return
  const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ] as const
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}. Please check your .env.local file.`)
    }
  }
  initializeApp({
    credential: cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID!,
      private_key: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL!,
    } as any),
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
}

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop: string) {
    ensureInitialized()
    const real = getDb()
    const value = (real as any)[prop]
    return typeof value === "function" ? value.bind(real) : value
  },
}) as ReturnType<typeof getFirestore>

export { FieldValue }


// Collection names with acc_ prefix
export const COLLECTIONS = {
  CUSTOMERS: "acc_customers",
  CHART_OF_ACCOUNTS: "acc_chart_of_accounts",
  JOURNAL_ENTRIES: "acc_journal_entries",
  SALES_ORDERS: "acc_sales_orders",
  WORK_ORDERS: "acc_work_orders",
  INVENTORY_ITEMS: "acc_inventory_items",
  INVENTORY_MOVEMENTS: "acc_inventory_movements",
  INVOICES: "acc_invoices",
  PAYMENTS: "acc_payments",
  ASSETS: "acc_assets",
  DESIGNS: "acc_designs",
  VENDORS: "acc_vendors",
  PURCHASE_ORDERS: "acc_purchase_orders",
  FISCAL_YEARS: "acc_fiscal_years",
  FISCAL_PERIODS: "acc_fiscal_periods",
  MANUAL_ORDERS: "acc_manual_orders",
  // Source collections (existing website data)
  ORDERS: "orders",
  RETURNS: "returns",
  PRODUCTS: "products", // Main website products collection
  USERS: "users",       // User profiles collection
  // Manufacturing gap-fill collections
  INVENTORY_LAYERS: "acc_inventory_layers",     // FIFO cost layers per SKU (IAS 2.25)
  SCRAP_RECORDS: "acc_scrap_records",           // Scrap/spoilage events
  REWORK_ORDERS: "acc_rework_orders",           // Rework job records
  CHANGE_ORDERS: "acc_change_orders",           // Contract modifications (IFRS 15.18)
  RETENTION_SCHEDULES: "acc_retention_schedules", // Customer retention holdbacks
  BUDGET_LINES: "acc_budget_lines",             // Budget vs actual per account/period
  ACCOUNT_BALANCES: "acc_account_balances",     // Running balance cache per account
} as const
