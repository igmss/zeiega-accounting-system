-- ============================================
-- 00008: BOM cost columns + wo_number on work_orders
-- Fixes BOM-1: bom table missing cost columns
-- Fixes SCH-4: work_orders missing wo_number column
-- ============================================

-- Add cost columns to bom table
ALTER TABLE public.bom
  ADD COLUMN IF NOT EXISTS design_name          text,
  ADD COLUMN IF NOT EXISTS labor_rate            numeric(15,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS labor_cost            numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_percentage   numeric(5,2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS total_material_cost   numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_labor_cost      numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overhead_cost   numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost            numeric(15,2) DEFAULT 0;

-- Add wo_number to work_orders for human-readable IDs
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS wo_number text;
