BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE private.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.platform_admins TO service_role;

-- Preserve the existing platform owner without inferring authorization from email text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '5fb17599-28a0-4c1c-92cf-38176f7d57a2'::UUID
  ) THEN
    INSERT INTO private.platform_admins(user_id)
    VALUES ('5fb17599-28a0-4c1c-92cf-38176f7d57a2'::UUID)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM private.platform_admins
      WHERE user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT private.is_platform_admin();
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = _store_id AND owner_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.is_store_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can update all stores" ON public.stores;
CREATE POLICY "Admins can update all stores" ON public.stores
FOR UPDATE TO authenticated
USING (public.is_platform_admin() OR owner_id = auth.uid())
WITH CHECK (public.is_platform_admin() OR owner_id = auth.uid());

-- RLS policies apply to rows, not columns. This policy allowed a customer to
-- update every mutable column in their own order despite its historical name.
DROP POLICY IF EXISTS "Users can update own order installment_count" ON public.orders;

CREATE OR REPLACE FUNCTION private.normalize_br_phone(_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = private AS $$
DECLARE digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(_phone, ''), '\D', '', 'g');
  IF length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN
    digits := substring(digits from 3);
  END IF;
  IF length(digits) NOT IN (10, 11) THEN RETURN NULL; END IF;
  RETURN digits;
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_br_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.normalize_br_phone(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guest_phone(_pix_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = private AS $$
DECLARE payload JSONB;
BEGIN
  IF _pix_key IS NULL OR _pix_key NOT LIKE 'GUEST:{%' THEN RETURN NULL; END IF;
  payload := substring(_pix_key from 7)::JSONB;
  RETURN private.normalize_br_phone(payload->>'phone');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.guest_phone(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guest_phone(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION private.same_br_phone(_left TEXT, _right TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path = private AS $$
  SELECT CASE
    WHEN private.normalize_br_phone(_left) IS NULL
      OR private.normalize_br_phone(_right) IS NULL THEN FALSE
    WHEN private.normalize_br_phone(_left) = private.normalize_br_phone(_right) THEN TRUE
    WHEN length(private.normalize_br_phone(_left)) = 11 THEN
      left(private.normalize_br_phone(_left), 2)
        || substring(private.normalize_br_phone(_left) from 4)
        = private.normalize_br_phone(_right)
    WHEN length(private.normalize_br_phone(_right)) = 11 THEN
      left(private.normalize_br_phone(_right), 2)
        || substring(private.normalize_br_phone(_right) from 4)
        = private.normalize_br_phone(_left)
    ELSE FALSE
  END;
$$;
REVOKE ALL ON FUNCTION private.same_br_phone(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.same_br_phone(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.migrate_reservations_by_phone(
  p_new_user_id UUID,
  p_phone TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE
  uid UUID := auth.uid();
  verified_phone TEXT;
  migrated_count INTEGER := 0;
BEGIN
  IF uid IS NULL OR p_new_user_id IS NULL OR uid <> p_new_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT phone INTO verified_phone
  FROM auth.users
  WHERE id = uid AND phone_confirmed_at IS NOT NULL;

  IF private.normalize_br_phone(verified_phone) IS NULL THEN RETURN 0; END IF;
  IF p_phone IS NOT NULL AND NOT private.same_br_phone(p_phone, verified_phone) THEN
    RAISE EXCEPTION 'phone_mismatch';
  END IF;

  INSERT INTO public.customer_store_link(user_id, store_id)
  SELECT uid, store_id FROM public.orders
  WHERE pix_key LIKE 'GUEST:%'
    AND private.same_br_phone(private.guest_phone(pix_key), verified_phone)
    AND user_id <> uid
  GROUP BY store_id
  ON CONFLICT DO NOTHING;

  WITH migrated AS (
    UPDATE public.orders
    SET user_id = uid
    WHERE pix_key LIKE 'GUEST:%'
      AND private.same_br_phone(private.guest_phone(pix_key), verified_phone)
      AND user_id <> uid
    RETURNING id
  )
  SELECT count(*) INTO migrated_count FROM migrated;

  RETURN migrated_count;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_reservations_by_phone(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_reservations_by_phone(UUID, TEXT)
TO authenticated, service_role;

-- Remove the trigger that trusted the editable public.profiles.phone value.
DROP TRIGGER IF EXISTS trg_migrar_reservas_duplicado ON public.profiles;

DO $$
BEGIN
  IF to_regprocedure('public.merge_guest_profile(uuid,uuid[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.merge_guest_profile(UUID, UUID[]) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.merge_guest_profile(UUID, UUID[]) TO service_role';
  END IF;
  IF to_regprocedure('public.migrar_reservas_telefone_duplicado()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.migrar_reservas_telefone_duplicado() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.migrar_reservas_telefone_duplicado() TO service_role';
  END IF;
END $$;

COMMIT;
