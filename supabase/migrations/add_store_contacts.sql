-- Adiciona colunas para os meios de contato personalizados da loja
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS contact_email text,
ADD COLUMN IF NOT EXISTS contact_instagram text;
