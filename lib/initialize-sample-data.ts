import { supabase, TABLES, getServiceSupabase } from "./supabase"

const sampleCustomers = [
  {
    name: "Acme Corporation",
    email: "contact@acme.com",
    phone: "+20 (2) 1234-5678",
    address: "123 Business St, Cairo, Egypt",
    type: "business",
    status: "active",
    totalOrders: 15,
    totalSpent: 1350000,
    lastOrderDate: "2024-01-15",
    createdAt: new Date("2023-06-01").toISOString(),
  },
  {
    name: "Ahmed Hassan",
    email: "ahmed.hassan@email.com",
    phone: "+20 (2) 9876-5432",
    address: "456 Main St, Alexandria, Egypt",
    type: "individual",
    status: "active",
    totalOrders: 8,
    totalSpent: 375000,
    lastOrderDate: "2024-01-10",
    createdAt: new Date("2023-08-15").toISOString(),
  },
  {
    name: "Tech Solutions Egypt",
    email: "orders@techsolutions.eg",
    phone: "+20 (2) 4567-8901",
    address: "789 Tech Ave, Giza, Egypt",
    type: "business",
    status: "active",
    totalOrders: 22,
    totalSpent: 2340000,
    lastOrderDate: "2024-01-20",
    createdAt: new Date("2023-04-10").toISOString(),
  },
]

const sampleInventoryItems = [
  {
    id: "STEEL-001",
    name: "Steel Rod 10mm",
    type: "raw",
    quantity_on_hand: 150,
    cost_per_unit: 375,
    reorder_level: 50,
    supplier: "MetalCorp Egypt",
    location: "Warehouse A-1",
    last_updated: new Date("2025-01-11").toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "PLASTIC-002",
    name: "ABS Plastic Pellets",
    type: "raw",
    quantity_on_hand: 25,
    cost_per_unit: 97.5,
    reorder_level: 100,
    supplier: "PlastiTech Egypt",
    location: "Warehouse B-2",
    last_updated: new Date("2025-01-10").toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "WIDGET-A",
    name: "Premium Widget Assembly",
    type: "finished",
    quantity_on_hand: 45,
    cost_per_unit: 562.5,
    reorder_level: 20,
    supplier: "Internal Production",
    location: "Finished Goods",
    last_updated: new Date("2025-01-11").toISOString(),
    createdAt: new Date().toISOString(),
  },
]

const sampleSalesOrders = [
  {
    website_order_id: "WEB-001",
    customer_id: "CUST-001",
    customer_name: "Acme Corporation",
    items: [
      { sku: "WIDGET-A", qty: 10, unit_price: 750 },
      { sku: "GADGET-B", qty: 5, unit_price: 1350 },
    ],
    total: 14250,
    status: "producing",
    created_at: new Date("2025-01-10").toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    website_order_id: "WEB-002",
    customer_id: "CUST-002",
    customer_name: "Tech Solutions Egypt",
    items: [{ sku: "COMPONENT-C", qty: 20, unit_price: 465 }],
    total: 9300,
    status: "pending",
    created_at: new Date("2025-01-11").toISOString(),
    createdAt: new Date().toISOString(),
  },
]

const sampleInvoices = [
  {
    sales_order_id: "SO-2025-0001",
    customer_id: "CUST-001",
    customer_name: "Acme Corporation",
    customer_email: "billing@acme.com",
    amount: 14250,
    tax_amount: 1995,
    total: 15675,
    due_date: new Date("2025-02-10").toISOString(),
    status: "unpaid",
    created_at: new Date("2025-01-11").toISOString(),
    createdAt: new Date().toISOString(),
    items: [
      { sku: "WIDGET-A", description: "Premium Widget Assembly", qty: 10, unit_price: 750, total: 7500 },
      { sku: "GADGET-B", description: "Electronic Gadget", qty: 5, unit_price: 1350, total: 6750 },
    ],
  },
]

const sampleWorkOrders = [
  {
    sales_order_id: "SO-2025-0001",
    customer_name: "Acme Corporation",
    raw_materials_used: [
      { item_id: "STEEL-001", qty: 5, cost: 375 },
      { item_id: "PLASTIC-002", qty: 10, cost: 97.5 },
    ],
    labor_hours: 8.5,
    overhead_cost: 3750,
    materialCost: 1875,
    laborCost: 2550,
    status: "in_progress",
    completion_percentage: 75,
    created_at: new Date("2025-01-10").toISOString(),
    started_at: new Date("2025-01-10T09:00:00").toISOString(),
    createdAt: new Date().toISOString(),
  },
]

const samplePayments = [
  {
    invoice_id: "INV-0001",
    customer_name: "Acme Corporation",
    amount: 15675,
    method: "bank_transfer",
    reference: "TXN-789456123",
    date: new Date("2025-01-15").toISOString(),
    created_at: new Date("2025-01-15T14:30:00").toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    invoice_id: "INV-0002",
    customer_name: "Tech Solutions Egypt",
    amount: 10230,
    method: "credit_card",
    reference: "CC-987654321",
    date: new Date("2025-01-14").toISOString(),
    created_at: new Date("2025-01-14T11:20:00").toISOString(),
    createdAt: new Date().toISOString(),
  },
]

export async function initializeSampleData() {
  try {
    console.log("Initializing sample data in Supabase...")

    const client = getServiceSupabase()

    for (const customer of sampleCustomers) {
      await client.from(TABLES.CUSTOMERS).insert(customer as any).select()
    }
    console.log("✅ Added sample customers")

    for (const item of sampleInventoryItems) {
      await client.from(TABLES.INVENTORY_ITEMS).upsert(item as any, { onConflict: "id" })
    }
    console.log("✅ Added sample inventory items")

    for (const order of sampleSalesOrders) {
      await client.from(TABLES.SALES_ORDERS).insert(order as any).select()
    }
    console.log("✅ Added sample sales orders")

    for (const invoice of sampleInvoices) {
      await client.from(TABLES.INVOICES).insert(invoice as any).select()
    }
    console.log("✅ Added sample invoices")

    for (const workOrder of sampleWorkOrders) {
      await client.from(TABLES.WORK_ORDERS).insert(workOrder as any).select()
    }
    console.log("✅ Added sample work orders")

    for (const payment of samplePayments) {
      await client.from(TABLES.PAYMENTS).insert(payment as any).select()
    }
    console.log("✅ Added sample payments")

    console.log("🎉 Sample data initialization completed!")
    return { success: true, message: "Sample data initialized successfully" }
  } catch (error) {
    console.error("Error initializing sample data:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function initializeChartOfAccounts() {
  try {
    const accounts = [
      { id: "CASH", name: "Cash", type: "asset" },
      { id: "AR", name: "Accounts Receivable", type: "asset" },
      { id: "INVENTORY_RAW", name: "Raw Materials Inventory", type: "asset" },
      { id: "INVENTORY_WIP", name: "Work in Progress", type: "asset" },
      { id: "INVENTORY_FG", name: "Finished Goods Inventory", type: "asset" },
      { id: "REVENUE", name: "Sales Revenue", type: "revenue" },
      { id: "COGS", name: "Cost of Goods Sold", type: "expense" },
      { id: "RETURNS", name: "Returns and Allowances", type: "expense" },
      { id: "VAT_PAYABLE", name: "VAT Payable", type: "liability" },
    ]

    const client = getServiceSupabase()
    for (const account of accounts) {
      await client.from(TABLES.CHART_OF_ACCOUNTS).upsert(account as any, { onConflict: "id" })
    }

    console.log("✅ Chart of accounts initialized")
    return { success: true, message: "Chart of accounts initialized successfully" }
  } catch (error) {
    console.error("Error initializing chart of accounts:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
