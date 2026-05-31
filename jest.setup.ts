// Jest setup file
import "@testing-library/jest-dom"

// Mock Supabase client
const mockQueryBuilder = () => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  builder.from = jest.fn(() => builder)
  builder.channel = jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  }))
  builder.removeChannel = jest.fn()
  builder.removeAllChannels = jest.fn()
  return builder
}

const mockSupabaseClient = () => {
  const client: any = mockQueryBuilder()
  client.auth = {
    signInWithPassword: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    admin: {
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      getUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      createUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-id" } }, error: null }),
      deleteUser: jest.fn().mockResolvedValue({ data: null, error: null }),
      updateUserById: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
  }
  return client
}

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabaseClient()),
}))

jest.mock("@/lib/supabase", () => {
  const client = mockSupabaseClient()
  return {
    getSupabase: jest.fn(() => client),
    supabase: new Proxy({}, { get: () => client }),
    getServiceSupabase: jest.fn(() => client),
    getServiceClient: jest.fn(() => client),
    getAdminSupabase: jest.fn(() => client.auth.admin),
    db: jest.fn(() => mockQueryBuilder()),
    batchInsert: jest.fn().mockResolvedValue({ count: 1 }),
    runTransaction: jest.fn((fn: Function) => fn(client)),
    TABLES: {
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
    },
  }
})

// Environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
process.env.SUPABASE_SECRET_KEY = "test-service-key"
process.env.NEXTAUTH_SECRET = "test-nextauth-secret"
process.env.WEBHOOK_SECRET = "test-secret"
process.env.ALLOWED_ORIGINS = "http://localhost:3000"

// Global test utilities
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
