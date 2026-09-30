BEGIN;

CREATE TABLE IF NOT EXISTS public.infinitepay_connections (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  handle text NOT NULL CHECK (handle ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,59}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.infinitepay_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.infinitepay_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.infinitepay_connections TO service_role;

ALTER TABLE public.gateway_payment_attempts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mercadopago';

ALTER TABLE public.gateway_payment_attempts
  DROP CONSTRAINT IF EXISTS gateway_payment_attempts_provider_check;
ALTER TABLE public.gateway_payment_attempts
  ADD CONSTRAINT gateway_payment_attempts_provider_check
  CHECK (provider IN ('mercadopago', 'infinitepay'));

ALTER TABLE public.gateway_payment_attempts
  DROP CONSTRAINT IF EXISTS gateway_payment_attempts_payment_method_check;
ALTER TABLE public.gateway_payment_attempts
  ADD CONSTRAINT gateway_payment_attempts_payment_method_check
  CHECK (payment_method IN ('pix', 'checkout_pro', 'infinitepay'));

CREATE INDEX IF NOT EXISTS gateway_payment_attempts_provider_store_status_idx
  ON public.gateway_payment_attempts (provider, store_id, status, expires_at);


CREATE TABLE public.gateway_payment_attempt_order_locks (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.gateway_payment_attempts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gateway_payment_attempt_order_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gateway_payment_attempt_order_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.gateway_payment_attempt_order_locks TO service_role;

INSERT INTO public.gateway_payment_attempt_order_locks(order_id, attempt_id)
SELECT order_id, attempt_id
FROM (
  SELECT u.order_id, a.id AS attempt_id,
         row_number() OVER (PARTITION BY u.order_id ORDER BY a.created_at, a.id) AS position
  FROM public.gateway_payment_attempts a
  CROSS JOIN LATERAL unnest(a.order_ids) AS u(order_id)
  WHERE a.status IN ('created', 'pending')
) active_attempts
WHERE position = 1
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_gateway_payment_attempt(
  p_attempt_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_order_ids uuid[],
  p_request_key text,
  p_amount numeric,
  p_payment_method text,
  p_provider text,
  p_max_installments integer,
  p_description text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_order record;
  v_sorted_ids uuid[];
  v_existing_id uuid;
  v_expected numeric := 0;
  v_count integer := 0;
BEGIN
  IF p_attempt_id IS NULL OR p_store_id IS NULL OR p_user_id IS NULL
     OR p_order_ids IS NULL OR cardinality(p_order_ids) NOT BETWEEN 1 AND 25
     OR p_request_key IS NULL OR length(p_request_key) <> 64
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
     OR p_provider IS NULL OR p_payment_method IS NULL OR p_max_installments IS NULL
     OR p_provider NOT IN ('mercadopago', 'infinitepay')
     OR (p_provider = 'mercadopago' AND p_payment_method NOT IN ('pix', 'checkout_pro'))
     OR (p_provider = 'infinitepay' AND p_payment_method <> 'infinitepay')
     OR p_max_installments NOT BETWEEN 1 AND 12
     OR p_description IS NULL OR length(p_description) NOT BETWEEN 1 AND 128
     OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_gateway_attempt';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_sorted_ids
  FROM (SELECT DISTINCT unnest(p_order_ids) AS id) ids;
  IF cardinality(v_sorted_ids) <> cardinality(p_order_ids)
     OR array_position(v_sorted_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_gateway_attempt_orders';
  END IF;

  -- Lock the orders in a stable order so two gateways cannot create payable links
  -- for the same order at the same time.
  FOR v_order IN
    SELECT id, store_id, user_id, total_price, down_payment, payment_status
    FROM public.orders
    WHERE id = ANY(v_sorted_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_order.store_id <> p_store_id OR v_order.user_id <> p_user_id
       OR v_order.payment_status NOT IN ('aguardando_sinal', 'sinal_pago', 'pendente') THEN
      RAISE EXCEPTION 'gateway_order_not_payable';
    END IF;
    v_count := v_count + 1;
    v_expected := v_expected + CASE
      WHEN v_order.payment_status = 'aguardando_sinal' AND v_order.down_payment > 0
        THEN v_order.down_payment
      WHEN v_order.payment_status = 'sinal_pago'
        THEN greatest(0, v_order.total_price - coalesce(v_order.down_payment, 0))
      ELSE v_order.total_price
    END;
  END LOOP;
  IF v_count <> cardinality(v_sorted_ids) OR round(v_expected, 2) <> p_amount THEN
    RAISE EXCEPTION 'gateway_amount_or_orders_mismatch';
  END IF;

  DELETE FROM public.gateway_payment_attempt_order_locks l
  WHERE EXISTS (
    SELECT 1 FROM public.gateway_payment_attempts a
    WHERE a.id = l.attempt_id AND a.status NOT IN ('created', 'pending')
  );

  SELECT id INTO v_existing_id
  FROM public.gateway_payment_attempts
  WHERE store_id = p_store_id AND user_id = p_user_id AND request_key = p_request_key
    AND status IN ('created', 'pending')
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.gateway_payment_attempt_order_locks l
    JOIN public.gateway_payment_attempts a ON a.id = l.attempt_id
    WHERE l.order_id = ANY(v_sorted_ids) AND a.status IN ('created', 'pending')
  ) THEN
    RAISE EXCEPTION 'gateway_order_payment_in_progress';
  END IF;

  INSERT INTO public.gateway_payment_attempts(
    id, store_id, user_id, order_ids, request_key, amount, payment_method,
    provider, max_installments, description, expires_at
  ) VALUES (
    p_attempt_id, p_store_id, p_user_id, v_sorted_ids, p_request_key, p_amount,
    p_payment_method, p_provider, p_max_installments, p_description, p_expires_at
  );

  INSERT INTO public.gateway_payment_attempt_order_locks(order_id, attempt_id)
  SELECT unnest(v_sorted_ids), p_attempt_id;

  RETURN p_attempt_id;
END;
$;

REVOKE ALL ON FUNCTION public.create_gateway_payment_attempt(uuid, uuid, uuid, uuid[], text, numeric, text, text, integer, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gateway_payment_attempt(uuid, uuid, uuid, uuid[], text, numeric, text, text, integer, text, timestamptz)
  TO service_role;

COMMIT;
