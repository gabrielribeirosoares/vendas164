ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS default_installment_due_day INT NULL;
