BEGIN;
ALTER TABLE public.products ADD COLUMN color_variants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN variant_id uuid, ADD COLUMN variant_name text, ADD COLUMN variant_image_url text;

-- A single product row is the lock and source of truth for all color stock.
CREATE FUNCTION public.validate_color_variants() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v jsonb; total integer := 0;
BEGIN
  IF jsonb_typeof(NEW.color_variants) <> 'array' OR jsonb_array_length(NEW.color_variants)>40 THEN
    RAISE EXCEPTION 'invalid_variants';
  END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(NEW.color_variants) LOOP
    IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'name')<>'string'
      OR (v ? 'image_url' AND jsonb_typeof(v->'image_url') NOT IN ('string','null')) OR nullif(trim(v->>'name'),'') IS NULL OR length(v->>'name')>60
      OR coalesce(v->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR coalesce(v->>'stock','') !~ '^(0|[1-9][0-9]{0,5})$' THEN RAISE EXCEPTION 'invalid_variants'; END IF;
    total := total+(v->>'stock')::integer;
  END LOOP;
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
CREATE TRIGGER validate_color_variants BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_color_variants();

CREATE FUNCTION public.manage_order_variant_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p record; v jsonb; chosen uuid; delta integer := 0; was_cancelled boolean; cancelled boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    chosen:=NEW.variant_id;
    SELECT * INTO p FROM public.products WHERE id=NEW.product_id FOR UPDATE;
    IF chosen IS NULL THEN
      IF jsonb_array_length(p.color_variants)>0 THEN RAISE EXCEPTION 'variant_required'; END IF;
      RETURN NEW;
    END IF;
    cancelled:=NEW.payment_status='cancelado' OR NEW.delivery_status='cancelado';
    delta:=CASE WHEN cancelled THEN 0 ELSE -1 END;
  ELSE
    chosen:=OLD.variant_id;
    IF TG_OP='UPDATE' AND (NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.product_id IS DISTINCT FROM OLD.product_id
      OR NEW.variant_name IS DISTINCT FROM OLD.variant_name OR NEW.variant_image_url IS DISTINCT FROM OLD.variant_image_url) THEN
      RAISE EXCEPTION 'immutable_order_variant';
    END IF;
    IF chosen IS NULL THEN
      IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    was_cancelled:=OLD.payment_status='cancelado' OR OLD.delivery_status='cancelado';
    IF TG_OP='DELETE' THEN delta:=CASE WHEN was_cancelled THEN 0 ELSE 1 END;
    ELSE
      cancelled:=NEW.payment_status='cancelado' OR NEW.delivery_status='cancelado';
      delta:=CASE WHEN NOT was_cancelled AND cancelled THEN 1 WHEN was_cancelled AND NOT cancelled THEN -1 ELSE 0 END;
    END IF;
    IF delta=0 THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
    SELECT * INTO p FROM public.products WHERE id=OLD.product_id FOR UPDATE;
    IF NOT FOUND THEN
      IF TG_OP='DELETE' THEN RETURN OLD; ELSE RAISE EXCEPTION 'product_not_found'; END IF;
    END IF;
  END IF;
  SELECT value INTO v FROM jsonb_array_elements(p.color_variants) WHERE (value->>'id')::uuid=chosen;
  IF v IS NULL THEN RAISE EXCEPTION 'variant_not_found'; END IF;
  IF (v->>'stock')::integer+delta<0 THEN RAISE EXCEPTION 'variant_out_of_stock'; END IF;
  IF TG_OP='INSERT' THEN NEW.variant_name:=v->>'name'; NEW.variant_image_url:=v->>'image_url'; END IF;
  UPDATE public.products SET color_variants=(
    SELECT jsonb_agg(CASE WHEN (value->>'id')::uuid=chosen THEN jsonb_set(value,'{stock}',to_jsonb((value->>'stock')::integer+delta)) ELSE value END ORDER BY ordinal)
    FROM jsonb_array_elements(p.color_variants) WITH ORDINALITY AS x(value,ordinal)
  ) WHERE id=p.id;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.manage_order_variant_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_color_variants() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER manage_order_variant_stock BEFORE INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.manage_order_variant_stock();

CREATE OR REPLACE FUNCTION public.checkout_cart(_request_id UUID, _items JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid(); previous public.checkout_requests;
  item JSONB; p RECORD; pj JSONB; sj JSONB;
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
    max_installments := LEAST(12, GREATEST(1, COALESCE((pj->>'max_installments')::INT, 1)));
    IF installments > max_installments THEN RAISE EXCEPTION 'invalid_installments'; END IF;

    bulk := COALESCE((pj->>'bulk_discount_threshold')::INT, 0) > 0
      AND qty >= (pj->>'bulk_discount_threshold')::INT AND pj->>'bulk_discount_price' IS NOT NULL;
    cash_price := CASE WHEN bulk THEN (pj->>'bulk_discount_price')::NUMERIC ELSE p.price END;
    installment_price := CASE WHEN bulk THEN (pj->>'bulk_installment_price')::NUMERIC
      ELSE COALESCE((pj->>'installment_price')::NUMERIC, (pj->>'price_2x')::NUMERIC) END;
    surcharge := CASE WHEN bulk THEN COALESCE((pj->>'bulk_has_installment_surcharge')::BOOLEAN, false)
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
      THEN (pj->>'down_payment_amount')::NUMERIC ELSE round(p.price * 0.2, 2) END;
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


CREATE OR REPLACE FUNCTION public.create_manual_reservations(_request_id UUID, _product_id UUID, _quantity INTEGER, _order JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid(); p RECORD; payload JSONB; previous public.checkout_requests;
  price NUMERIC; paid NUMERIC; signal NUMERIC; count INT; status TEXT;
  customer UUID; expires TIMESTAMPTZ; ids UUID[] := '{}'; new_id UUID;
  cents BIGINT; part BIGINT; due_day INT; first_day DATE; due DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _request_id IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 1 AND 100 OR _order IS NULL THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  payload := jsonb_build_object('manual_product', _product_id, 'quantity', _quantity, 'order', _order);
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || _request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE user_id=uid AND request_id=_request_id;
  IF FOUND THEN
    IF previous.items <> payload THEN RAISE EXCEPTION 'checkout_conflict'; END IF;
    RETURN previous.order_ids;
  END IF;
  SELECT * INTO p FROM public.products WHERE id=_product_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_owner(p.store_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p.stock < _quantity THEN RAISE EXCEPTION 'out_of_stock'; END IF;
  customer := (_order->>'user_id')::UUID;
  price := round((_order->>'total_price')::NUMERIC,2);
  paid := round(COALESCE((_order->>'down_payment')::NUMERIC,0),2);
  signal := round(COALESCE((_order->>'signal_amount')::NUMERIC,0),2);
  count := COALESCE((_order->>'installment_count')::INT,1);
  status := _order->>'payment_status';
  expires := (_order->>'reservation_expires_at')::TIMESTAMPTZ;
  IF customer IS NULL OR price IS NULL OR price < 0 OR paid < 0 OR paid > price OR signal < 0 OR signal > price
    OR count NOT BETWEEN 1 AND 12 OR status IS NULL OR status NOT IN ('aguardando_sinal','sinal_pago','quitado','pronta_entrega','sem_sinal') THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;
  IF status='quitado' THEN paid:=price; END IF;
  IF status IN ('pronta_entrega','sem_sinal') THEN signal:=0; expires:=NULL; END IF;
  IF status<>'aguardando_sinal' THEN expires:=NULL; END IF;
  UPDATE public.products SET initial_stock=COALESCE(initial_stock,stock), stock=stock-_quantity WHERE id=p.id;
  SELECT LEAST(31,GREATEST(1,COALESCE((to_jsonb(s)->>'default_installment_due_day')::INT,
    extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo')::INT))) INTO due_day FROM public.stores s WHERE id=p.store_id;
  FOR n IN 1.._quantity LOOP
    INSERT INTO public.orders(user_id,product_id,store_id,total_price,down_payment,payment_status,delivery_status,
      installment_count,reservation_expires_at,pix_key,signal_amount,sale_type,payment_terms,variant_id)
    VALUES(customer,p.id,p.store_id,price,paid,status,'pendente',count,expires,_order->>'pix_key',signal,
      CASE WHEN status='pronta_entrega' THEN 'pronta_entrega' ELSE 'pre_venda' END,
      CASE WHEN status IN ('pronta_entrega','sem_sinal') THEN 'sem_sinal' ELSE 'com_sinal' END, nullif(_order->>'variant_id','')::uuid) RETURNING id INTO new_id;
    ids:=array_append(ids,new_id);
    cents:=round(GREATEST(0,price-GREATEST(signal,paid))*100)::BIGINT;
    IF status<>'quitado' AND count>1 AND cents>0 THEN
      FOR i IN 1..count LOOP
        first_day:=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')+make_interval(months=>i))::DATE;
        due:=first_day+LEAST(due_day,extract(day FROM first_day+interval '1 month - 1 day')::INT)-1;
        part:=cents/count+CASE WHEN i<=cents%count THEN 1 ELSE 0 END;
        INSERT INTO public.order_installments(order_id,installment_number,amount,due_date,status)
          VALUES(new_id,i,part::NUMERIC/100,due::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo','pending');
      END LOOP;
    END IF;
  END LOOP;
  INSERT INTO public.customer_store_link(user_id,store_id) VALUES(customer,p.store_id) ON CONFLICT DO NOTHING;
  -- A reserva confirmada atende o interesse e remove o cliente da fila na mesma transação.
  DELETE FROM public.waitlist
    WHERE user_id=customer AND product_id=p.id AND store_id=p.store_id;
  INSERT INTO public.checkout_requests(user_id,request_id,items,order_ids) VALUES(uid,_request_id,payload,ids);
  RETURN ids;
END; $$;
REVOKE ALL ON FUNCTION public.create_manual_reservations(UUID,UUID,INTEGER,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manual_reservations(UUID,UUID,INTEGER,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.seller_orders_page(
  _store_id UUID,
  _search TEXT DEFAULT '',
  _payment TEXT DEFAULT 'todos',
  _delivery TEXT DEFAULT 'todos',
  _category TEXT DEFAULT 'todos',
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL,
  _focus TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 25
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_store_owner(_store_id) THEN RAISE EXCEPTION 'store_access_denied'; END IF;
  IF _page NOT BETWEEN 1 AND 100000 OR _page_size NOT BETWEEN 1 AND 100
    OR length(COALESCE(_search, '')) > 200
    OR _category NOT IN ('todos', 'pre_venda', 'pronta_entrega')
    OR _focus IS NOT NULL AND _focus NOT IN ('atrasado', 'envios', 'vencendo') THEN
    RAISE EXCEPTION 'invalid_orders_page_request';
  END IF;

  WITH order_values AS (
    SELECT o.*, p.brand, p.model, to_jsonb(p)->>'sku' AS sku, p.release_date,
      CASE
        WHEN o.sale_type = 'pronta_entrega' THEN true
        WHEN o.sale_type = 'pre_venda' THEN false
        WHEN o.payment_status = 'pronta_entrega' THEN true
        ELSE (
          COALESCE(to_jsonb(p)->>'category' = 'pronta_entrega', false)
          OR (
            p.release_date IS NULL
            AND COALESCE((to_jsonb(p)->>'down_payment_amount')::numeric, 0) <= 0
            AND p.payment_deadline_date IS NULL
            AND COALESCE(p.payment_deadline_hours, 0) <= 0
          )
        )
      END AS ready,
      pr.name AS profile_name, pr.email AS profile_email, pr.phone AS profile_phone,
      COALESCE(inst.items, '[]'::jsonb) AS installments,
      COALESCE(inst.paid, 0) AS installment_paid
    FROM public.orders o
    JOIN public.products p ON p.id = o.product_id
    LEFT JOIN public.profiles pr ON pr.id = o.user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.installment_number) AS items,
        COALESCE(sum(oi.amount) FILTER (WHERE oi.status = 'paid'), 0) AS paid
      FROM public.order_installments oi WHERE oi.order_id = o.id
    ) inst ON true
    WHERE o.store_id = _store_id
  ), filtered AS (
    SELECT * FROM order_values v
    WHERE (_start_date IS NULL OR v.created_at >= _start_date::timestamptz)
      AND (_end_date IS NULL OR v.created_at < (_end_date + 1)::timestamptz)
      AND (_category = 'todos' OR (_category = 'pronta_entrega' AND v.ready) OR (_category = 'pre_venda' AND NOT v.ready))
      AND (
        _focus = 'atrasado' AND v.payment_status = 'aguardando_sinal' AND v.reservation_expires_at < now()
        OR _focus = 'vencendo' AND v.payment_status = 'aguardando_sinal' AND v.delivery_status <> 'cancelado' AND v.reservation_expires_at > now() AND v.reservation_expires_at <= now() + interval '24 hours'
        OR _focus = 'envios' AND v.payment_status = 'quitado' AND v.delivery_status NOT IN ('enviado','em_transito','cancelado','entregue')
        OR _focus IS NULL
      )
      AND (
        _payment = 'atrasado' AND v.payment_status = 'aguardando_sinal' AND v.reservation_expires_at < now()
        OR _payment <> 'atrasado' AND (_payment = 'todos' OR v.payment_status = _payment)
      )
      AND (_delivery = 'todos' OR v.delivery_status = _delivery)
      AND (NOT (_payment = 'todos' AND _delivery = 'todos') OR (v.payment_status <> 'cancelado' AND v.delivery_status <> 'cancelado'))
      AND (COALESCE(_search, '') = '' OR lower(
        COALESCE(v.profile_name, '') || ' ' || COALESCE(v.profile_email, '') || ' ' ||
        COALESCE(v.profile_phone, '') || ' ' || COALESCE(v.model, '') || ' ' ||
        COALESCE(v.brand, '') || ' ' || COALESCE(v.sku, '') || ' ' ||
        v.id::text || ' ' || COALESCE(to_jsonb(v)->>'tracking_code', '')
      ) LIKE '%' || lower(trim(leading '#' FROM _search)) || '%')
  ), grouped AS (
    SELECT user_id, product_id, variant_id, payment_status, delivery_status, COALESCE(pix_key, '') AS pix_key,
      date_trunc('minute', created_at) AS batch_minute,
      array_agg(id ORDER BY created_at, id) AS ids,
      min(created_at) AS first_created_at,
      max(created_at) AS last_created_at
    FROM filtered
    GROUP BY user_id, product_id, variant_id, payment_status, delivery_status, COALESCE(pix_key, ''), date_trunc('minute', created_at)
  ), page_groups AS (
    SELECT * FROM grouped ORDER BY last_created_at DESC, ids[1] DESC
    LIMIT _page_size OFFSET ((_page - 1) * _page_size)
  ), page_items AS (
    SELECT jsonb_build_object(
      'ids', to_jsonb(g.ids),
      'quantity', cardinality(g.ids),
      'order', to_jsonb(v) - 'brand' - 'model' - 'sku' - 'release_date' - 'ready'
        - 'profile_name' - 'profile_email' - 'profile_phone' - 'installments' - 'installment_paid'
        || jsonb_build_object(
          'products', to_jsonb(p),
          'profiles', jsonb_build_object('name', v.profile_name, 'email', v.profile_email, 'phone', v.profile_phone),
          'order_installments', v.installments
        )
    ) AS item, g.last_created_at
    FROM page_groups g
    JOIN filtered v ON v.id = g.ids[1]
    JOIN public.products p ON p.id = v.product_id
  ), active AS (
    SELECT * FROM order_values WHERE payment_status <> 'cancelado' AND delivery_status <> 'cancelado'
  ), overview AS (
    SELECT COALESCE(sum(total_price), 0) AS projected,
      COALESCE(sum(LEAST(total_price,
        CASE WHEN payment_status IN ('sinal_pago','quitado') THEN down_payment ELSE 0 END + installment_paid)), 0) AS received,
      count(*) AS active_count,
      count(*) FILTER (WHERE payment_status = 'quitado') AS paid_in_full,
      count(*) FILTER (WHERE ready) AS ready_count,
      count(*) FILTER (WHERE NOT ready) AS preorder_count
    FROM active
  ), brand_stats AS (
    SELECT brand AS name, count(*) AS count FROM active
    GROUP BY brand ORDER BY count(*) DESC, brand LIMIT 5
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT jsonb_agg(item ORDER BY last_created_at DESC) FROM page_items), '[]'::jsonb),
    'total', (SELECT count(*) FROM grouped),
    'counts', jsonb_build_object(
      'all', (SELECT count(*) FROM active),
      'preorder', (SELECT preorder_count FROM overview),
      'ready', (SELECT ready_count FROM overview)
    ),
    'overview', jsonb_build_object(
      'projected', (SELECT projected FROM overview),
      'received', (SELECT received FROM overview),
      'pending', GREATEST(0, (SELECT projected - received FROM overview)),
      'activeCount', (SELECT active_count FROM overview),
      'avgTicket', CASE WHEN (SELECT active_count FROM overview) > 0 THEN (SELECT projected / active_count FROM overview) ELSE 0 END,
      'paidInFull', (SELECT paid_in_full FROM overview)
    ),
    'brands', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM brand_stats b), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD;
  next_user UUID;
  expired_count INTEGER := 0;
  p RECORD;
BEGIN
  FOR o IN
    SELECT * FROM public.orders
    WHERE payment_status = 'aguardando_sinal'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at < now()
  LOOP
    UPDATE public.orders SET payment_status = 'cancelado', delivery_status = 'cancelado' WHERE id = o.id;
    expired_count := expired_count + 1;
    IF o.variant_id IS NOT NULL THEN CONTINUE; END IF;

    SELECT user_id INTO next_user FROM public.waitlist
      WHERE product_id = o.product_id AND NOT EXISTS (SELECT 1 FROM public.products cp WHERE cp.id=o.product_id AND jsonb_array_length(cp.color_variants)>0) ORDER BY created_at ASC LIMIT 1;

    IF next_user IS NOT NULL THEN
      SELECT * INTO p FROM public.products WHERE id = o.product_id;
      INSERT INTO public.orders (user_id, product_id, store_id, total_price, reservation_expires_at)
      VALUES (next_user, o.product_id, o.store_id, p.price, now() + (p.payment_deadline_hours || ' hours')::interval);
      DELETE FROM public.waitlist WHERE product_id = o.product_id AND user_id = next_user;
      INSERT INTO public.customer_store_link (user_id, store_id) VALUES (next_user, o.store_id) ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.products SET stock = stock + 1 WHERE id = o.product_id;
    END IF;
  END LOOP;
  RETURN expired_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;


COMMIT;
