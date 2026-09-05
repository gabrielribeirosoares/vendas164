-- 1. Atualizar função is_store_owner para incluir SuperAdmins da plataforma
CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id UUID := auth.uid();
  user_email TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Checar se é admin pelo ID fixo ou pelo email
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  IF current_user_id = '5fb17599-28a0-4c1c-92cf-38176f7d57a2'::uuid 
     OR user_email ILIKE '%gabrielribeirosoares@hotmail.com%'
     OR user_email ILIKE '%triade%' THEN
    RETURN TRUE;
  END IF;

  -- Checar se é o dono da loja
  RETURN EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = _store_id AND s.owner_id = current_user_id
  );
END;
$$;

-- 2. Atualizar políticas da tabela 'orders' para usar is_store_owner (permite dono e admin criarem/editarem pedidos)
DROP POLICY IF EXISTS "Store owners can manage orders for their store" ON public.orders;
CREATE POLICY "Store owners can manage orders for their store"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_store_owner(store_id))
WITH CHECK (public.is_store_owner(store_id));

-- 3. Atualizar políticas da tabela 'customer_store_link' para usar is_store_owner
DROP POLICY IF EXISTS "Store owners can manage customer_store_link" ON public.customer_store_link;
CREATE POLICY "Store owners can manage customer_store_link"
ON public.customer_store_link
FOR ALL
TO authenticated
USING (public.is_store_owner(store_id))
WITH CHECK (public.is_store_owner(store_id));
