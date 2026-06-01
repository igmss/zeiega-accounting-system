-- ============================================
-- 00006: Add missing columns to designs and work_orders
-- Aligns DB schema with service-layer expectations
-- All statements use IF NOT EXISTS for idempotency
-- ============================================

-- Extend designs table (idempotent; most were added in 00005)
ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS total_cost                numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image                     text,
  ADD COLUMN IF NOT EXISTS images                    jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS materials                 jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS processes                 jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS variants                  jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tags                      jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes                     text,
  ADD COLUMN IF NOT EXISTS size_costs                jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product_id                text,
  ADD COLUMN IF NOT EXISTS name_lower                text,
  ADD COLUMN IF NOT EXISTS category_lower            text,
  ADD COLUMN IF NOT EXISTS size_configurations       jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS size_ranges               jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS default_size_multipliers  jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by                text,
  ADD COLUMN IF NOT EXISTS updated_by                text;

-- GIN index on product_id for fast product import deduplication lookups
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_designs_product_id_gin
  ON public.designs USING gin (product_id gin_trgm_ops);

-- Extend work_orders table
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS item_costs       jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS items            jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS bom_id           text,
  ADD COLUMN IF NOT EXISTS customer_name    text,
  ADD COLUMN IF NOT EXISTS customer_email   text,
  ADD COLUMN IF NOT EXISTS customer_phone   text,
  ADD COLUMN IF NOT EXISTS customer_address text,
  ADD COLUMN IF NOT EXISTS total_amount     numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_status     text;
