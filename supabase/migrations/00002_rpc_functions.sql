-- ============================================
-- RPC Functions — v2 (corrected)
-- Replaces Firestore db.batch() and db.runTransaction()
-- ============================================

-- Sequence for journal entry numbers (must exist before functions that reference it)
CREATE SEQUENCE IF NOT EXISTS public.journal_entry_seq;

-- ============================================
-- SECURITY: Allowed table whitelist for generic helpers
-- batch_insert / upsert_row accept a table name from the client.
-- Without a whitelist, any authenticated user could write to auth.users
-- or any other schema. This function enforces an allowlist.
-- ============================================
CREATE OR REPLACE FUNCTION public.assert_allowed_table(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allowed_tables text[] := ARRAY[
    'customers', 'vendors', 'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'account_balances', 'sales_orders', 'work_orders', 'inventory_items', 'inventory_movements',
    'inventory_layers', 'invoices', 'payments', 'assets', 'designs', 'bom', 'purchase_orders',
    'fiscal_years', 'fiscal_periods', 'manual_orders', 'scrap_records', 'rework_orders',
    'change_orders', 'retention_schedules', 'budget_lines', 'overhead_config', 'standard_costs',
    'contracts', 'revenue_recognition', 'exchange_rates', 'order_item_designs',
    'orders', 'returns', 'products', 'website_users', 'erp_user_profiles'
  ];
BEGIN
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not in the allowed list', p_table;
  END IF;
END;
$$;

-- ============================================
-- CREATE JOURNAL ENTRY (transactional)
-- Replaces: JournalEntryService.createJournalEntry() + db.runTransaction()
-- Validates balance, generates entry number, inserts header + lines,
-- upserts account_balance cache — all in one atomic operation.
-- ============================================
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_date          date,
  p_description   text,
  p_type          text,
  p_reference_id  text    DEFAULT NULL,
  p_reference_type text   DEFAULT NULL,
  p_lines         jsonb   DEFAULT '[]'::jsonb,
  p_created_by    uuid    DEFAULT NULL   -- FIX: was text, must be uuid to match journal_entries.created_by
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_entry_id      uuid;
  v_line          record;
  v_total_debit   numeric(15,2) := 0;
  v_total_credit  numeric(15,2) := 0;
  v_account_ids   text[] := '{}';
  v_entry_number  text;
  v_result        jsonb;
  v_normal_balance text;
  v_balance_delta numeric(15,2);
BEGIN
  -- Validate: at least 2 lines required for a valid journal entry
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry must have at least 2 lines';
  END IF;

  -- Calculate totals and collect account IDs
  FOR v_line IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(
      account_code text,
      account_name text,
      debit        numeric(15,2),
      credit       numeric(15,2),
      description  text
    )
  LOOP
    v_total_debit  := v_total_debit  + COALESCE(v_line.debit, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit, 0);
    v_account_ids  := array_append(v_account_ids, v_line.account_code);

    -- Validate account exists
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = v_line.account_code AND is_active = true) THEN
      RAISE EXCEPTION 'Account % not found or inactive', v_line.account_code;
    END IF;
  END LOOP;

  -- Validate balanced entry (allow tiny floating point tolerance)
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal entry is not balanced: debits=%, credits=%',
      v_total_debit, v_total_credit;
  END IF;

  -- Generate entry number
  -- FIX: nextval() returns bigint — no ::text cast before to_char()
  v_entry_number := 'JE-'
    || to_char(NOW(), 'YYYYMMDD')
    || '-'
    || to_char(nextval('public.journal_entry_seq'), 'FM00000');

  -- Insert journal entry header
  INSERT INTO journal_entries (
    entry_number, date, description, type,
    reference_id, reference_type, created_by, account_ids, is_posted
  ) VALUES (
    v_entry_number, p_date, p_description, p_type,
    p_reference_id, p_reference_type, p_created_by, v_account_ids, true
  ) RETURNING id INTO v_entry_id;

  -- Insert lines and update account balance cache
  FOR v_line IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(
      account_code text,
      account_name text,
      debit        numeric(15,2),
      credit       numeric(15,2),
      description  text
    )
  LOOP
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_code, account_name, debit, credit, description
    ) VALUES (
      v_entry_id, v_line.account_code, v_line.account_name,
      COALESCE(v_line.debit, 0), COALESCE(v_line.credit, 0), v_line.description
    );

    -- FIX: closing_balance must respect normal_balance direction.
    -- Debit-normal accounts (assets, expenses): balance increases with debits.
    -- Credit-normal accounts (liabilities, equity, revenue): balance increases with credits.
    SELECT normal_balance INTO v_normal_balance
    FROM chart_of_accounts
    WHERE code = v_line.account_code;

    v_balance_delta := CASE v_normal_balance
      WHEN 'debit'  THEN COALESCE(v_line.debit, 0) - COALESCE(v_line.credit, 0)
      WHEN 'credit' THEN COALESCE(v_line.credit, 0) - COALESCE(v_line.debit, 0)
      ELSE COALESCE(v_line.debit, 0) - COALESCE(v_line.credit, 0)
    END;

    -- Upsert account balance for the period
    INSERT INTO account_balances AS ab (
      account_code, period_start, period_end,
      opening_balance, total_debits, total_credits, closing_balance
    ) VALUES (
      v_line.account_code,
      date_trunc('month', p_date)::date,
      (date_trunc('month', p_date) + interval '1 month - 1 day')::date,
      0,  -- opening_balance: set properly via recalculate_opening_balances() below
      COALESCE(v_line.debit, 0),
      COALESCE(v_line.credit, 0),
      v_balance_delta
    )
    ON CONFLICT (account_code, period_end) DO UPDATE
    SET total_debits     = ab.total_debits  + EXCLUDED.total_debits,
        total_credits    = ab.total_credits + EXCLUDED.total_credits,
        closing_balance  = ab.closing_balance + v_balance_delta,
        updated_at       = now();
  END LOOP;

  SELECT jsonb_build_object(
    'id',           v_entry_id,
    'entry_number', v_entry_number,
    'date',         p_date,
    'description',  p_description,
    'type',         p_type,
    'total_debit',  v_total_debit,
    'total_credit', v_total_credit
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================
-- RECORD SALE (transactional)
-- Replaces: SalesAccountingService.recordSale() db.runTransaction()
-- Creates invoice, records revenue JE, optionally transfers WIP to COGS
-- ============================================
CREATE OR REPLACE FUNCTION public.record_sale(
  p_sales_order_id  uuid,
  p_customer_id     text,
  p_customer_name   text,
  p_amount          numeric(15,2),
  p_work_order_id   uuid    DEFAULT NULL,
  p_wip_cost        numeric(15,2) DEFAULT 0,
  p_created_by      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invoice_id  uuid;
  v_je_result   jsonb;
  v_lines       jsonb;
BEGIN
  -- Create invoice
  INSERT INTO invoices (sales_order_id, customer_id, customer_name, amount, status)
  VALUES (p_sales_order_id::text, p_customer_id, p_customer_name, p_amount, 'pending')
  RETURNING id INTO v_invoice_id;

  -- Revenue journal entry: Dr Accounts Receivable / Cr Revenue
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1100', 'account_name', 'Accounts Receivable',
                       'debit', p_amount, 'credit', 0, 'description', 'Sale to ' || p_customer_name),
    jsonb_build_object('account_code', '4000', 'account_name', 'Revenue',
                       'debit', 0, 'credit', p_amount, 'description', 'Sale to ' || p_customer_name)
  );

  v_je_result := public.create_journal_entry(
    CURRENT_DATE, 'Revenue: ' || p_customer_name,
    'revenue', p_sales_order_id::text, 'sales_order', v_lines, p_created_by
  );

  -- If WIP transfer needed: Dr COGS / Cr WIP
  IF p_work_order_id IS NOT NULL AND p_wip_cost > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5000', 'account_name', 'Cost of Goods Sold',
                         'debit', p_wip_cost, 'credit', 0, 'description', 'COGS transfer'),
      jsonb_build_object('account_code', '1400', 'account_name', 'Work In Progress',
                         'debit', 0, 'credit', p_wip_cost, 'description', 'WIP transfer to COGS')
    );

    PERFORM public.create_journal_entry(
      CURRENT_DATE, 'COGS transfer',
      'cogs', p_work_order_id::text, 'work_order', v_lines, p_created_by
    );

    -- Mark work order completed
    UPDATE work_orders SET status = 'completed', completed_at = now()
    WHERE id = p_work_order_id;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',    v_invoice_id,
    'journal_entry', v_je_result,
    'amount',        p_amount
  );
END;
$$;

-- ============================================
-- PROCESS RETURN (transactional)
-- Replaces: SalesAccountingService.processReturn() db.runTransaction()
-- Creates credit memo, restores inventory, posts reversal JE
-- ============================================
CREATE OR REPLACE FUNCTION public.process_return(
  p_return_id       text,
  p_invoice_id      uuid,
  p_refund_amount   numeric(15,2),
  p_items           jsonb DEFAULT '[]'::jsonb,  -- [{item_id, sku, qty}]
  p_created_by      uuid  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item    record;
  v_lines   jsonb;
  v_je      jsonb;
BEGIN
  -- Restore inventory for each returned item
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(
      item_id text, sku text, qty numeric(15,2)
    )
  LOOP
    UPDATE inventory_items
    SET quantity_on_hand = quantity_on_hand + v_item.qty,
        updated_at = now()
    WHERE id = v_item.item_id::uuid;

    INSERT INTO inventory_movements (item_id, sku, qty, type, related_doc, notes)
    VALUES (v_item.item_id::uuid, v_item.sku, v_item.qty, 'return', p_return_id, 'Customer return');
  END LOOP;

  -- Reversal journal entry: Dr Revenue / Cr Accounts Receivable
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '4000', 'account_name', 'Revenue',
                       'debit', p_refund_amount, 'credit', 0, 'description', 'Return credit memo'),
    jsonb_build_object('account_code', '1100', 'account_name', 'Accounts Receivable',
                       'debit', 0, 'credit', p_refund_amount, 'description', 'Return credit memo')
  );

  v_je := public.create_journal_entry(
    CURRENT_DATE, 'Customer return',
    'return', p_return_id, 'return', v_lines, p_created_by
  );

  -- Update return and invoice status
  UPDATE returns SET processed = true, processed_at = now(), status = 'completed'
  WHERE id = p_return_id;

  UPDATE invoices SET status = 'cancelled', updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('journal_entry', v_je, 'refund_amount', p_refund_amount);
END;
$$;

-- ============================================
-- ISSUE MATERIALS FOR WORK ORDER (transactional)
-- Replaces: WorkOrderMaterialService.issueMaterialsForWorkOrder() db.batch()
-- Decrements inventory, logs movements, updates work order
-- ============================================
CREATE OR REPLACE FUNCTION public.issue_materials_for_work_order(
  p_work_order_id uuid,
  p_materials     jsonb  -- [{item_id, sku, qty, unit_cost}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mat     record;
  v_total_cost numeric(15,2) := 0;
BEGIN
  FOR v_mat IN
    SELECT * FROM jsonb_to_recordset(p_materials) AS x(
      item_id text, sku text, qty numeric(15,2), unit_cost numeric(15,2)
    )
  LOOP
    -- Check stock
    IF (SELECT quantity_on_hand FROM inventory_items WHERE id = v_mat.item_id::uuid) < v_mat.qty THEN
      RAISE EXCEPTION 'Insufficient stock for SKU %: requested %, available %',
        v_mat.sku, v_mat.qty,
        (SELECT quantity_on_hand FROM inventory_items WHERE id = v_mat.item_id::uuid);
    END IF;

    -- Decrement stock
    UPDATE inventory_items
    SET quantity_on_hand = quantity_on_hand - v_mat.qty,
        updated_at = now()
    WHERE id = v_mat.item_id::uuid;

    -- Log movement
    INSERT INTO inventory_movements (item_id, sku, qty, type, related_doc, notes)
    VALUES (v_mat.item_id::uuid, v_mat.sku, v_mat.qty, 'issue', p_work_order_id::text, 'Issued to WO');

    v_total_cost := v_total_cost + (v_mat.qty * COALESCE(v_mat.unit_cost, 0));
  END LOOP;

  -- Update work order material cost
  UPDATE work_orders
  SET materials_issued = COALESCE(materials_issued, '[]'::jsonb) || p_materials,
      total_cost = total_cost + v_total_cost,
      updated_at = now()
  WHERE id = p_work_order_id;

  RETURN jsonb_build_object('work_order_id', p_work_order_id, 'total_material_cost', v_total_cost);
END;
$$;

-- ============================================
-- ISSUE FROM FIFO LAYERS (transactional)
-- Replaces: InventoryLayerService.issueFromFIFO() db.batch()
-- Consumes inventory layers in oldest-first order
-- ============================================
CREATE OR REPLACE FUNCTION public.issue_from_fifo(
  p_sku       text,
  p_qty_needed numeric(15,2),
  p_related_doc text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_layer       record;
  v_remaining   numeric(15,2) := p_qty_needed;
  v_take        numeric(15,2);
  v_total_cost  numeric(15,2) := 0;
BEGIN
  IF p_qty_needed <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  -- Consume layers oldest-first (FIFO)
  FOR v_layer IN
    SELECT * FROM inventory_layers
    WHERE sku = p_sku AND available_qty > 0
    ORDER BY created_at ASC
    FOR UPDATE  -- lock rows to prevent concurrent over-consumption
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_layer.available_qty, v_remaining);

    UPDATE inventory_layers
    SET available_qty = available_qty - v_take
    WHERE id = v_layer.id;

    v_total_cost := v_total_cost + (v_take * v_layer.unit_cost);
    v_remaining  := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient FIFO layers for SKU %: still need % units', p_sku, v_remaining;
  END IF;

  RETURN jsonb_build_object(
    'sku',            p_sku,
    'qty_issued',     p_qty_needed,
    'total_fifo_cost', v_total_cost,
    'avg_unit_cost',  ROUND(v_total_cost / p_qty_needed, 4)
  );
END;
$$;

-- ============================================
-- ACTIVATE BOM (transactional)
-- Replaces: BOMService.activateBOM() db.batch()
-- Archives all other BOMs for a design, activates the target one
-- ============================================
CREATE OR REPLACE FUNCTION public.activate_bom(
  p_bom_id    uuid,
  p_design_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Archive all active BOMs for this design
  UPDATE bom
  SET status = 'archived', updated_at = now()
  WHERE design_id = p_design_id AND status = 'active' AND id != p_bom_id;

  -- Activate the target BOM
  UPDATE bom
  SET status = 'active', updated_at = now()
  WHERE id = p_bom_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOM % not found', p_bom_id;
  END IF;
END;
$$;

-- ============================================
-- CREATE OVERHEAD CONFIG (transactional)
-- Replaces: OverheadService.createOverheadConfig() db.batch()
-- Deactivates existing config, creates new one atomically
-- ============================================
CREATE OR REPLACE FUNCTION public.create_overhead_config(
  p_name              text,
  p_fiscal_year_id    text,
  p_total_overhead    numeric(15,2),
  p_activity_base_qty numeric(15,2),
  p_activity_base     text DEFAULT 'labor_hours'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_rate    numeric(15,2);
  v_new_id  uuid;
BEGIN
  -- Deactivate existing configs for this fiscal year
  UPDATE overhead_config
  SET is_active = false, updated_at = now()
  WHERE fiscal_year_id = p_fiscal_year_id AND is_active = true;

  -- Calculate predetermined overhead rate
  IF p_activity_base_qty = 0 THEN
    RAISE EXCEPTION 'Activity base quantity cannot be zero';
  END IF;
  v_rate := ROUND(p_total_overhead / p_activity_base_qty, 4);

  -- Insert new active config
  INSERT INTO overhead_config (
    name, fiscal_year_id, estimated_total_overhead,
    estimated_activity_base, activity_base, predetermined_rate, is_active
  ) VALUES (
    p_name, p_fiscal_year_id, p_total_overhead,
    p_activity_base_qty, p_activity_base, v_rate, true
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================
-- RECORD PAYMENT (transactional)
-- Replaces: payments API route db.runTransaction()
-- ============================================
CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id  uuid,
  p_amount      numeric(15,2),
  p_method      text,
  p_notes       text    DEFAULT NULL,
  p_created_by  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payment_id  uuid;
  v_je          jsonb;
  v_lines       jsonb;
BEGIN
  -- Validate method
  IF p_method NOT IN ('cash', 'card', 'bank_transfer', 'mobile_payment', 'check') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_method;
  END IF;

  -- Insert payment record
  INSERT INTO payments (invoice_id, amount, method, notes)
  VALUES (p_invoice_id::text, p_amount, p_method, p_notes)
  RETURNING id INTO v_payment_id;

  -- Mark invoice paid
  UPDATE invoices SET status = 'paid', updated_at = now()
  WHERE id = p_invoice_id;

  -- Cash receipt journal entry: Dr Cash / Cr Accounts Receivable
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1000', 'account_name', 'Cash',
                       'debit', p_amount, 'credit', 0, 'description', 'Payment received'),
    jsonb_build_object('account_code', '1100', 'account_name', 'Accounts Receivable',
                       'debit', 0, 'credit', p_amount, 'description', 'Payment applied')
  );

  v_je := public.create_journal_entry(
    CURRENT_DATE, 'Payment received',
    'payment', p_payment_id::text, 'payment', v_lines, p_created_by
  );

  RETURN jsonb_build_object('payment_id', v_payment_id, 'journal_entry', v_je);
END;
$$;

-- ============================================
-- COMPLETE WORK ORDER (transactional)
-- Replaces: work-orders/complete API route db.runTransaction()
-- ============================================
CREATE OR REPLACE FUNCTION public.complete_work_order(
  p_work_order_id   uuid,
  p_actual_labor_hours numeric(15,2) DEFAULT 0,
  p_actual_labor_cost  numeric(15,2) DEFAULT 0,
  p_overhead_applied   numeric(15,2) DEFAULT 0,
  p_created_by         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_wo        record;
  v_total_cost numeric(15,2);
  v_lines      jsonb;
  v_je         jsonb;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order % not found', p_work_order_id;
  END IF;
  IF v_wo.status = 'completed' THEN
    RAISE EXCEPTION 'Work order % is already completed', p_work_order_id;
  END IF;

  v_total_cost := v_wo.total_cost + p_actual_labor_cost + p_overhead_applied;

  -- Update work order
  UPDATE work_orders
  SET status = 'completed',
      labor_hours = p_actual_labor_hours,
      labor_cost  = p_actual_labor_cost,
      overhead_cost = p_overhead_applied,
      total_cost  = v_total_cost,
      "completionPercentage" = 100,
      completed_at = now(),
      updated_at  = now()
  WHERE id = p_work_order_id;

  -- WIP accumulation journal entry: Dr WIP / Cr Various (labor + overhead)
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1400', 'account_name', 'Work In Progress',
                       'debit', v_total_cost, 'credit', 0, 'description', 'WO completion'),
    jsonb_build_object('account_code', '5100', 'account_name', 'Direct Labor',
                       'debit', 0, 'credit', p_actual_labor_cost, 'description', 'Labor applied'),
    jsonb_build_object('account_code', '5200', 'account_name', 'Manufacturing Overhead Applied',
                       'debit', 0, 'credit', p_overhead_applied, 'description', 'Overhead applied'),
    jsonb_build_object('account_code', '5000', 'account_name', 'Cost of Goods Sold',
                       'debit', 0, 'credit', v_wo.total_cost, 'description', 'Material cost to WIP')
  );

  v_je := public.create_journal_entry(
    CURRENT_DATE, 'Work order completion: ' || p_work_order_id::text,
    'manufacturing', p_work_order_id::text, 'work_order', v_lines, p_created_by
  );

  RETURN jsonb_build_object(
    'work_order_id', p_work_order_id,
    'total_cost',    v_total_cost,
    'journal_entry', v_je
  );
END;
$$;

-- ============================================
-- INITIALIZE CHART OF ACCOUNTS (batch)
-- Replaces: enhanced-accounting-service.ts initializeSystem() db.batch()
-- Safe to call multiple times (INSERT ... ON CONFLICT DO NOTHING)
-- ============================================
CREATE OR REPLACE FUNCTION public.initialize_chart_of_accounts(
  p_accounts jsonb  -- array of {code, name, name_ar, type, sub_type, normal_balance, parent_code, is_system_account}
)
RETURNS integer  -- number of accounts inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_account record;
  v_count   integer := 0;
BEGIN
  FOR v_account IN
    SELECT * FROM jsonb_to_recordset(p_accounts) AS x(
      code text, name text, name_ar text, type text,
      sub_type text, normal_balance text, parent_code text,
      is_system_account boolean, description text
    )
  LOOP
    INSERT INTO chart_of_accounts (
      code, name, name_ar, type, sub_type, normal_balance,
      parent_code, is_system_account, is_active, description
    ) VALUES (
      v_account.code, v_account.name, v_account.name_ar, v_account.type,
      v_account.sub_type, v_account.normal_balance,
      v_account.parent_code, COALESCE(v_account.is_system_account, false), true,
      v_account.description
    )
    ON CONFLICT (code) DO NOTHING;

    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================
-- NOTE: execute_batch and batch_insert REMOVED
-- These generic helpers are DANGEROUS — they execute arbitrary SQL
-- (execute_batch) or write to any table the caller names (batch_insert).
-- Even with SECURITY DEFINER, execute_batch lets any authenticated user run
-- DROP TABLE, SELECT * FROM auth.users, etc.
-- Replace all call sites with specific typed RPC functions above.
-- If you need a true generic batch insert in a controlled context,
-- use the Supabase Admin SDK server-side with the service_role key.
-- ============================================

-- ============================================
-- NOTE: upsert_row REMOVED
-- The dynamic SQL in upsert_row casts p_id (text) → id (uuid) implicitly
-- for most tables, but silently passes a string as PK for text-PK tables
-- (orders, returns, products, website_users). This asymmetry causes subtle
-- data corruption. Use supabase.from('table').upsert({...}) in TypeScript
-- instead — it's type-safe and goes through RLS normally.
-- ============================================