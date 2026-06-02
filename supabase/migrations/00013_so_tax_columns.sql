-- Migration 00013: Add tax_amount to sales_orders for VAT tracking

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS tax_amount numeric(15,2) DEFAULT 0;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS subtotal numeric(15,2) DEFAULT 0;
