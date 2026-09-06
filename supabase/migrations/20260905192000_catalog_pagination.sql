BEGIN;
CREATE INDEX IF NOT EXISTS products_store_created_id_idx ON public.products(store_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_user_created_id_idx ON public.orders(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_store_created_id_idx ON public.orders(store_id, created_at DESC, id DESC);
CREATE OR REPLACE FUNCTION public.catalog_page(
  _store_id UUID, _search TEXT DEFAULT '', _brand TEXT DEFAULT 'all', _scale TEXT DEFAULT 'all',
  _type TEXT DEFAULT 'all', _in_stock BOOLEAN DEFAULT false, _sort TEXT DEFAULT 'recent',
  _page INTEGER DEFAULT 1, _page_size INTEGER DEFAULT 12
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF _page IS NULL OR _page < 1 OR _page > 100000 OR _page_size IS NULL OR _page_size NOT BETWEEN 1 AND 60
    OR length(_search) > 200 OR _type NOT IN ('all','pre','pronta')
    OR _sort NOT IN ('recent','name','price_asc','price_desc') THEN RAISE EXCEPTION 'invalid_catalog_filter'; END IF;
  WITH candidates AS (
    SELECT p.*, (COALESCE(to_jsonb(p)->>'category' = 'pronta_entrega', false) OR
      (p.release_date IS NULL AND COALESCE(p.down_payment_amount, 0) <= 0
       AND p.payment_deadline_date IS NULL AND COALESCE(p.payment_deadline_hours, 0) <= 0)) AS ready
    FROM public.products p WHERE p.store_id = _store_id AND p.is_open
  ), filtered AS (
    SELECT * FROM candidates p WHERE (NOT _in_stock OR stock > 0)
      AND (_brand = 'all' OR trim(brand) = _brand) AND (_scale = 'all' OR scale = _scale)
      AND (_type = 'all' OR (_type = 'pronta' AND ready) OR (_type = 'pre' AND NOT ready))
      AND (_search = '' OR strpos(lower(model || ' ' || brand || ' ' || COALESCE(to_jsonb(p)->>'description','')),lower(_search)) > 0)
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
