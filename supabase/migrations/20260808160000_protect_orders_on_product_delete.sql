-- ============================================================
-- MIGRAÇÃO: Proteger registros de orders quando produto é deletado
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar colunas de snapshot do produto na order (para uso quando produto for deletado)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_model TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_brand TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_image_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_scale TEXT;

-- 2. Popular snapshot nos pedidos existentes que já têm produto
UPDATE public.orders o
SET
  product_model = p.model,
  product_brand = p.brand,
  product_image_url = p.image_url,
  product_scale = p.scale
FROM public.products p
WHERE o.product_id = p.id
  AND o.product_model IS NULL;

-- 3. Mudar FK de CASCADE para SET NULL
-- (Quando lojista deletar o produto, a order fica com product_id = NULL mas não some)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_product_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE SET NULL;

-- 4. Criar trigger para capturar snapshot ao inserir/atualizar orders
CREATE OR REPLACE FUNCTION public.snapshot_product_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT model, brand, image_url, scale INTO p
    FROM public.products WHERE id = NEW.product_id;
    IF FOUND THEN
      NEW.product_model := COALESCE(NEW.product_model, p.model);
      NEW.product_brand := COALESCE(NEW.product_brand, p.brand);
      NEW.product_image_url := COALESCE(NEW.product_image_url, p.image_url);
      NEW.product_scale := COALESCE(NEW.product_scale, p.scale);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_snapshot_product_on_order ON public.orders;
CREATE TRIGGER trg_snapshot_product_on_order
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_product_on_order();

-- Verificação
SELECT id, product_id, product_model, product_brand, delivery_status
FROM public.orders
ORDER BY created_at DESC LIMIT 10;
