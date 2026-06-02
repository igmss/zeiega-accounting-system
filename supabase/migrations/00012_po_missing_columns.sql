-- Migration 00012: Add missing purchase_order columns

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal        numeric(15,2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS tax_amount      numeric(15,2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS shipping_cost   numeric(15,2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS actual_delivery  date;
