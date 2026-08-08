-- ============================================================
-- SCRIPT DE REPARO: initial_stock dos produtos existentes
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar coluna se não existir
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS initial_stock INTEGER;

-- 2. Corrigir produtos existentes: initial_stock = estoque atual + reservas ativas
UPDATE public.products p
SET initial_stock = p.stock + (
  SELECT COUNT(*)
  FROM public.orders o
  WHERE o.product_id = p.id
    AND o.payment_status != 'cancelado'
    AND o.delivery_status != 'cancelado'
)
WHERE p.initial_stock IS NULL OR p.initial_stock = p.stock;

-- 3. Atualizar a função de reserva para capturar initial_stock ANTES do decremento
CREATE OR REPLACE FUNCTION public.create_reservation(_product_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  new_id UUID;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF NOT p.is_open THEN RAISE EXCEPTION 'presale_closed'; END IF;
  IF p.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  UPDATE public.products 
  SET 
    -- initial_stock usa o valor atual de stock (ANTES do decremento)
    initial_stock = COALESCE(initial_stock, stock),
    stock = stock - 1,
    is_open = CASE WHEN stock - 1 <= 0 THEN false ELSE is_open END
  WHERE id = _product_id;

  INSERT INTO public.orders (user_id, product_id, store_id, total_price, reservation_expires_at)
  VALUES (uid, _product_id, p.store_id, p.price, now() + (p.payment_deadline_hours || ' hours')::interval)
  RETURNING id INTO new_id;
  INSERT INTO public.customer_store_link (user_id, store_id) VALUES (uid, p.store_id) ON CONFLICT DO NOTHING;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_reservation(UUID) TO authenticated, service_role;

-- 4. Verificação: mostrar os produtos com initial_stock
SELECT id, model, stock, initial_stock FROM public.products ORDER BY created_at DESC LIMIT 20;
