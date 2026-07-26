-- Add tracking_code column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
