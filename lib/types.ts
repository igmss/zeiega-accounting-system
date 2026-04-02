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
