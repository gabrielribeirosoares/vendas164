-- Adicionar novas colunas de parcelamento na tabela de produtos (products)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_installments INTEGER DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_2x NUMERIC;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS installment_price NUMERIC;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_installment_surcharge BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS payment_deadline_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS down_payment_amount NUMERIC DEFAULT 0;
