export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vendors: {
        Row: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; payment_terms: string | null; lead_time_days: number | null; notes: string | null; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; payment_terms?: string | null; lead_time_days?: number | null; notes?: string | null; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; payment_terms?: string | null; lead_time_days?: number | null; notes?: string | null; status?: string; created_at?: string; updated_at?: string }
      }
      chart_of_accounts: {
        Row: { code: string; name: string; name_ar: string | null; type: string; sub_type: string | null; normal_balance: string; parent_code: string | null; is_active: boolean; is_system_account: boolean; is_cash_flow_tracked: boolean; description: string | null; deprecated_reason: string | null; created_at: string }
        Insert: { code: string; name: string; name_ar?: string | null; type: string; sub_type?: string | null; normal_balance: string; parent_code?: string | null; is_active?: boolean; is_system_account?: boolean; is_cash_flow_tracked?: boolean; description?: string | null; deprecated_reason?: string | null; created_at?: string }
        Update: { code?: string; name?: string; name_ar?: string | null; type?: string; sub_type?: string | null; normal_balance?: string; parent_code?: string | null; is_active?: boolean; is_system_account?: boolean; is_cash_flow_tracked?: boolean; description?: string | null; deprecated_reason?: string | null; created_at?: string }
      }
      journal_entries: {
        Row: { id: string; entry_number: string | null; date: string; description: string | null; type: string | null; reference_id: string | null; reference_type: string | null; is_posted: boolean; created_by: string | null; account_ids: string[]; created_at: string; updated_at: string }
        Insert: { id?: string; entry_number?: string | null; date: string; description?: string | null; type?: string | null; reference_id?: string | null; reference_type?: string | null; is_posted?: boolean; created_by?: string | null; account_ids?: string[]; created_at?: string; updated_at?: string }
        Update: { id?: string; entry_number?: string | null; date?: string; description?: string | null; type?: string | null; reference_id?: string | null; reference_type?: string | null; is_posted?: boolean; created_by?: string | null; account_ids?: string[]; created_at?: string; updated_at?: string }
      }
      journal_entry_lines: {
        Row: { id: string; journal_entry_id: string; account_code: string; account_name: string | null; debit: number; credit: number; description: string | null; created_at: string }
        Insert: { id?: string; journal_entry_id: string; account_code: string; account_name?: string | null; debit?: number; credit?: number; description?: string | null; created_at?: string }
        Update: { id?: string; journal_entry_id?: string; account_code?: string; account_name?: string | null; debit?: number; credit?: number; description?: string | null; created_at?: string }
      }
      account_balances: {
        Row: { id: string; account_code: string; period_start: string; period_end: string; opening_balance: number; total_debits: number; total_credits: number; closing_balance: number; created_at: string; updated_at: string }
        Insert: { id?: string; account_code: string; period_start: string; period_end: string; opening_balance?: number; total_debits?: number; total_credits?: number; closing_balance?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; account_code?: string; period_start?: string; period_end?: string; opening_balance?: number; total_debits?: number; total_credits?: number; closing_balance?: number; created_at?: string; updated_at?: string }
      }
      sales_orders: {
        Row: { id: string; customer_id: string | null; customer_name: string | null; customer_email: string | null; customer_phone: string | null; customer_address: string | null; items: Json; status: string; total_amount: number; notes: string | null; shipping_address: string | null; website_order_id: string | null; processed: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; customer_id?: string | null; customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null; customer_address?: string | null; items?: Json; status?: string; total_amount?: number; notes?: string | null; shipping_address?: string | null; website_order_id?: string | null; processed?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; customer_id?: string | null; customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null; customer_address?: string | null; items?: Json; status?: string; total_amount?: number; notes?: string | null; shipping_address?: string | null; website_order_id?: string | null; processed?: boolean; created_at?: string; updated_at?: string }
      }
      work_orders: {
        Row: { id: string; sales_order_id: string | null; design_id: string | null; design_name: string | null; raw_materials_used: Json; materials_issued: Json; labor_hours: number; labor_cost: number; overhead_cost: number; total_cost: number; estimated_cost: number; status: string; assigned_worker: string | null; completion_percentage: number; notes: string | null; start_time: string | null; estimated_completion: string | null; completed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; sales_order_id?: string | null; design_id?: string | null; design_name?: string | null; raw_materials_used?: Json; materials_issued?: Json; labor_hours?: number; labor_cost?: number; overhead_cost?: number; total_cost?: number; estimated_cost?: number; status?: string; assigned_worker?: string | null; completion_percentage?: number; notes?: string | null; start_time?: string | null; estimated_completion?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; sales_order_id?: string | null; design_id?: string | null; design_name?: string | null; raw_materials_used?: Json; materials_issued?: Json; labor_hours?: number; labor_cost?: number; overhead_cost?: number; total_cost?: number; estimated_cost?: number; status?: string; assigned_worker?: string | null; completion_percentage?: number; notes?: string | null; start_time?: string | null; estimated_completion?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
      }
      inventory_items: {
        Row: { id: string; sku: string; name: string; type: string; unit: string; quantity_on_hand: number; cost_per_unit: number; reorder_level: number; supplier: string | null; location: string | null; description: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; sku: string; name: string; type: string; unit?: string; quantity_on_hand?: number; cost_per_unit?: number; reorder_level?: number; supplier?: string | null; location?: string | null; description?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; sku?: string; name?: string; type?: string; unit?: string; quantity_on_hand?: number; cost_per_unit?: number; reorder_level?: number; supplier?: string | null; location?: string | null; description?: string | null; created_at?: string; updated_at?: string }
      }
      inventory_movements: {
        Row: { id: string; item_id: string; sku: string | null; qty: number; type: string; related_doc: string | null; notes: string | null; created_at: string }
        Insert: { id?: string; item_id: string; sku?: string | null; qty: number; type: string; related_doc?: string | null; notes?: string | null; created_at?: string }
        Update: { id?: string; item_id?: string; sku?: string | null; qty?: number; type?: string; related_doc?: string | null; notes?: string | null; created_at?: string }
      }
      inventory_layers: {
        Row: { id: string; sku: string; purchase_batch_id: string | null; quantity: number; available_qty: number; unit_cost: number; source: string | null; source_id: string | null; created_at: string }
        Insert: { id?: string; sku: string; purchase_batch_id?: string | null; quantity?: number; available_qty?: number; unit_cost?: number; source?: string | null; source_id?: string | null; created_at?: string }
        Update: { id?: string; sku?: string; purchase_batch_id?: string | null; quantity?: number; available_qty?: number; unit_cost?: number; source?: string | null; source_id?: string | null; created_at?: string }
      }
      invoices: {
        Row: { id: string; sales_order_id: string | null; customer_id: string | null; customer_name: string | null; amount: number; due_date: string | null; status: string; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; sales_order_id?: string | null; customer_id?: string | null; customer_name?: string | null; amount?: number; due_date?: string | null; status?: string; notes?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; sales_order_id?: string | null; customer_id?: string | null; customer_name?: string | null; amount?: number; due_date?: string | null; status?: string; notes?: string | null; created_at?: string; updated_at?: string }
      }
      payments: {
        Row: { id: string; invoice_id: string | null; amount: number; method: string; notes: string | null; created_at: string }
        Insert: { id?: string; invoice_id?: string | null; amount: number; method: string; notes?: string | null; created_at?: string }
        Update: { id?: string; invoice_id?: string | null; amount?: number; method?: string; notes?: string | null; created_at?: string }
      }
      assets: {
        Row: { id: string; name: string; asset_code: string | null; category: string | null; purchase_date: string | null; purchase_cost: number | null; useful_life_years: number | null; salvage_value: number; depreciation_method: string; accumulated_depreciation: number; net_book_value: number | null; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; asset_code?: string | null; category?: string | null; purchase_date?: string | null; purchase_cost?: number | null; useful_life_years?: number | null; salvage_value?: number; depreciation_method?: string; accumulated_depreciation?: number; net_book_value?: number | null; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; asset_code?: string | null; category?: string | null; purchase_date?: string | null; purchase_cost?: number | null; useful_life_years?: number | null; salvage_value?: number; depreciation_method?: string; accumulated_depreciation?: number; net_book_value?: number | null; status?: string; created_at?: string; updated_at?: string }
      }
      designs: {
        Row: { id: string; name: string; description: string | null; category: string | null; subcategory: string | null; base_cost: number; material_cost: number; labor_cost: number; overhead_cost: number; suggested_retail_price: number; wholesale_price: number | null; manufacturing_time: number; complexity: string; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; description?: string | null; category?: string | null; subcategory?: string | null; base_cost?: number; material_cost?: number; labor_cost?: number; overhead_cost?: number; suggested_retail_price?: number; wholesale_price?: number | null; manufacturing_time?: number; complexity?: string; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; description?: string | null; category?: string | null; subcategory?: string | null; base_cost?: number; material_cost?: number; labor_cost?: number; overhead_cost?: number; suggested_retail_price?: number; wholesale_price?: number | null; manufacturing_time?: number; complexity?: string; status?: string; created_at?: string; updated_at?: string }
      }
      bom: {
        Row: { id: string; design_id: string; name: string; version: string; items: Json; labor_hours: number; notes: string | null; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; design_id: string; name: string; version?: string; items?: Json; labor_hours?: number; notes?: string | null; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; design_id?: string; name?: string; version?: string; items?: Json; labor_hours?: number; notes?: string | null; status?: string; created_at?: string; updated_at?: string }
      }
      purchase_orders: {
        Row: { id: string; vendor_id: string; vendor_name: string | null; items: Json; status: string; expected_delivery: string | null; shipping_address: string | null; notes: string | null; total_amount: number; created_at: string; updated_at: string }
        Insert: { id?: string; vendor_id: string; vendor_name?: string | null; items?: Json; status?: string; expected_delivery?: string | null; shipping_address?: string | null; notes?: string | null; total_amount?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; vendor_id?: string; vendor_name?: string | null; items?: Json; status?: string; expected_delivery?: string | null; shipping_address?: string | null; notes?: string | null; total_amount?: number; created_at?: string; updated_at?: string }
      }
      fiscal_years: {
        Row: { id: string; year: number; start_date: string; end_date: string; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; year: number; start_date: string; end_date: string; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; year?: number; start_date?: string; end_date?: string; status?: string; created_at?: string; updated_at?: string }
      }
      fiscal_periods: {
        Row: { id: string; fiscal_year_id: string; period_number: number; start_date: string; end_date: string; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; fiscal_year_id: string; period_number: number; start_date: string; end_date: string; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; fiscal_year_id?: string; period_number?: number; start_date?: string; end_date?: string; status?: string; created_at?: string; updated_at?: string }
      }
      manual_orders: {
        Row: { id: string; customer_name: string | null; items: Json; status: string; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; customer_name?: string | null; items?: Json; status?: string; notes?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; customer_name?: string | null; items?: Json; status?: string; notes?: string | null; created_at?: string; updated_at?: string }
      }
      scrap_records: {
        Row: { id: string; work_order_id: string | null; item_id: string | null; sku: string | null; quantity: number; reason: string | null; cost: number; created_at: string }
        Insert: { id?: string; work_order_id?: string | null; item_id?: string | null; sku?: string | null; quantity: number; reason?: string | null; cost?: number; created_at?: string }
        Update: { id?: string; work_order_id?: string | null; item_id?: string | null; sku?: string | null; quantity?: number; reason?: string | null; cost?: number; created_at?: string }
      }
      rework_orders: {
        Row: { id: string; work_order_id: string | null; reason: string | null; additional_cost: number; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; work_order_id?: string | null; reason?: string | null; additional_cost?: number; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; work_order_id?: string | null; reason?: string | null; additional_cost?: number; status?: string; created_at?: string; updated_at?: string }
      }
      change_orders: {
        Row: { id: string; contract_id: string | null; sales_order_id: string | null; description: string | null; additional_revenue: number; additional_cost: number; status: string; approved_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; contract_id?: string | null; sales_order_id?: string | null; description?: string | null; additional_revenue?: number; additional_cost?: number; status?: string; approved_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; contract_id?: string | null; sales_order_id?: string | null; description?: string | null; additional_revenue?: number; additional_cost?: number; status?: string; approved_at?: string | null; created_at?: string; updated_at?: string }
      }
      retention_schedules: {
        Row: { id: string; invoice_id: string | null; sales_order_id: string | null; retention_percent: number; retention_amount: number; release_date: string | null; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; invoice_id?: string | null; sales_order_id?: string | null; retention_percent?: number; retention_amount?: number; release_date?: string | null; status?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; invoice_id?: string | null; sales_order_id?: string | null; retention_percent?: number; retention_amount?: number; release_date?: string | null; status?: string; created_at?: string; updated_at?: string }
      }
      budget_lines: {
        Row: { id: string; fiscal_year_id: string; account_code: string; budget_amount: number; actual_amount: number; period_number: number | null; created_at: string; updated_at: string }
        Insert: { id?: string; fiscal_year_id: string; account_code: string; budget_amount?: number; actual_amount?: number; period_number?: number | null; created_at?: string; updated_at?: string }
        Update: { id?: string; fiscal_year_id?: string; account_code?: string; budget_amount?: number; actual_amount?: number; period_number?: number | null; created_at?: string; updated_at?: string }
      }
      overhead_config: {
        Row: { id: string; name: string | null; fiscal_year_id: string | null; estimated_total_overhead: number; estimated_activity_base: number; activity_base: string; predetermined_rate: number; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name?: string | null; fiscal_year_id?: string | null; estimated_total_overhead?: number; estimated_activity_base?: number; activity_base?: string; predetermined_rate?: number; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string | null; fiscal_year_id?: string | null; estimated_total_overhead?: number; estimated_activity_base?: number; activity_base?: string; predetermined_rate?: number; is_active?: boolean; created_at?: string; updated_at?: string }
      }
      standard_costs: {
        Row: { id: string; name: string | null; item_type: string | null; standard_material: number; standard_labor: number; standard_overhead: number; standard_total: number; is_active: boolean; effective_date: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name?: string | null; item_type?: string | null; standard_material?: number; standard_labor?: number; standard_overhead?: number; standard_total?: number; is_active?: boolean; effective_date?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string | null; item_type?: string | null; standard_material?: number; standard_labor?: number; standard_overhead?: number; standard_total?: number; is_active?: boolean; effective_date?: string | null; created_at?: string; updated_at?: string }
      }
      contracts: {
        Row: { id: string; contract_number: string | null; sales_order_id: string | null; customer_id: string | null; total_contract_value: number; costs_incurred: number; total_estimated_cost: number; completion_percent: number; revenue_recognized: number; status: string; start_date: string | null; end_date: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; contract_number?: string | null; sales_order_id?: string | null; customer_id?: string | null; total_contract_value?: number; costs_incurred?: number; total_estimated_cost?: number; completion_percent?: number; revenue_recognized?: number; status?: string; start_date?: string | null; end_date?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; contract_number?: string | null; sales_order_id?: string | null; customer_id?: string | null; total_contract_value?: number; costs_incurred?: number; total_estimated_cost?: number; completion_percent?: number; revenue_recognized?: number; status?: string; start_date?: string | null; end_date?: string | null; created_at?: string; updated_at?: string }
      }
      revenue_recognition: {
        Row: { id: string; contract_id: string | null; journal_entry_id: string | null; amount: number; percent_complete: number; period_end: string | null; created_at: string }
        Insert: { id?: string; contract_id?: string | null; journal_entry_id?: string | null; amount?: number; percent_complete?: number; period_end?: string | null; created_at?: string }
        Update: { id?: string; contract_id?: string | null; journal_entry_id?: string | null; amount?: number; percent_complete?: number; period_end?: string | null; created_at?: string }
      }
      exchange_rates: {
        Row: { id: string; from_currency: string; to_currency: string; rate: number; rate_date: string; source: string; created_at: string }
        Insert: { id?: string; from_currency?: string; to_currency?: string; rate: number; rate_date?: string; source?: string; created_at?: string }
        Update: { id?: string; from_currency?: string; to_currency?: string; rate?: number; rate_date?: string; source?: string; created_at?: string }
      }
      orders: {
        Row: { id: string; user_id: string | null; items: Json; status: string | null; total: number; shipping_address: Json | null; processed: boolean; processed_at: string | null; processing_error: string | null; last_processed_at: string | null; created_at: string; updated_at: string }
        Insert: { id: string; user_id?: string | null; items?: Json; status?: string | null; total?: number; shipping_address?: Json | null; processed?: boolean; processed_at?: string | null; processing_error?: string | null; last_processed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string | null; items?: Json; status?: string | null; total?: number; shipping_address?: Json | null; processed?: boolean; processed_at?: string | null; processing_error?: string | null; last_processed_at?: string | null; created_at?: string; updated_at?: string }
      }
      returns: {
        Row: { id: string; order_id: string | null; invoice_id: string | null; items: Json; refund_amount: number; status: string | null; processed: boolean; processed_at: string | null; created_at: string; updated_at: string }
        Insert: { id: string; order_id?: string | null; invoice_id?: string | null; items?: Json; refund_amount?: number; status?: string | null; processed?: boolean; processed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; order_id?: string | null; invoice_id?: string | null; items?: Json; refund_amount?: number; status?: string | null; processed?: boolean; processed_at?: string | null; created_at?: string; updated_at?: string }
      }
      products: {
        Row: { id: string; name: string | null; description: string | null; price: number | null; image_url: string | null; variants: Json; metadata: Json; created_at: string; updated_at: string }
        Insert: { id: string; name?: string | null; description?: string | null; price?: number | null; image_url?: string | null; variants?: Json; metadata?: Json; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string | null; description?: string | null; price?: number | null; image_url?: string | null; variants?: Json; metadata?: Json; created_at?: string; updated_at?: string }
      }
      website_users: {
        Row: { id: string; email: string | null; name: string | null; phone: string | null; metadata: Json; created_at: string; updated_at: string }
        Insert: { id: string; email?: string | null; name?: string | null; phone?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
        Update: { id?: string; email?: string | null; name?: string | null; phone?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
      }
      erp_user_profiles: {
        Row: { id: string; name: string; role: string; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id: string; name: string; role?: string; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; role?: string; is_active?: boolean; created_at?: string; updated_at?: string }
      }
    }
    Views: Record<string, never>
    Functions: {
      batch_insert: {
        Args: { p_table: string; p_rows: Json[] }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }
}
