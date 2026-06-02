-- Migration 00014: Add paid_amount and po_number to purchase_orders

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS paid_amount numeric(15,2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_number text;
