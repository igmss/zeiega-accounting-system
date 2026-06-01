-- Migration 00010: Add readable order_number and invoice_number columns

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS order_number text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE INDEX IF NOT EXISTS idx_so_order_number ON public.sales_orders (order_number);
CREATE INDEX IF NOT EXISTS idx_inv_invoice_number ON public.invoices (invoice_number);
