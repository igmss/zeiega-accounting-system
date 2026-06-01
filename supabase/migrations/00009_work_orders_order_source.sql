-- Migration 00009: Add missing columns to work_orders used by application code

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS order_source text;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS material_cost numeric(15,2) DEFAULT 0;
