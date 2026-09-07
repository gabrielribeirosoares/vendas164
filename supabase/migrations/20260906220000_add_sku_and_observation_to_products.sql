-- Adicionar colunas de SKU e Observação na tabela de produtos
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS observation TEXT;

-- Criar índice para busca rápida por SKU
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
