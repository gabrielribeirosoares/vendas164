BEGIN;
ALTER TABLE public.stores ADD COLUMN wheels_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN product_kind text NOT NULL DEFAULT 'miniatura' CHECK(product_kind IN ('miniatura','rodinhas'));

-- Owners may edit their stores, but only the platform administrator can release this section.
CREATE FUNCTION public.protect_wheels_access() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.wheels_enabled) OR (TG_OP='UPDATE' AND NEW.wheels_enabled IS DISTINCT FROM OLD.wheels_enabled) THEN
    IF auth.uid() IS NOT NULL THEN
      IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
    ELSIF current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'admin_required'; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_wheels_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_wheels_access BEFORE INSERT OR UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.protect_wheels_access();

CREATE FUNCTION public.set_store_wheels_enabled(_store_id uuid,_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF _enabled IS NULL THEN RAISE EXCEPTION 'invalid_access'; END IF;
  UPDATE public.stores SET wheels_enabled=_enabled WHERE id=_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_store_wheels_enabled(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_wheels_enabled(uuid,boolean) TO authenticated;

CREATE FUNCTION public.require_wheels_store() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
  IF NEW.product_kind='rodinhas' AND (TG_OP='INSERT' OR NEW.product_kind IS DISTINCT FROM OLD.product_kind OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
    SELECT wheels_enabled INTO allowed FROM public.stores WHERE id=NEW.store_id FOR SHARE;
    IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'wheels_not_enabled'; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.require_wheels_store() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_wheels_store BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.require_wheels_store();

CREATE POLICY "wheel products availability" ON public.products AS RESTRICTIVE FOR SELECT TO authenticated USING (
  product_kind <> 'rodinhas' OR EXISTS(SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.wheels_enabled)
  OR public.is_store_owner(store_id)
);

CREATE POLICY "wheel products public availability" ON public.products AS RESTRICTIVE FOR SELECT TO anon USING (
  product_kind <> 'rodinhas' OR EXISTS(SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.wheels_enabled)
);

CREATE FUNCTION public.require_wheels_order_access() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE kind text; allowed boolean;
BEGIN
  SELECT p.product_kind,s.wheels_enabled INTO kind,allowed FROM public.products p JOIN public.stores s ON s.id=p.store_id WHERE p.id=NEW.product_id FOR SHARE OF s;
  IF kind='rodinhas' AND NOT allowed THEN RAISE EXCEPTION 'wheels_not_enabled'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.require_wheels_order_access() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaa_require_wheels_order_access BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.require_wheels_order_access();
CREATE OR REPLACE FUNCTION public.catalog_page(
  _store_id UUID, _search TEXT DEFAULT '', _brand TEXT DEFAULT 'all', _scale TEXT DEFAULT 'all',
  _type TEXT DEFAULT 'all', _in_stock BOOLEAN DEFAULT false, _sort TEXT DEFAULT 'recent',
  _page INTEGER DEFAULT 1, _page_size INTEGER DEFAULT 12
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF _page IS NULL OR _page < 1 OR _page > 100000 OR _page_size IS NULL OR _page_size NOT BETWEEN 1 AND 60
    OR length(_search) > 200 OR _type NOT IN ('all','pre','pronta','rodinhas')
    OR _sort NOT IN ('recent','name','price_asc','price_desc') THEN RAISE EXCEPTION 'invalid_catalog_filter'; END IF;
  WITH candidates AS (
    SELECT p.*, (COALESCE(to_jsonb(p)->>'category' = 'pronta_entrega', false) OR
      (p.release_date IS NULL AND COALESCE(p.down_payment_amount, 0) <= 0
       AND p.payment_deadline_date IS NULL AND COALESCE(p.payment_deadline_hours, 0) <= 0)) AS ready
    FROM public.products p WHERE p.store_id = _store_id AND p.is_open
      AND ((_type='rodinhas' AND p.product_kind='rodinhas' AND EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p.store_id AND s.wheels_enabled)) OR (_type<>'rodinhas' AND p.product_kind='miniatura'))
  ), filtered AS (
    SELECT * FROM candidates p WHERE (NOT _in_stock OR stock > 0)
      AND (_brand = 'all' OR trim(brand) = _brand) AND (_scale = 'all' OR scale = _scale)
      AND (_type IN ('all','rodinhas') OR (_type = 'pronta' AND ready) OR (_type = 'pre' AND NOT ready))
      AND (_search = '' OR strpos(lower(model || ' ' || brand || ' ' || COALESCE(to_jsonb(p)->>'sku','') || ' ' || COALESCE(to_jsonb(p)->>'observation','') || ' ' || COALESCE(to_jsonb(p)->>'description','')),lower(_search)) > 0)
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY
      CASE WHEN _sort = 'price_asc' THEN price END ASC,
      CASE WHEN _sort = 'price_desc' THEN price END DESC,
      CASE WHEN _sort = 'name' THEN brand END ASC,
      CASE WHEN _sort = 'name' THEN model END ASC,
      CASE WHEN _sort = 'recent' THEN created_at END DESC, id ASC
    LIMIT _page_size OFFSET ((_page - 1) * _page_size)
  )
  SELECT jsonb_build_object('products', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'ready') FROM page_rows p), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'brands', COALESCE((SELECT jsonb_agg(b.brand ORDER BY b.brand) FROM (SELECT DISTINCT trim(brand) AS brand FROM candidates) b), '[]'::jsonb)) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.catalog_page(UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_page(UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,INTEGER,INTEGER) TO anon, authenticated;

COMMIT;
