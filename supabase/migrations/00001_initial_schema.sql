-- ============================================
-- AccuFinance: Firestore → Supabase Migration
-- All 34 tables, RLS policies, indexes, triggers
-- ============================================

-- Extension for auto-updating updated_at
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ============================================
-- HELPER: Auto-update updated_at trigger
-- =================================-----------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- 1. CUSTOMERS
-- ============================================
CREATE TABLE public.customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text,
  phone      text DEFAULT '',
  address    text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_email ON public.customers (email);

-- ============================================
-- 2. VENDORS
-- ============================================
CREATE TABLE public.vendors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contact_name    text,
  email           text,
  phone           text,
  address         text,
  payment_terms   text,
  lead_time_days  integer,
  notes           text,
  status          text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. CHART OF ACCOUNTS
-- ============================================
CREATE TABLE public.chart_of_accounts (
  code               text PRIMARY KEY,
  name               text NOT NULL,
  name_ar            text,
  type               text NOT NULL,
  sub_type           text,
  normal_balance     text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  parent_code        text,
  is_active          boolean DEFAULT true,
  is_system_account  boolean DEFAULT false,
  is_cash_flow_tracked boolean DEFAULT false,
  description        text,
  deprecated_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. JOURNAL ENTRIES
-- ============================================
CREATE TABLE public.journal_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number  text,
  date          date NOT NULL,
  description   text,
  type          text,
  reference_id  text,
  reference_type text,
  is_posted     boolean DEFAULT false,
  created_by    uuid,
  account_ids   text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_journal_entries_date ON public.journal_entries (date);
CREATE INDEX idx_journal_entries_type ON public.journal_entries (type);
CREATE INDEX idx_journal_entries_account_ids ON public.journal_entries USING gin (account_ids);
CREATE INDEX idx_journal_entries_reference ON public.journal_entries (reference_type, reference_id);

-- Journal entry lines (subcollection → child table)
CREATE TABLE public.journal_entry_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code     text NOT NULL REFERENCES public.chart_of_accounts(code),
  account_name     text,
  debit            numeric(15,2) DEFAULT 0,
  credit           numeric(15,2) DEFAULT 0,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_jel_entry_id ON public.journal_entry_lines (journal_entry_id);
CREATE INDEX idx_jel_account_code ON public.journal_entry_lines (account_code);

-- ============================================
-- 5. ACCOUNT BALANCES
-- ============================================
CREATE TABLE public.account_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code  text NOT NULL REFERENCES public.chart_of_accounts(code),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  opening_balance numeric(15,2) DEFAULT 0,
  total_debits  numeric(15,2) DEFAULT 0,
  total_credits numeric(15,2) DEFAULT 0,
  closing_balance numeric(15,2) DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_code, period_end)
);
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_balances_account ON public.account_balances (account_code, period_end);

-- ============================================
-- 6. SALES ORDERS
-- ============================================
CREATE TABLE public.sales_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      text,
  customer_name    text,
  customer_email   text,
  customer_phone   text,
  customer_address text,
  items            jsonb NOT NULL DEFAULT '[]',
  status           text DEFAULT 'pending',
  total_amount     numeric(15,2) DEFAULT 0,
  notes            text,
  shipping_address text,
  website_order_id text,
  order_source    text DEFAULT 'web',
  processed        boolean DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sales_orders_customer ON public.sales_orders (customer_id);
CREATE INDEX idx_sales_orders_status ON public.sales_orders (status);
CREATE INDEX idx_sales_orders_website ON public.sales_orders (website_order_id);

-- ============================================
-- 7. WORK ORDERS
-- ============================================
CREATE TABLE public.work_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id        text,
  design_id             text,
  design_name           text,
  raw_materials_used    jsonb DEFAULT '[]',
  materials_issued      jsonb DEFAULT '[]',
  labor_hours           numeric(10,2) DEFAULT 0,
  labor_cost            numeric(15,2) DEFAULT 0,
  overhead_cost         numeric(15,2) DEFAULT 0,
  total_cost            numeric(15,2) DEFAULT 0,
  estimated_cost        numeric(15,2) DEFAULT 0,
  status                text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_worker       text,
  completionPercentage  integer DEFAULT 0,
  notes                 text,
  start_time            timestamptz,
  estimated_completion  timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_work_orders_so ON public.work_orders (sales_order_id);
CREATE INDEX idx_work_orders_status ON public.work_orders (status);
CREATE INDEX idx_work_orders_design ON public.work_orders (design_id);

-- ============================================
-- 8. INVENTORY ITEMS
-- ============================================
CREATE TABLE public.inventory_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text NOT NULL UNIQUE,
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('raw', 'finished')),
  unit              text DEFAULT 'pcs',
  quantity_on_hand  numeric(15,2) DEFAULT 0,
  cost_per_unit     numeric(15,2) DEFAULT 0,
  reorder_level     numeric(15,2) DEFAULT 10,
  supplier          text,
  location          text,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_inventory_sku ON public.inventory_items (sku);
CREATE INDEX idx_inventory_type ON public.inventory_items (type);

-- ============================================
-- 9. INVENTORY MOVEMENTS
-- ============================================
CREATE TABLE public.inventory_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL,
  sku           text,
  qty           numeric(15,2) NOT NULL,
  type          text NOT NULL CHECK (type IN ('issue', 'receipt', 'return', 'adjustment')),
  related_doc   text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_movements_item ON public.inventory_movements (item_id);
CREATE INDEX idx_movements_type ON public.inventory_movements (type);
CREATE INDEX idx_movements_created ON public.inventory_movements (created_at);

-- ============================================
-- 10. INVENTORY LAYERS (FIFO)
-- ============================================
CREATE TABLE public.inventory_layers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text NOT NULL,
  purchase_batch_id text,
  quantity        numeric(15,2) DEFAULT 0,
  available_qty   numeric(15,2) DEFAULT 0,
  unit_cost       numeric(15,2) DEFAULT 0,
  source          text,
  source_id       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_layers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_layers_sku ON public.inventory_layers (sku);
CREATE INDEX idx_layers_batch ON public.inventory_layers (purchase_batch_id);

-- ============================================
-- 11. INVOICES
-- ============================================
CREATE TABLE public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  text,
  customer_id     text,
  customer_name   text,
  amount          numeric(15,2) DEFAULT 0,
  due_date        date,
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_so ON public.invoices (sales_order_id);
CREATE INDEX idx_invoices_status ON public.invoices (status);

-- ============================================
-- 12. PAYMENTS
-- ============================================
CREATE TABLE public.payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    text,
  amount        numeric(15,2) NOT NULL,
  method        text NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'mobile_payment', 'check')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_invoice ON public.payments (invoice_id);

-- ============================================
-- 13. ASSETS
-- ============================================
CREATE TABLE public.assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  asset_code         text,
  category           text,
  purchase_date      date,
  purchase_cost      numeric(15,2),
  useful_life_years  integer,
  salvage_value      numeric(15,2) DEFAULT 0,
  depreciation_method text DEFAULT 'straight_line',
  accumulated_depreciation numeric(15,2) DEFAULT 0,
  net_book_value     numeric(15,2),
  status             text DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'impaired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 14. DESIGNS
-- ============================================
CREATE TABLE public.designs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  description           text,
  category              text,
  subcategory           text,
  base_cost             numeric(15,2) DEFAULT 0,
  material_cost         numeric(15,2) DEFAULT 0,
  labor_cost            numeric(15,2) DEFAULT 0,
  overhead_cost         numeric(15,2) DEFAULT 0,
  suggested_retail_price numeric(15,2) DEFAULT 0,
  wholesale_price       numeric(15,2),
  manufacturing_time    numeric(10,2) DEFAULT 1,
  complexity            text DEFAULT 'medium' CHECK (complexity IN ('low', 'medium', 'high')),
  status                text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 15. BOM (Bill of Materials)
-- ============================================
CREATE TABLE public.bom (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   text NOT NULL,
  name        text NOT NULL,
  version     text DEFAULT '1.0',
  items       jsonb NOT NULL DEFAULT '[]',
  labor_hours numeric(10,2) DEFAULT 0,
  notes       text,
  status      text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bom ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bom_design ON public.bom (design_id);

-- ============================================
-- 16. PURCHASE ORDERS
-- ============================================
CREATE TABLE public.purchase_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          text NOT NULL,
  vendor_name        text,
  items              jsonb NOT NULL DEFAULT '[]',
  status             text DEFAULT 'draft',
  expected_delivery  date,
  shipping_address   text,
  notes              text,
  total_amount       numeric(15,2) DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_po_vendor ON public.purchase_orders (vendor_id);
CREATE INDEX idx_po_status ON public.purchase_orders (status);

-- ============================================
-- 17. FISCAL YEARS
-- ============================================
CREATE TABLE public.fiscal_years (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        integer NOT NULL UNIQUE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 18. FISCAL PERIODS
-- ============================================
CREATE TABLE public.fiscal_periods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id text NOT NULL,
  period_number  integer NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 19. MANUAL ORDERS
-- ============================================
CREATE TABLE public.manual_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text,
  items       jsonb DEFAULT '[]',
  status      text DEFAULT 'pending',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manual_orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 20. SCRAP RECORDS
-- ============================================
CREATE TABLE public.scrap_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   text,
  item_id         text,
  sku             text,
  quantity        numeric(15,2),
  reason          text,
  cost            numeric(15,2) DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scrap_records ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 21. REWORK ORDERS
-- ============================================
CREATE TABLE public.rework_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   text,
  reason          text,
  additional_cost numeric(15,2) DEFAULT 0,
  status          text DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rework_orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 22. CHANGE ORDERS (IFRS 15 contract modifications)
-- ============================================
CREATE TABLE public.change_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       text,
  sales_order_id    text,
  description       text,
  additional_revenue numeric(15,2) DEFAULT 0,
  additional_cost   numeric(15,2) DEFAULT 0,
  status            text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 23. RETENTION SCHEDULES
-- ============================================
CREATE TABLE public.retention_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        text,
  sales_order_id    text,
  retention_percent numeric(5,2),
  retention_amount  numeric(15,2),
  release_date      date,
  status            text DEFAULT 'held' CHECK (status IN ('held', 'released')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retention_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 24. BUDGET LINES
-- ============================================
CREATE TABLE public.budget_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id text NOT NULL,
  account_code  text NOT NULL REFERENCES public.chart_of_accounts(code),
  budget_amount numeric(15,2) DEFAULT 0,
  actual_amount numeric(15,2) DEFAULT 0,
  period_number integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 25. OVERHEAD CONFIG
-- ============================================
CREATE TABLE public.overhead_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text,
  fiscal_year_id      text,
  estimated_total_overhead numeric(15,2) DEFAULT 0,
  estimated_activity_base numeric(15,2) DEFAULT 0,
  activity_base       text DEFAULT 'labor_hours' CHECK (activity_base IN ('labor_hours', 'machine_hours', 'units', 'material_cost')),
  predetermined_rate   numeric(15,2) DEFAULT 0,
  is_active           boolean DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overhead_config ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 26. STANDARD COSTS
-- ============================================
CREATE TABLE public.standard_costs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text,
  item_type            text,
  standard_material    numeric(15,2) DEFAULT 0,
  standard_labor       numeric(15,2) DEFAULT 0,
  standard_overhead    numeric(15,2) DEFAULT 0,
  standard_total       numeric(15,2) DEFAULT 0,
  is_active            boolean DEFAULT false,
  effective_date       date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.standard_costs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 27. CONTRACTS (IFRS 15)
-- ============================================
CREATE TABLE public.contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number     text,
  sales_order_id      text,
  customer_id         text,
  total_contract_value numeric(15,2) DEFAULT 0,
  costs_incurred      numeric(15,2) DEFAULT 0,
  total_estimated_cost numeric(15,2) DEFAULT 0,
  completion_percent  numeric(5,2) DEFAULT 0,
  revenue_recognized  numeric(15,2) DEFAULT 0,
  status              text DEFAULT 'in_progress',
  start_date          date,
  end_date            date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 28. REVENUE RECOGNITION
-- ============================================
CREATE TABLE public.revenue_recognition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   text,
  journal_entry_id uuid,
  amount        numeric(15,2) DEFAULT 0,
  percent_complete numeric(5,2) DEFAULT 0,
  period_end    date,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_recognition ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 29. EXCHANGE RATES (IAS 21)
-- ============================================
CREATE TABLE public.exchange_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency   text NOT NULL DEFAULT 'USD',
  to_currency     text NOT NULL DEFAULT 'EGP',
  rate            numeric(15,6) NOT NULL,
  rate_date       date NOT NULL DEFAULT now(),
  source          text DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fx_date ON public.exchange_rates (rate_date);
CREATE UNIQUE INDEX idx_fx_unique ON public.exchange_rates (from_currency, to_currency, rate_date);

-- ============================================
-- 30. ORDERS (external website)
-- ============================================
CREATE TABLE public.orders (
  id             text PRIMARY KEY,
  user_id        text,
  items          jsonb DEFAULT '[]',
  status         text,
  total          numeric(15,2) DEFAULT 0,
  shipping_address jsonb,
  processed      boolean DEFAULT false,
  processed_at   timestamptz,
  processing_error text,
  last_processed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_processed ON public.orders (processed) WHERE processed = false;
CREATE INDEX idx_orders_user ON public.orders (user_id);

-- ============================================
-- 31. RETURNS (external website)
-- ============================================
CREATE TABLE public.returns (
  id             text PRIMARY KEY,
  order_id       text,
  invoice_id     text,
  items          jsonb DEFAULT '[]',
  refund_amount  numeric(15,2) DEFAULT 0,
  status         text,
  processed      boolean DEFAULT false,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_returns_processed ON public.returns (processed) WHERE processed = false;

-- ============================================
-- 32. PRODUCTS (external website)
-- ============================================
CREATE TABLE public.products (
  id          text PRIMARY KEY,
  name        text,
  description text,
  price       numeric(15,2),
  image_url   text,
  variants    jsonb DEFAULT '[]',
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 33. WEBSITE USERS (external website)
-- ============================================
CREATE TABLE public.website_users (
  id          text PRIMARY KEY,
  email       text,
  name        text,
  phone       text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.website_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 34. ERP USERS (now managed via Supabase Auth metadata)
-- ============================================
CREATE TABLE public.erp_user_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'accountant', 'warehouse', 'sales', 'production', 'viewer')),
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 35. ORDER ITEM DESIGNS (links website orders to designs/work-orders)
-- ============================================
CREATE TABLE public.order_item_designs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        text NOT NULL,
  order_item_id   text NOT NULL,
  design_id       uuid REFERENCES public.designs(id) ON DELETE SET NULL,
  work_order_id   uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  size            text,
  quantity        integer DEFAULT 1,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_item_designs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_oid_order ON public.order_item_designs(order_id);
CREATE INDEX idx_oid_design ON public.order_item_designs(design_id);
CREATE INDEX idx_oid_work_order ON public.order_item_designs(work_order_id);

-- ============================================
-- RLS POLICIES
-- Service role bypasses RLS entirely.
-- Authenticated users get read access to most tables.
-- Write access is controlled by API route authorization.
-- ============================================

-- Helper: create standard RLS policies for a table
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'customers', 'vendors', 'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'account_balances', 'sales_orders', 'work_orders', 'inventory_items', 'inventory_movements',
    'inventory_layers', 'invoices', 'payments', 'assets', 'designs', 'bom', 'purchase_orders',
    'fiscal_years', 'fiscal_periods', 'manual_orders', 'scrap_records', 'rework_orders',
    'change_orders', 'retention_schedules', 'budget_lines', 'overhead_config', 'standard_costs',
    'contracts', 'revenue_recognition', 'exchange_rates', 'order_item_designs',
    'orders', 'returns', 'products', 'website_users'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Authenticated users can select
    EXECUTE format(
      'CREATE POLICY "authenticated_select" ON public.%I FOR SELECT TO authenticated USING (true)',
      tbl
    );
    -- Authenticated users can insert (API routes serve as gatekeepers)
    EXECUTE format(
      'CREATE POLICY "authenticated_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      tbl
    );
    -- Authenticated users can update
    EXECUTE format(
      'CREATE POLICY "authenticated_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
    -- Authenticated users can delete
    EXECUTE format(
      'CREATE POLICY "authenticated_delete" ON public.%I FOR DELETE TO authenticated USING (true)',
      tbl
    );
  END LOOP;
END $$;

-- erp_user_profiles: users can read/edit their own profile
-- Admin check uses a SECURITY DEFINER function to prevent infinite recursion
CREATE OR REPLACE FUNCTION public.is_erp_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
$$;

CREATE POLICY "select own profile" ON public.erp_user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "update own profile" ON public.erp_user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "admin_all_profiles" ON public.erp_user_profiles FOR ALL TO authenticated USING (public.is_erp_admin());
CREATE POLICY "admin_delete_profiles" ON public.erp_user_profiles FOR DELETE TO authenticated USING (public.is_erp_admin());

-- ============================================
-- TRIGGERS: auto-update updated_at on every table
-- ============================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'customers', 'vendors', 'journal_entries', 'account_balances', 'sales_orders', 'work_orders',
    'inventory_items', 'invoices', 'assets', 'designs', 'bom', 'purchase_orders',
    'fiscal_years', 'fiscal_periods', 'manual_orders', 'rework_orders', 'change_orders',
    'retention_schedules', 'budget_lines', 'overhead_config', 'standard_costs', 'contracts',
    'orders', 'returns', 'products', 'website_users', 'erp_user_profiles', 'order_item_designs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================
CREATE INDEX idx_customers_name_search ON public.customers USING gin (to_tsvector('english', name));
CREATE INDEX idx_inventory_name_search ON public.inventory_items USING gin (to_tsvector('english', name));
CREATE INDEX idx_designs_name_search ON public.designs USING gin (to_tsvector('english', name));
CREATE INDEX idx_vendors_name_search ON public.vendors USING gin (to_tsvector('english', name));

-- ============================================
-- FOREIGN KEY CONSTRAINTS (post-table-creation ALTERs)
-- ============================================
ALTER TABLE public.journal_entries
  ADD CONSTRAINT fk_je_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT fk_movement_item FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;

-- ============================================
-- ADDITIONAL INDEXES
-- ============================================
CREATE INDEX idx_fiscal_periods_year ON public.fiscal_periods(fiscal_year_id);
CREATE INDEX idx_budget_lines_year_account ON public.budget_lines(fiscal_year_id, account_code);
CREATE INDEX idx_fx_range ON public.exchange_rates(from_currency, to_currency, rate_date DESC);
