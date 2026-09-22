BEGIN;

CREATE OR REPLACE FUNCTION public.replace_order_installments(
  _order_ids UUID[],
  _count INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expected_orders INTEGER;
  owned_orders INTEGER;
  order_row RECORD;
  installment_index INTEGER;
  balance_cents BIGINT;
  installment_cents BIGINT;
  due_month DATE;
  due_day INTEGER;
  due_date DATE;
  created_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _order_ids IS NULL OR cardinality(_order_ids) NOT BETWEEN 1 AND 100
    OR _count IS NULL OR _count NOT BETWEEN 1 AND 36 THEN
    RAISE EXCEPTION 'invalid_installment_request';
  END IF;

  SELECT count(*) INTO expected_orders
  FROM (SELECT DISTINCT unnest(_order_ids) AS id) requested;

  SELECT count(*) INTO owned_orders
  FROM public.orders o
  WHERE o.id = ANY(_order_ids) AND public.is_store_owner(o.store_id);

  IF owned_orders <> expected_orders THEN RAISE EXCEPTION 'order_access_denied'; END IF;

  FOR order_row IN
    SELECT o.*, LEAST(31, GREATEST(1, COALESCE(s.default_installment_due_day, EXTRACT(DAY FROM CURRENT_DATE)::INTEGER))) AS due_day
    FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id
    WHERE o.id = ANY(_order_ids)
    ORDER BY o.id
    FOR UPDATE OF o
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.order_installments oi
      WHERE oi.order_id = order_row.id AND oi.status = 'paid'
    ) THEN
      RAISE EXCEPTION 'paid_installments_exist';
    END IF;

    DELETE FROM public.order_installments WHERE order_id = order_row.id;

    balance_cents := GREATEST(
      0,
      round((order_row.total_price - GREATEST(order_row.down_payment, COALESCE(order_row.signal_amount, 0))) * 100)::BIGINT
    );

    IF balance_cents = 0 THEN
      UPDATE public.orders
      SET installment_count = _count, payment_status = 'quitado'
      WHERE id = order_row.id;
      CONTINUE;
    END IF;

    due_day := order_row.due_day;
    FOR installment_index IN 1.._count LOOP
      installment_cents := balance_cents / _count
        + CASE WHEN installment_index <= balance_cents % _count THEN 1 ELSE 0 END;
      due_month := (date_trunc('month', CURRENT_DATE) + make_interval(months => installment_index))::DATE;
      due_date := make_date(
        EXTRACT(YEAR FROM due_month)::INTEGER,
        EXTRACT(MONTH FROM due_month)::INTEGER,
        LEAST(due_day, EXTRACT(DAY FROM (due_month + INTERVAL '1 month - 1 day'))::INTEGER)
      );

      INSERT INTO public.order_installments(order_id, installment_number, amount, due_date, status)
      VALUES (order_row.id, installment_index, installment_cents / 100.0, due_date, 'pending');
      created_count := created_count + 1;
    END LOOP;

    UPDATE public.orders SET installment_count = _count WHERE id = order_row.id;
  END LOOP;

  RETURN jsonb_build_object('orders', expected_orders, 'installments', created_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_order_payment(
  _order_ids UUID[],
  _amount NUMERIC,
  _due_date DATE DEFAULT CURRENT_DATE,
  _status TEXT DEFAULT 'paid'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expected_orders INTEGER;
  owned_orders INTEGER;
  order_row RECORD;
  requested_cents BIGINT;
  remaining_request_cents BIGINT;
  order_balance_cents BIGINT;
  allocated_cents BIGINT;
  next_number INTEGER;
  paid_cents BIGINT;
  inserted_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _order_ids IS NULL OR cardinality(_order_ids) NOT BETWEEN 1 AND 100
    OR _amount IS NULL OR _amount <= 0 OR _amount > 1000000
    OR _status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'invalid_payment_request';
  END IF;

  requested_cents := round(_amount * 100)::BIGINT;
  remaining_request_cents := requested_cents;

  SELECT count(*) INTO expected_orders
  FROM (SELECT DISTINCT unnest(_order_ids) AS id) requested;

  SELECT count(*) INTO owned_orders
  FROM public.orders o
  WHERE o.id = ANY(_order_ids) AND public.is_store_owner(o.store_id);

  IF owned_orders <> expected_orders THEN RAISE EXCEPTION 'order_access_denied'; END IF;

  FOR order_row IN
    SELECT o.*
    FROM public.orders o
    WHERE o.id = ANY(_order_ids)
    ORDER BY o.created_at, o.id
    FOR UPDATE
  LOOP
    SELECT COALESCE(sum(round(oi.amount * 100)), 0)::BIGINT
    INTO paid_cents
    FROM public.order_installments oi
    WHERE oi.order_id = order_row.id
      AND (_status = 'paid' AND oi.status = 'paid' OR _status = 'pending');

    order_balance_cents := GREATEST(
      0,
      round((order_row.total_price - GREATEST(order_row.down_payment, COALESCE(order_row.signal_amount, 0))) * 100)::BIGINT - paid_cents
    );
    allocated_cents := LEAST(order_balance_cents, remaining_request_cents);

    IF allocated_cents > 0 THEN
      SELECT COALESCE(max(installment_number), 0) + 1 INTO next_number
      FROM public.order_installments WHERE order_id = order_row.id;

      INSERT INTO public.order_installments(
        order_id, installment_number, amount, due_date, status, paid_at
      ) VALUES (
        order_row.id,
        next_number,
        allocated_cents / 100.0,
        COALESCE(_due_date, CURRENT_DATE),
        _status,
        CASE WHEN _status = 'paid' THEN now() ELSE NULL END
      );

      inserted_count := inserted_count + 1;
      remaining_request_cents := remaining_request_cents - allocated_cents;

      IF _status = 'paid' AND allocated_cents = order_balance_cents THEN
        DELETE FROM public.order_installments
        WHERE order_id = order_row.id AND status = 'pending';
        UPDATE public.orders SET payment_status = 'quitado' WHERE id = order_row.id;
      END IF;
    END IF;

    EXIT WHEN remaining_request_cents = 0;
  END LOOP;

  IF remaining_request_cents <> 0 THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;

  RETURN jsonb_build_object(
    'orders', expected_orders,
    'entries', inserted_count,
    'amount', requested_cents / 100.0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_installments(UUID[], INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_order_payment(UUID[], NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_installments(UUID[], INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_order_payment(UUID[], NUMERIC, DATE, TEXT) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS order_installments_order_status_idx
  ON public.order_installments(order_id, status);

COMMIT;
