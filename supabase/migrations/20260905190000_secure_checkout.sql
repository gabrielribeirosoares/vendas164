BEGIN;

-- Only the owner may adjust stock without creating a customer reservation.
CREATE OR REPLACE FUNCTION public.reservar_miniatura(p_produto_id UUID, p_quantidade INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade > 100 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
  SELECT * INTO p FROM public.products WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_owner(p.store_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p.stock < p_quantidade THEN RETURN FALSE; END IF;
  UPDATE public.products SET stock = stock - p_quantidade WHERE id = p_produto_id;
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.reservar_miniatura(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_miniatura(UUID, INT) TO authenticated;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.order_installments;
REVOKE ALL ON public.order_installments FROM anon;
DROP POLICY IF EXISTS "Customers can insert order installments" ON public.order_installments;
DROP POLICY IF EXISTS "orders insert own" ON public.orders;
CREATE POLICY "orders owner insert" ON public.orders FOR INSERT TO authenticated
WITH CHECK (public.is_store_owner(store_id));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS installment_count INTEGER DEFAULT 1;
-- Preserve existing status values for compatibility with seller tools.
-- These snapshots separate commercial terms from payment/fulfillment statuses.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sale_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS signal_amount NUMERIC(12,2);

CREATE TABLE public.checkout_requests (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  items JSONB NOT NULL,
  order_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_requests FROM PUBLIC, anon, authenticated;

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
  -- Serialize retries, including two tabs or a lost HTTP response after commit.
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || _request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE user_id = uid AND request_id = _request_id;
  IF FOUND THEN
    IF previous.items <> _items THEN RAISE EXCEPTION 'checkout_conflict'; END IF;
    RETURN previous.order_ids;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
    GROUP BY x->>'product_id', x->>'installments' HAVING count(*) > 1
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
  -- Stable lock order avoids deadlocks between carts with the same products.
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
    -- Quantity thresholds apply to this product/payment option, matching the cart.
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
    -- The client sends a quote only for comparison, never to set the price.
    IF item->>'expected_total' IS NULL OR item->>'expected_signal' IS NULL
      OR (item->>'expected_total')::NUMERIC <> unit_price * qty
      OR (item->>'expected_signal')::NUMERIC <> signal * qty THEN RAISE EXCEPTION 'price_changed'; END IF;
    status := CASE WHEN ready THEN 'pronta_entrega' WHEN no_signal THEN 'sem_sinal' ELSE 'aguardando_sinal' END;
    expires := CASE WHEN no_signal THEN NULL WHEN pj->>'payment_deadline_date' IS NOT NULL
      THEN (((pj->>'payment_deadline_date')::DATE + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      ELSE now() + make_interval(hours => GREATEST(1, COALESCE(p.payment_deadline_hours, 24))) END;
    IF expires <= now() THEN RAISE EXCEPTION 'presale_closed'; END IF;
    UPDATE public.products SET initial_stock = COALESCE(initial_stock, stock), stock = stock - qty,
      is_open = CASE WHEN stock - qty <= 0 THEN false ELSE is_open END WHERE id = p.id;
    FOR n IN 1..qty LOOP
      INSERT INTO public.orders(user_id, product_id, store_id, total_price, installment_count,
        reservation_expires_at, payment_status, signal_amount, sale_type, payment_terms)
      VALUES(uid, p.id, p.store_id, unit_price, installments, expires, status, signal,
        CASE WHEN ready THEN 'pronta_entrega' ELSE 'pre_venda' END,
        CASE WHEN no_signal THEN 'sem_sinal' ELSE 'com_sinal' END) RETURNING id INTO new_id;
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
  END LOOP;
  INSERT INTO public.checkout_requests(user_id, request_id, items, order_ids) VALUES(uid, _request_id, _items, ids);
  RETURN ids;
END; $$;
REVOKE ALL ON FUNCTION public.checkout_cart(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_cart(UUID, JSONB) TO authenticated;
-- Retire the old checkout entry point so it cannot bypass the new guarantees.
REVOKE ALL ON FUNCTION public.create_reservation(UUID) FROM PUBLIC, anon, authenticated;
COMMIT;
