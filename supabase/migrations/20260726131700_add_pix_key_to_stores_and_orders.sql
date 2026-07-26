-- Add pix_key column to stores and orders tables
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_key TEXT;
