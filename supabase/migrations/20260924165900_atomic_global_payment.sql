BEGIN;

-- Uma chave por baixa permite reconhecer uma tentativa repetida após perda de conexão.
ALTER TABLE public.order_installments
  ADD COLUMN IF NOT EXISTS global_payment_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS order_installments_global_payment_request_order_idx
  ON public.order_installments(global_payment_request_id, order_id)
  WHERE global_payment_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_global_payment(
  _store_id UUID,
  _customer_id UUID,
  _request_id UUID,
  _payment_date DATE,
  _payments JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  order_ids UUID[];
  locked_count INTEGER;
  prior_count INTEGER;
  item JSONB;
  order_row public.orders%ROWTYPE;
  payment_order_id UUID;
  amount_cents BIGINT;
  expected_cents BIGINT;
  balance_cents BIGINT;
  paid_cents BIGINT;
  next_number INTEGER;
  settled_count INTEGER := 0;
  total_cents BIGINT := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR _store_id IS NULL OR _customer_id IS NULL
    OR _request_id IS NULL OR _payment_date IS NULL
    OR NOT public.is_store_owner(_store_id) THEN
    RAISE EXCEPTION 'global_payment_access_denied';
  END IF;

  IF _payments IS NULL OR jsonb_typeof(_payments) <> 'array' THEN
    RAISE EXCEPTION 'invalid_global_payment';
  END IF;
  IF jsonb_array_length(_payments) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_global_payment';
  END IF;

  SELECT array_agg((value->>'order_id')::UUID ORDER BY ordinal)
  INTO order_ids
  FROM jsonb_array_elements(_payments) WITH ORDINALITY AS requested(value, ordinal);

  IF cardinality(order_ids) <> (SELECT count(DISTINCT id) FROM unnest(order_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'duplicate_global_payment_order';
  END IF;

  -- Bloqueio em ordem fixa impede que duas baixas concorrentes leiam o mesmo saldo.
  PERFORM 1 FROM public.orders o WHERE o.id = ANY(order_ids) ORDER BY o.id FOR UPDATE;
  GET DIAGNOSTICS locked_count = ROW_COUNT;
  IF locked_count <> cardinality(order_ids) THEN
    RAISE EXCEPTION 'global_payment_order_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = ANY(order_ids)
      AND (o.store_id <> _store_id OR o.user_id <> _customer_id
           OR o.payment_status = 'cancelado' OR o.delivery_status = 'cancelado')
  ) THEN
    RAISE EXCEPTION 'global_payment_access_denied';
  END IF;

  SELECT count(*) INTO prior_count
  FROM public.order_installments oi
  WHERE oi.global_payment_request_id = _request_id;

  IF prior_count > 0 THEN
    IF prior_count <> cardinality(order_ids) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_payments) AS requested(item)
      LEFT JOIN public.order_installments oi
        ON oi.global_payment_request_id = _request_id
       AND oi.order_id = (requested.item->>'order_id')::UUID
       AND round(oi.amount * 100)::BIGINT = (requested.item->>'amount_cents')::BIGINT
       AND oi.due_date::DATE = _payment_date
      WHERE oi.id IS NULL
    ) THEN
      RAISE EXCEPTION 'global_payment_request_reused';
    END IF;
    SELECT COALESCE(sum(round(oi.amount * 100)), 0)::BIGINT INTO total_cents
    FROM public.order_installments oi WHERE oi.global_payment_request_id = _request_id;
    RETURN jsonb_build_object('orders', prior_count, 'amount_cents', total_cents, 'replayed', true);
  END IF;

  -- A ordem do array é a ordem mostrada na simulação (antigas ou pronta entrega).
  FOR item IN SELECT value FROM jsonb_array_elements(_payments) AS requested(value)
  LOOP
    payment_order_id := (item->>'order_id')::UUID;
    amount_cents := (item->>'amount_cents')::BIGINT;
    expected_cents := (item->>'expected_balance_cents')::BIGINT;
    IF amount_cents IS NULL OR amount_cents <= 0 OR amount_cents > 100000000
      OR expected_cents IS NULL OR expected_cents < amount_cents THEN
      RAISE EXCEPTION 'invalid_global_payment';
    END IF;

    SELECT * INTO STRICT order_row FROM public.orders o WHERE o.id = payment_order_id;
    IF order_row.payment_status = 'quitado' THEN RAISE EXCEPTION 'global_payment_balance_changed'; END IF;

    SELECT COALESCE(sum(round(oi.amount * 100)), 0)::BIGINT INTO paid_cents
    FROM public.order_installments oi WHERE oi.order_id = payment_order_id AND oi.status = 'paid';
    balance_cents := GREATEST(0,
      round(order_row.total_price * 100)::BIGINT
      - CASE WHEN order_row.payment_status IN ('sinal_pago', 'quitado')
          THEN round(order_row.down_payment * 100)::BIGINT ELSE 0 END
      - paid_cents
    );
    IF balance_cents <> expected_cents THEN RAISE EXCEPTION 'global_payment_balance_changed'; END IF;

    SELECT COALESCE(max(oi.installment_number), 0) + 1 INTO next_number
    FROM public.order_installments oi WHERE oi.order_id = payment_order_id;

    INSERT INTO public.order_installments(
      order_id, installment_number, amount, due_date, status, paid_at, global_payment_request_id
    ) VALUES (
      payment_order_id, next_number, amount_cents / 100.0,
      _payment_date::TIMESTAMP + INTERVAL '12 hours', 'paid', now(), _request_id
    );

    IF amount_cents = balance_cents THEN
      DELETE FROM public.order_installments oi WHERE oi.order_id = payment_order_id AND oi.status = 'pending';
      UPDATE public.orders o SET payment_status = 'quitado' WHERE o.id = payment_order_id;
      settled_count := settled_count + 1;
    END IF;
    total_cents := total_cents + amount_cents;
  END LOOP;

  RETURN jsonb_build_object(
    'orders', cardinality(order_ids), 'settled', settled_count,
    'amount_cents', total_cents, 'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_global_payment(UUID, UUID, UUID, DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_global_payment(UUID, UUID, UUID, DATE, JSONB) TO authenticated, service_role;

COMMIT;
