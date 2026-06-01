-- Migration 00011: Payment tracking fixes
-- 1. Add 'partial' to invoices status CHECK (required for partial payments)
-- 2. Add payment_number and reference_number to payments table
-- 3. Add date column to payments (user-specified payment date)

-- Fix invoices status CHECK to allow partial payments
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'paid', 'partial', 'overdue', 'cancelled'));

-- Add readable payment_number to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_number text;

-- Add reference_number column (was being stuffed into notes)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reference_number text;

-- Add user-specified payment date
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS date date;

CREATE INDEX IF NOT EXISTS idx_payments_number ON public.payments (payment_number);
