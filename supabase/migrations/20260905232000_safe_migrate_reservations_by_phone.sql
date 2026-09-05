-- RPC Segura para migrar reservas de convidados (GUEST) para o cliente quando ele informa o WhatsApp
DROP FUNCTION IF EXISTS public.migrate_reservations_by_phone(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.migrate_reservations_by_phone(p_new_user_id UUID, p_phone TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_phone TEXT;
  v_short_phone TEXT;
  v_migrated_count INTEGER := 0;
  v_store_id UUID;
BEGIN
  -- Segurança: se quem está chamando é um usuário autenticado, só pode migrar para si mesmo
  IF v_caller_id IS NOT NULL AND v_caller_id != p_new_user_id THEN
    p_new_user_id := v_caller_id;
  END IF;

  IF p_new_user_id IS NULL OR p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN 0;
  END IF;

  -- 1. Limpar dígitos do telefone
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  
  -- Extrair apenas DDD + Número (ex: remove o 55 do Brasil se presente)
  IF length(v_clean_phone) >= 12 AND left(v_clean_phone, 2) = '55' THEN
    v_short_phone := substring(v_clean_phone from 3);
  ELSE
    v_short_phone := v_clean_phone;
  END IF;

  -- Se o telefone for muito curto (menos de 8 dígitos), abortar por segurança
  IF length(v_short_phone) < 8 THEN
    RETURN 0;
  END IF;

  -- 2. Vincular o cliente com as lojas onde ele possui reservas GUEST
  -- ATENÇÃO: Somente pedidos que começam estritamente com 'GUEST:' (nunca toca em pedidos de outros usuários ou admins)
  FOR v_store_id IN
    SELECT DISTINCT store_id
    FROM public.orders
    WHERE pix_key LIKE 'GUEST:%'
      AND (
        pix_key ILIKE '%' || v_short_phone || '%'
        OR pix_key ILIKE '%' || v_clean_phone || '%'
      )
      AND user_id != p_new_user_id
  LOOP
    INSERT INTO public.customer_store_link (user_id, store_id)
    VALUES (p_new_user_id, v_store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END LOOP;

  -- 3. Transferir as reservas GUEST encontradas para o id real da conta do cliente
  WITH updated AS (
    UPDATE public.orders
    SET user_id = p_new_user_id
    WHERE pix_key LIKE 'GUEST:%'
      AND (
        pix_key ILIKE '%' || v_short_phone || '%'
        OR pix_key ILIKE '%' || v_clean_phone || '%'
      )
      AND user_id != p_new_user_id
    RETURNING id
  )
  SELECT count(*) INTO v_migrated_count FROM updated;

  RETURN v_migrated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_reservations_by_phone(UUID, TEXT) TO authenticated, service_role;
