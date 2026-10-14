BEGIN;
CREATE OR REPLACE FUNCTION public.validate_color_variants() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v jsonb; total integer := 0; normalized jsonb := '[]'; label text; attribute text;
BEGIN
  IF jsonb_typeof(NEW.color_variants) <> 'array' OR jsonb_array_length(NEW.color_variants)>40 THEN
    RAISE EXCEPTION 'invalid_variants';
  END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(NEW.color_variants) LOOP
    FOREACH attribute IN ARRAY ARRAY['color','size','brake'] LOOP
      IF v ? attribute AND (jsonb_typeof(v->attribute)<>'string' OR length(v->>attribute)>60) THEN
        RAISE EXCEPTION 'invalid_variants';
      END IF;
    END LOOP;
    IF v ? 'brake' AND v->>'brake' NOT IN ('','Com freio','Sem freio') THEN RAISE EXCEPTION 'invalid_variants'; END IF;
    IF v ? 'price' AND jsonb_typeof(v->'price')<>'null' THEN
      IF jsonb_typeof(v->'price')<>'number' THEN RAISE EXCEPTION 'invalid_variants'; END IF;
      IF (v->>'price')::numeric < 0 OR (v->>'price')::numeric > 1000000
        OR round((v->>'price')::numeric,2) <> (v->>'price')::numeric THEN RAISE EXCEPTION 'invalid_variants'; END IF;
    END IF;
    label := concat_ws(' — ', nullif(trim(coalesce(v->>'color',v->>'name')),''), nullif(trim(v->>'size'),''), nullif(trim(v->>'brake'),''));
    v := v || jsonb_build_object('name',label,'color',trim(coalesce(v->>'color',v->>'name')));
    normalized := normalized || jsonb_build_array(v);
    IF jsonb_typeof(v)<>'object'  OR jsonb_typeof(v->'name')<>'string'
      OR (v ? 'image_url' AND jsonb_typeof(v->'image_url') NOT IN ('string','null')) OR nullif(trim(v->>'name'),'') IS NULL OR length(v->>'name')>180
      OR coalesce(v->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR coalesce(v->>'stock','') !~ '^(0|[1-9][0-9]{0,5})$' THEN RAISE EXCEPTION 'invalid_variants'; END IF;
    total := total+(v->>'stock')::integer;
  END LOOP;
  NEW.color_variants := normalized;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.color_variants) AS options(entry) GROUP BY lower(trim(entry->>'name')) HAVING count(*)>1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.color_variants) AS options(entry) GROUP BY lower(entry->>'id') HAVING count(*)>1) THEN
    RAISE EXCEPTION 'duplicate_variant';
  END IF;
  IF TG_OP='UPDATE' AND NEW.color_variants IS DISTINCT FROM OLD.color_variants THEN
    IF EXISTS (SELECT 1 FROM public.orders o WHERE o.product_id=NEW.id AND o.variant_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.color_variants) AS options(entry) WHERE (entry->>'id')::uuid=o.variant_id)) THEN
      RAISE EXCEPTION 'variant_has_orders';
    END IF;
  END IF;
  IF jsonb_array_length(NEW.color_variants)>0 THEN
    NEW.stock := total;
    IF TG_OP='INSERT' THEN NEW.initial_stock:=total;
    ELSE NEW.initial_stock:=greatest(total,coalesce(NEW.initial_stock,OLD.initial_stock,OLD.stock)); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.checkout_cart(_request_id UUID, _items JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid(); previous public.checkout_requests;
  item JSONB; p RECORD; pj JSONB; sj JSONB; selected_variant JSONB; variant_price NUMERIC;
  qty INT; installments INT; max_installments INT; total_units INT;
  cash_price NUMERIC; installment_price NUMERIC; unit_price NUMERIC; signal NUMERIC;
  bulk BOOLEAN; surcharge BOOLEAN; ready BOOLEAN; no_signal BOOLEAN;
  status TEXT; expires TIMESTAMPTZ; due_day INT; month_start DATE; due DATE;
  balance_cents BIGINT; part_cents BIGINT; new_id UUID; ids UUID[] := '{}';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _request_id IS NULL OR _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_cart';
  END IF;
  IF jsonb_array_length(_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || _request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE user_id = uid AND request_id = _request_id;
  IF FOUND THEN
    IF previous.items <> _items THEN RAISE EXCEPTION 'checkout_conflict'; END IF;
    -- A retry after a committed checkout also repairs a stale waitlist row.
    DELETE FROM public.waitlist w
    USING public.products product
    WHERE w.user_id = uid
      AND w.product_id = product.id
      AND w.store_id = product.store_id
      AND product.id IN (
        SELECT (x->>'product_id')::UUID FROM jsonb_array_elements(_items) x
      );
    RETURN previous.order_ids;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
    GROUP BY x->>'product_id', coalesce(x->>'variant_id',''), x->>'installments' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'invalid_cart'; END IF;
  total_units := 0;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF jsonb_typeof(item) <> 'object'
      OR COALESCE(item->>'quantity', '') !~ '^[1-9][0-9]{0,2}$'
      OR COALESCE(item->>'installments', '') !~ '^[1-9][0-9]?$'
      OR COALESCE(item->>'product_id', '') = '' THEN RAISE EXCEPTION 'invalid_cart'; END IF;
    total_units := total_units + (item->>'quantity')::INT;
  END LOOP;
  IF total_units > 100 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  PERFORM id FROM public.products
    WHERE id IN (SELECT (x->>'product_id')::UUID FROM jsonb_array_elements(_items) x)
    ORDER BY id FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'product_id', value->>'installments' LOOP
    qty := (item->>'quantity')::INT;
    installments := (item->>'installments')::INT;
    SELECT * INTO p FROM public.products WHERE id = (item->>'product_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
    SELECT to_jsonb(s) INTO sj FROM public.stores s WHERE id = p.store_id;
    IF sj->>'owner_id' = uid::text THEN RAISE EXCEPTION 'own_store'; END IF;
    IF sj->>'status' IN ('rejected', 'suspended', 'blocked') THEN RAISE EXCEPTION 'presale_closed'; END IF;
    IF NOT p.is_open THEN RAISE EXCEPTION 'presale_closed'; END IF;
    IF p.stock < qty THEN RAISE EXCEPTION 'out_of_stock'; END IF;
    pj := to_jsonb(p);
    selected_variant := NULL;
    variant_price := NULL;
    IF jsonb_array_length(p.color_variants)>0 AND nullif(item->>'variant_id','') IS NULL THEN RAISE EXCEPTION 'variant_required'; END IF;
    IF nullif(item->>'variant_id','') IS NOT NULL THEN
      SELECT value INTO selected_variant FROM jsonb_array_elements(p.color_variants) WHERE (value->>'id')::uuid=(item->>'variant_id')::uuid;
      IF selected_variant IS NULL THEN RAISE EXCEPTION 'variant_not_found'; END IF;
      IF (selected_variant->>'stock')::int < qty THEN RAISE EXCEPTION 'variant_out_of_stock'; END IF;
      variant_price := (selected_variant->>'price')::numeric;
    END IF;
    max_installments := LEAST(12, GREATEST(1, COALESCE((pj->>'max_installments')::INT, 1)));
    IF installments > max_installments THEN RAISE EXCEPTION 'invalid_installments'; END IF;

    bulk := variant_price IS NULL AND COALESCE((pj->>'bulk_discount_threshold')::INT, 0) > 0
      AND qty >= (pj->>'bulk_discount_threshold')::INT AND pj->>'bulk_discount_price' IS NOT NULL;
    cash_price := CASE WHEN variant_price IS NOT NULL THEN variant_price WHEN bulk THEN (pj->>'bulk_discount_price')::NUMERIC ELSE p.price END;
    installment_price := CASE WHEN variant_price IS NOT NULL THEN variant_price WHEN bulk THEN (pj->>'bulk_installment_price')::NUMERIC
      ELSE COALESCE((pj->>'installment_price')::NUMERIC, (pj->>'price_2x')::NUMERIC) END;
    surcharge := CASE WHEN variant_price IS NOT NULL THEN false WHEN bulk THEN COALESCE((pj->>'bulk_has_installment_surcharge')::BOOLEAN, false)
      ELSE COALESCE((pj->>'has_installment_surcharge')::BOOLEAN, false) END;
    unit_price := round(CASE WHEN installments > 1 AND installment_price > 0
      AND (surcharge OR installment_price > cash_price) THEN installment_price ELSE cash_price END, 2);
    IF unit_price IS NULL OR unit_price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;

    ready := COALESCE(pj->>'category' = 'pronta_entrega', false) OR
      (p.release_date IS NULL AND COALESCE((pj->>'down_payment_amount')::NUMERIC, 0) <= 0
       AND pj->>'payment_deadline_date' IS NULL AND COALESCE(p.payment_deadline_hours, 0) <= 0);
    no_signal := ready OR (COALESCE((pj->>'down_payment_amount')::NUMERIC, 0) <= 0
      AND pj->>'payment_deadline_date' IS NULL AND COALESCE(p.payment_deadline_hours, 0) <= 0);
    signal := CASE WHEN no_signal THEN 0 WHEN COALESCE((pj->>'down_payment_amount')::NUMERIC, 0) > 0
      THEN (pj->>'down_payment_amount')::NUMERIC ELSE round(COALESCE(variant_price,p.price) * 0.2, 2) END;
    signal := LEAST(unit_price, round(signal, 2));

    IF item->>'expected_total' IS NULL OR item->>'expected_signal' IS NULL
      OR (item->>'expected_total')::NUMERIC <> unit_price * qty
      OR (item->>'expected_signal')::NUMERIC <> signal * qty THEN RAISE EXCEPTION 'price_changed'; END IF;
    status := CASE WHEN ready THEN 'pronta_entrega' WHEN no_signal THEN 'sem_sinal' ELSE 'aguardando_sinal' END;
    expires := CASE WHEN no_signal THEN NULL WHEN pj->>'payment_deadline_date' IS NOT NULL
      THEN (((pj->>'payment_deadline_date')::DATE + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      ELSE now() + make_interval(hours => GREATEST(1, COALESCE(p.payment_deadline_hours, 24))) END;
    IF expires <= now() THEN RAISE EXCEPTION 'presale_closed'; END IF;

    -- Reaching zero stock sends new customers to the waitlist; it does not close the presale.
    UPDATE public.products
    SET initial_stock = COALESCE(initial_stock, stock), stock = stock - qty
    WHERE id = p.id;

    FOR n IN 1..qty LOOP
      INSERT INTO public.orders(user_id, product_id, store_id, total_price, installment_count,
        reservation_expires_at, payment_status, signal_amount, sale_type, payment_terms, variant_id)
      VALUES(uid, p.id, p.store_id, unit_price, installments, expires, status, signal,
        CASE WHEN ready THEN 'pronta_entrega' ELSE 'pre_venda' END,
        CASE WHEN no_signal THEN 'sem_sinal' ELSE 'com_sinal' END, nullif(item->>'variant_id','')::uuid) RETURNING id INTO new_id;
      ids := array_append(ids, new_id);
      IF installments > 1 AND unit_price > signal THEN
        balance_cents := round((unit_price - signal) * 100)::BIGINT;
        due_day := LEAST(31, GREATEST(1, COALESCE((sj->>'default_installment_due_day')::INT,
          extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo')::INT)));
        FOR i IN 1..installments LOOP
          month_start := (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + make_interval(months => i))::DATE;
          due := month_start + LEAST(due_day, extract(day FROM month_start + interval '1 month - 1 day')::INT) - 1;
          part_cents := balance_cents / installments + CASE WHEN i <= balance_cents % installments THEN 1 ELSE 0 END;
          INSERT INTO public.order_installments(order_id, installment_number, amount, due_date, status)
            VALUES(new_id, i, part_cents::NUMERIC / 100, due::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo', 'pending');
        END LOOP;
      END IF;
    END LOOP;
    INSERT INTO public.customer_store_link(user_id, store_id) VALUES(uid, p.store_id) ON CONFLICT DO NOTHING;
    DELETE FROM public.waitlist
      WHERE user_id = uid AND product_id = p.id AND store_id = p.store_id;
  END LOOP;
  INSERT INTO public.checkout_requests(user_id, request_id, items, order_ids) VALUES(uid, _request_id, _items, ids);
  RETURN ids;
END; $$;

REVOKE ALL ON FUNCTION public.checkout_cart(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_cart(UUID, JSONB) TO authenticated;



COMMIT;
