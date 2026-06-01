-- ============================================
-- 00007: FK type fixes + completionPercentage rename
-- ============================================

-- ============================================
-- Helper: Safe cast text to UUID (null for invalid)
-- ============================================
CREATE OR REPLACE FUNCTION public.safe_uuid(v text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN v::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ============================================
-- 1. sales_orders.customer_id: text → uuid + FK → customers.id
-- ============================================
ALTER TABLE public.sales_orders
  ALTER COLUMN customer_id TYPE uuid USING public.safe_uuid(customer_id);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_so_customer FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE SET NULL;

-- ============================================
-- 2. work_orders.sales_order_id: text → uuid + FK → sales_orders.id
-- ============================================
ALTER TABLE public.work_orders
  ALTER COLUMN sales_order_id TYPE uuid USING public.safe_uuid(sales_order_id);

ALTER TABLE public.work_orders
  ADD CONSTRAINT fk_wo_sales_order FOREIGN KEY (sales_order_id)
  REFERENCES public.sales_orders(id) ON DELETE SET NULL;

-- ============================================
-- 3. invoices.sales_order_id: text → uuid + FK → sales_orders.id
-- ============================================
ALTER TABLE public.invoices
  ALTER COLUMN sales_order_id TYPE uuid USING public.safe_uuid(sales_order_id);

ALTER TABLE public.invoices
  ADD CONSTRAINT fk_inv_sales_order FOREIGN KEY (sales_order_id)
  REFERENCES public.sales_orders(id) ON DELETE SET NULL;

-- ============================================
-- 4. invoices.customer_id: text → uuid + FK → customers.id
-- ============================================
ALTER TABLE public.invoices
  ALTER COLUMN customer_id TYPE uuid USING public.safe_uuid(customer_id);

ALTER TABLE public.invoices
  ADD CONSTRAINT fk_inv_customer FOREIGN KEY (customer_id)
  REFERENCES public.customers(id) ON DELETE SET NULL;

-- ============================================
-- 5. payments.invoice_id: text → uuid + FK → invoices.id
-- ============================================
ALTER TABLE public.payments
  ALTER COLUMN invoice_id TYPE uuid USING public.safe_uuid(invoice_id);

ALTER TABLE public.payments
  ADD CONSTRAINT fk_pmt_invoice FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id) ON DELETE SET NULL;

-- ============================================
-- 6. Rename work_orders.completionPercentage → completion_percentage
--    (CamelCase anti-pattern → proper snake_case)
-- ============================================
ALTER TABLE public.work_orders
  RENAME COLUMN completionpercentage TO completion_percentage;

ALTER TABLE public.work_orders
  ALTER COLUMN completion_percentage SET DEFAULT 0;

-- ============================================
-- Cleanup: Drop helper function
-- ============================================
DROP FUNCTION IF EXISTS public.safe_uuid(text);
