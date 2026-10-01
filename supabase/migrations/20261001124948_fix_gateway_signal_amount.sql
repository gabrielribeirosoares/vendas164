BEGIN;

-- Keep the configured deposit in both fields for new and updated orders waiting
-- for the deposit. This covers checkout_cart and manual reservation inserts.
CREATE OR REPLACE FUNCTION public.sync_order_signal_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_signal numeric;
BEGIN
  IF NEW.payment_status = 'aguardando_sinal' THEN
    v_signal := greatest(coalesce(NEW.down_payment, 0), coalesce(NEW.signal_amount, 0));
    IF v_signal > 0 THEN
      NEW.down_payment := v_signal;
      NEW.signal_amount := v_signal;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_order_signal_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_sync_signal_fields ON public.orders;
CREATE TRIGGER orders_sync_signal_fields
  BEFORE INSERT OR UPDATE OF payment_status, down_payment, signal_amount
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_signal_fields();

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
AS $function$
DECLARE
  v_order record;
  v_sorted_ids uuid[];
  v_existing_id uuid;
  v_expected numeric := 0;
  v_signal numeric;
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

  -- Serialize payment creation and use the configured deposit when legacy
  -- orders have signal_amount set but down_payment still zero.
  FOR v_order IN
    SELECT id, store_id, user_id, total_price, down_payment, signal_amount, payment_status
    FROM public.orders
    WHERE id = ANY(v_sorted_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_order.store_id <> p_store_id OR v_order.user_id <> p_user_id
       OR v_order.payment_status NOT IN ('aguardando_sinal', 'sinal_pago', 'pendente', 'sem_sinal', 'pagar_na_chegada', 'pronta_entrega') THEN
      RAISE EXCEPTION 'gateway_order_not_payable';
    END IF;
    v_count := v_count + 1;
    v_signal := greatest(coalesce(v_order.down_payment, 0), coalesce(v_order.signal_amount, 0));
    v_expected := v_expected + CASE
      WHEN v_order.payment_status = 'aguardando_sinal' AND v_signal > 0
        THEN v_signal
      WHEN v_order.payment_status = 'sinal_pago'
        THEN greatest(0, v_order.total_price - v_signal)
      WHEN v_order.payment_status IN ('pendente', 'sem_sinal', 'pagar_na_chegada', 'pronta_entrega')
        THEN v_order.total_price
      ELSE v_order.total_price
    END;
  END LOOP;
  IF v_count <> cardinality(v_sorted_ids) OR round(v_expected, 2) <> p_amount THEN
    RAISE EXCEPTION 'gateway_amount_or_orders_mismatch';
  END IF;

  -- A saved provider link stays locked: it may still be payable outside the app.
  UPDATE public.gateway_payment_attempts a
  SET status = 'failed', updated_at = now()
  WHERE a.status IN ('created', 'pending')
    AND a.response_payload IS NULL
    AND a.updated_at < now() - interval '2 minutes'
    AND a.order_ids && v_sorted_ids;

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
$function$;

REVOKE ALL ON FUNCTION public.create_gateway_payment_attempt(uuid, uuid, uuid, uuid[], text, numeric, text, text, integer, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gateway_payment_attempt(uuid, uuid, uuid, uuid[], text, numeric, text, text, integer, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_gateway_payment_attempt(
  p_attempt_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_gateway_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_attempt public.gateway_payment_attempts%ROWTYPE;
  v_order record;
  v_expected numeric := 0;
  v_signal numeric;
  v_count integer := 0;
BEGIN
  IF p_attempt_id IS NULL OR p_gateway_id IS NULL OR length(p_gateway_id) NOT BETWEEN 1 AND 120
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_gateway_confirmation';
  END IF;

  SELECT * INTO v_attempt FROM public.gateway_payment_attempts
  WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gateway_attempt_not_found'; END IF;

  IF v_attempt.status = 'approved' THEN
    IF v_attempt.provider_payment_id <> p_gateway_id OR v_attempt.amount <> p_amount THEN
      RAISE EXCEPTION 'gateway_payment_reused';
    END IF;
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;
  IF v_attempt.status NOT IN ('created', 'pending', 'expired') OR v_attempt.amount <> p_amount THEN
    RAISE EXCEPTION 'gateway_attempt_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gateway_payment_attempts
             WHERE provider_payment_id = p_gateway_id AND id <> p_attempt_id) THEN
    RAISE EXCEPTION 'gateway_payment_reused';
  END IF;

  FOR v_order IN
    SELECT id, store_id, user_id, total_price, down_payment, signal_amount, payment_status
    FROM public.orders WHERE id = ANY(v_attempt.order_ids) ORDER BY id FOR UPDATE
  LOOP
    IF v_order.store_id <> v_attempt.store_id OR v_order.user_id <> v_attempt.user_id
       OR v_order.payment_status NOT IN ('aguardando_sinal', 'sinal_pago', 'pendente', 'sem_sinal', 'pagar_na_chegada', 'pronta_entrega') THEN
      RAISE EXCEPTION 'gateway_order_not_payable';
    END IF;
    v_count := v_count + 1;
    v_signal := greatest(coalesce(v_order.down_payment, 0), coalesce(v_order.signal_amount, 0));
    v_expected := v_expected + CASE
      WHEN v_order.payment_status = 'aguardando_sinal' AND v_signal > 0
        THEN v_signal
      WHEN v_order.payment_status = 'sinal_pago'
        THEN greatest(0, v_order.total_price - v_signal)
      ELSE v_order.total_price
    END;
  END LOOP;
  IF v_count <> cardinality(v_attempt.order_ids) OR round(v_expected, 2) <> v_attempt.amount THEN
    RAISE EXCEPTION 'gateway_amount_or_orders_mismatch';
  END IF;

  FOR v_order IN
    SELECT id, total_price, down_payment, signal_amount, payment_status
    FROM public.orders WHERE id = ANY(v_attempt.order_ids)
  LOOP
    v_signal := greatest(coalesce(v_order.down_payment, 0), coalesce(v_order.signal_amount, 0));
    UPDATE public.orders SET
      payment_status = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                              AND v_signal > 0 AND v_signal < v_order.total_price
                             THEN 'sinal_pago' ELSE 'quitado' END,
      down_payment = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                            AND v_signal > 0 AND v_signal < v_order.total_price
                           THEN v_signal ELSE v_order.total_price END,
      payment_method = coalesce(p_payment_method, 'mercadopago'),
      gateway_payment_id = p_gateway_id,
      gateway_status = 'approved'
    WHERE id = v_order.id;

    IF v_order.payment_status <> 'aguardando_sinal' OR v_signal <= 0
       OR v_signal >= v_order.total_price THEN
      UPDATE public.order_installments SET status = 'paid', paid_at = now()
      WHERE order_id = v_order.id AND status = 'pending';
    END IF;
  END LOOP;

  UPDATE public.gateway_payment_attempts SET
    status = 'approved', provider_payment_id = p_gateway_id,
    updated_at = now(), completed_at = now()
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object('success', true, 'updated_count', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_gateway_payment_attempt(uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment_attempt(uuid, numeric, text, text)
  TO service_role;

COMMIT;
