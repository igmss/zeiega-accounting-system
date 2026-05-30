-- ============================================
-- Add missing columns to manual_orders
-- ============================================
ALTER TABLE public.manual_orders
  ADD COLUMN IF NOT EXISTS carrier          text,
  ADD COLUMN IF NOT EXISTS fragrance_codes  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_method   text,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_method  text,
  ADD COLUMN IF NOT EXISTS total            numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tracking_number  text,
  ADD COLUMN IF NOT EXISTS user_id          text,
  ADD COLUMN IF NOT EXISTS order_source     text DEFAULT 'manual';

-- ============================================
-- Add missing order_source column to sales_orders
-- ============================================
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'web';
