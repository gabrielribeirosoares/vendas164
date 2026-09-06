-- Atualização da RPC de migração de reservas de convidados (GUEST)
-- Suporta correspondência por telefone completo (com/sem DDI 55) e por e-mail
-- NÃO faz correspondência parcial por últimos 8 dígitos para evitar falsos positivos

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
  v_with_9 TEXT;
  v_without_9 TEXT;
  v_user_email TEXT;
  v_migrated_count INTEGER := 0;
  v_store_id UUID;
BEGIN
  -- Segurança: se quem está chamando é um usuário autenticado, só pode migrar para si mesmo
  IF v_caller_id IS NOT NULL AND v_caller_id != p_new_user_id THEN
    p_new_user_id := v_caller_id;
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- 1. Limpar dígitos do telefone se fornecido
  IF p_phone IS NOT NULL AND trim(p_phone) != '' THEN
    v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
    
    -- Extrair apenas DDD + Número (remove o 55 do Brasil se presente)
    IF length(v_clean_phone) >= 12 AND left(v_clean_phone, 2) = '55' THEN
      v_short_phone := substring(v_clean_phone from 3);
    ELSE
      v_short_phone := v_clean_phone;
    END IF;

    -- Gerar variantes de 8 e 9 dígitos para Brasil (DDD + número)
    -- Ex: 88888888888 (11 dígitos = DDD 2 + 9 dígitos) vs 8888888888 (10 dígitos = DDD 2 + 8 dígitos)
    IF length(v_short_phone) = 11 THEN
      -- Tem 9 dígitos no número: criar variante sem o 9
      v_with_9 := v_short_phone;
      v_without_9 := left(v_short_phone, 2) || substring(v_short_phone from 4);
    ELSIF length(v_short_phone) = 10 THEN
      -- Tem 8 dígitos no número: criar variante com o 9
      v_without_9 := v_short_phone;
      v_with_9 := left(v_short_phone, 2) || '9' || substring(v_short_phone from 3);
    END IF;
  END IF;

  -- Obter e-mail cadastrado do usuário
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_new_user_id;
  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE id = p_new_user_id;
  END IF;

  -- Abortar se não tiver nem telefone válido nem e-mail
  IF (v_clean_phone IS NULL OR length(v_clean_phone) < 10) AND (v_user_email IS NULL OR length(v_user_email) < 4) THEN
    RETURN 0;
  END IF;

  -- 2. Vincular o cliente com as lojas onde ele possui reservas GUEST
  FOR v_store_id IN
    SELECT DISTINCT store_id
    FROM public.orders
    WHERE pix_key LIKE 'GUEST:%'
      AND (
        (v_clean_phone IS NOT NULL AND length(v_clean_phone) >= 10 AND (
          pix_key ILIKE '%' || v_clean_phone || '%'
          OR pix_key ILIKE '%' || v_short_phone || '%'
          OR (v_with_9 IS NOT NULL AND pix_key ILIKE '%' || v_with_9 || '%')
          OR (v_without_9 IS NOT NULL AND pix_key ILIKE '%' || v_without_9 || '%')
        ))
        OR (v_user_email IS NOT NULL AND length(v_user_email) > 3 AND pix_key ILIKE '%' || v_user_email || '%')
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
        (v_clean_phone IS NOT NULL AND length(v_clean_phone) >= 10 AND (
          pix_key ILIKE '%' || v_clean_phone || '%'
          OR pix_key ILIKE '%' || v_short_phone || '%'
          OR (v_with_9 IS NOT NULL AND pix_key ILIKE '%' || v_with_9 || '%')
          OR (v_without_9 IS NOT NULL AND pix_key ILIKE '%' || v_without_9 || '%')
        ))
        OR (v_user_email IS NOT NULL AND length(v_user_email) > 3 AND pix_key ILIKE '%' || v_user_email || '%')
      )
      AND user_id != p_new_user_id
    RETURNING id
  )
  SELECT count(*) INTO v_migrated_count FROM updated;

  RETURN v_migrated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_reservations_by_phone(UUID, TEXT) TO authenticated, service_role;
