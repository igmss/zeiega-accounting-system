export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  created_at: string
}

export interface ChartOfAccount {
  id: string
  name: string
  type: "asset" | "liability" | "equity" | "revenue" | "expense"
  parent_id?: string
}

export interface JournalEntry {
  id: string
  date: string
  description?: string | null
  type?: string | null
  reference_id?: string | null
  reference_type?: string | null
  linked_doc?: string
  account_ids?: string[]
  created_at: string
}

export interface SalesOrder {
  id: string
  website_order_id: string
  customer_id: string
  items: {
    sku: string
    qty: number
    unit_price: number
    bom_id?: string
  }[]
  status: "pending" | "producing" | "completed" | "invoiced"
  created_at: string
}

export interface WorkOrder {
  id: string
  wo_number?: string | null
  sales_order_id: string
  design_id?: string
  design_name?: string
  bom_id?: string
  raw_materials_used: {
    item_id: string
    qty: number
    cost: number
  }[]
  materials_issued?: {
    inventoryItemId: string
    inventoryItemName: string
    quantityIssued: number
    unitCost: number
    totalCost: number
  }[]
  labor_hours: number
  labor_cost: number
  overhead_cost: number
  total_cost: number
  estimated_cost: number
  status: "pending" | "in_progress" | "completed"
  created_at: string
  completed_at?: string | null
  updated_at?: string
  completion_percentage?: number
  assigned_worker?: string
  start_time?: string | null
  estimated_completion?: string | null
  notes?: string
  items?: any[]
  item_costs?: any[]
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  customer_address?: string
  total_amount?: number
  order_status?: string
  cost_override?: number
  cost_override_reason?: string
  cost_override_by?: string
}

export interface InventoryItem {
  id: string
  sku: string
  name: string
  type: "raw" | "finished"
  quantity_on_hand: number
  cost_per_unit: number
  reorder_level?: number
  unit?: string
  supplier?: string | null
  location?: string | null
  description?: string | null
  created_at: string
}

export interface InventoryMovement {
  id: string
  item_id: string
  sku?: string | null
  qty: number
  type: "issue" | "receipt" | "return" | "adjustment"
  related_doc?: string
  notes?: string | null
  created_at: string
}

export interface Invoice {
  id: string
  sales_order_id: string
  customer_id: string
  customer_name?: string
  customer_email?: string
  amount: number
  tax_amount?: number
  total_amount?: number
  due_date: string | null
  status: "unpaid" | "paid" | "partial" | "overdue"
  notes?: string | null
  created_at: string
  paid_at?: string | null
  items?: any[]
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  method: string
  date: string
  created_at: string
  notes?: string | null
}

// Source data types (from existing website)
export interface WebsiteOrder {
  id: string
  userId?: string
  customer_email: string
  items: any[]
  total: number
  processed?: boolean
  processed_at?: string
  created_at: string
}

export interface WebsiteReturn {
  id: string
  order_id: string
  items: any[]
  reason: string
  processed?: boolean
  processed_at?: string
  created_at: string
}

// ─── Manufacturing gap-fill types ────────────────────────────────────────────

export interface InventoryLayer {
  id: string
  sku: string
  receipt_date: string
  quantity_received: number
  quantity_remaining: number
  unit_cost: number
  reference_doc: string
  purchase_batch_id?: string | null
  source?: string | null
  source_id?: string | null
  created_at: string
}

export interface ScrapRecord {
  id: string
  work_order_id: string
  sku: string
  quantity: number
  unit_cost: number
  cost: number
  reason: string
  journal_entry_id?: string
  created_at: string
}

export interface ReworkOrder {
  id: string
  work_order_id: string
  reason: string
  additional_cost: number
  status: "open" | "completed"
  journal_entry_id?: string
  created_at: string
  completed_at?: string | null
}

export interface ChangeOrder {
  id: string
  contract_id: string
  description: string
  additional_revenue: number
  additional_cost: number
  status: "pending" | "approved" | "rejected"
  approved_at?: string | null
  journal_entry_id?: string
  created_at: string
}

export interface RetentionSchedule {
  id: string
  contract_id: string
  invoice_id: string
  customer_id: string
  total_invoice_amount: number
  retention_percentage: number
  retention_amount: number
  billed_amount: number
  status: "withheld" | "released" | "disputed"
  expected_release_date?: string | null
  actual_release_date?: string | null
  release_journal_entry_id?: string
  created_at: string
}

export interface BudgetLine {
  id: string
  fiscal_year_id: string
  period_number: number | null
  account_code: string
  budget_amount: number
  actual_amount: number
  created_at: string
  updated_at?: string
}
