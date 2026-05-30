export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  created_at: Date
}

export interface ChartOfAccount {
  id: string
  name: string
  type: "asset" | "liability" | "equity" | "revenue" | "expense"
  parent_id?: string
}

export interface JournalEntry {
  id: string
  date: Date
  entries: {
    account_id: string
    debit: number
    credit: number
    description: string
  }[]
  linked_doc?: string
  created_at: Date
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
  created_at: Date
}

export interface WorkOrder {
  id: string
  sales_order_id: string
  design_id?: string // Reference to design configuration
  design_name?: string // Cached design name for display
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
  labor_cost: number // Cost per hour * hours
  overhead_cost: number
  total_cost: number // Calculated total cost
  estimated_cost: number // Estimated cost from design
  status: "pending" | "in_progress" | "completed"
  created_at: Date | any
  completed_at?: Date | any
  updated_at?: Date | any
  completionPercentage?: number
  assigned_worker?: string
  start_time?: Date | any
  estimated_completion?: Date | any
  notes?: string
  items?: any[] // Order items from sales order
  item_costs?: any[] // Calculated costs per item
  customer_name?: string // Fetched from customer collection
  customer_email?: string
  customer_phone?: string
  customer_address?: string
  total_amount?: number // Total order value from sales order
  order_status?: string // Status from sales order
  cost_override?: number
  cost_override_reason?: string
  cost_override_by?: string
}

export interface InventoryItem {
  id: string // SKU
  name: string
  type: "raw" | "finished"
  quantity_on_hand: number
  cost_per_unit: number
  created_at: Date | any
}

export interface InventoryMovement {
  id: string
  item_id: string
  qty: number
  type: "issue" | "receipt" | "return" | "adjustment"
  related_doc?: string
  created_at: Date | any
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
  due_date: Date | any
  status: "unpaid" | "paid" | "partial" | "overdue"
  created_at: Date | any
  paid_at?: Date | any
  items?: any[]
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  method: string
  date: Date
  created_at: Date
}

// Source data types (from existing website)
export interface WebsiteOrder {
  id: string
  userId?: string
  customer_email: string
  items: any[]
  total: number
  processed?: boolean
  processed_at?: Date
  created_at: Date
}

export interface WebsiteReturn {
  id: string
  order_id: string
  items: any[]
  reason: string
  processed?: boolean
  processed_at?: Date
  created_at: Date
}

// ─── Manufacturing gap-fill types ────────────────────────────────────────────

/**
 * FIFO inventory cost layer (IAS 2.25).
 * One document per receipt lot. Consumed in chronological order on issue.
 */
export interface InventoryLayer {
  id: string
  sku: string
  receiptDate: Date
  quantityReceived: number
  quantityRemaining: number  // decremented as material is issued
  unitCost: number           // cost at time of receipt (EGP)
  referenceDoc: string       // purchase order / receipt doc ID
  created_at: Date
}

/**
 * Scrap event during production.
 * Normal scrap → charged to job (product cost via WIP).
 * Abnormal scrap → period expense (DR Rework & Spoilage 6209).
 */
export interface ScrapRecord {
  id: string
  workOrderId: string
  sku: string
  quantityScrapped: number
  unitCost: number
  totalCost: number
  salvageValue: number       // recoverable amount credited to Scrap Inventory 1205
  isAbnormal: boolean        // true → expense, false → charged to job
  reason: string
  journalEntryId?: string
  created_at: Date
  created_by: string
}

/**
 * Rework order linked to an original work order.
 * Additional materials and labor consumed to correct defects.
 */
export interface ReworkOrder {
  id: string
  originalWorkOrderId: string
  reason: string
  additionalMaterialCost: number
  additionalLaborCost: number
  additionalOverheadCost: number
  totalReworkCost: number
  isNormalRework: boolean    // true → charged to job; false → period expense
  journalEntryId?: string
  status: "open" | "completed"
  created_at: Date
  completed_at?: Date
  created_by: string
}

/**
 * Contract modification record (IFRS 15.18–21).
 * Tracks original vs revised contract values and the accounting treatment applied.
 */
export interface ChangeOrder {
  id: string
  contractId: string
  description: string
  originalContractPrice: number
  revisedContractPrice: number
  originalEstimatedCost: number
  revisedEstimatedCost: number
  // IFRS 15 treatment applied
  treatment: "new_contract" | "cumulative_catchup" | "prospective"
  revenueAdjustment: number  // amount adjusted in the period of change
  journalEntryId?: string
  approvedBy: string
  created_at: Date
}

/**
 * Customer retention / holdback schedule.
 * Tracks amounts withheld by the customer until project sign-off.
 */
export interface RetentionSchedule {
  id: string
  contractId: string
  invoiceId: string
  customerId: string
  totalInvoiceAmount: number
  retentionPercentage: number  // e.g., 10 for 10%
  retentionAmount: number      // totalInvoiceAmount × retentionPercentage / 100
  billedAmount: number         // totalInvoiceAmount − retentionAmount
  status: "withheld" | "released" | "disputed"
  expectedReleaseDate?: Date
  actualReleaseDate?: Date
  releaseJournalEntryId?: string
  created_at: string
}

/**
 * Budget line for a single account in a single fiscal period.
 * Used for budget vs actual variance reporting.
 */
export interface BudgetLine {
  id: string
  fiscalYear: number
  period: number              // 1–12 (month), or 0 for annual
  accountCode: string
  accountName: string
  budgetedAmount: number      // EGP
  notes?: string
  created_at: string
  created_by: string
  updated_at?: string
}
