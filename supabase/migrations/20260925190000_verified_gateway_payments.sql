-- Only a server that has independently verified a payment with Mercado Pago
-- may perform this transaction. The old client-callable function stays revoked.
REVOKE ALL ON FUNCTION public.confirm_gateway_payment(uuid[], numeric, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.gateway_payment_confirmations (
  payment_id text PRIMARY KEY,
  store_id uuid NOT NULL,
  order_ids uuid[] NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.gateway_payment_confirmations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_verified_gateway_payment(
  p_store_id uuid,
  p_order_ids uuid[],
  p_amount numeric,
  p_payment_method text,
  p_gateway_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order record;
  v_expected numeric := 0;
  v_count integer := 0;
  v_existing private.gateway_payment_confirmations%ROWTYPE;
  v_sorted_ids uuid[];
BEGIN
  IF p_store_id IS NULL OR p_order_ids IS NULL OR cardinality(p_order_ids) NOT BETWEEN 1 AND 25
     OR p_gateway_id IS NULL OR length(p_gateway_id) NOT BETWEEN 1 AND 120
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_gateway_confirmation';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_sorted_ids
  FROM (SELECT DISTINCT unnest(p_order_ids) AS id) ids;
  IF cardinality(v_sorted_ids) <> cardinality(p_order_ids) OR array_position(v_sorted_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_or_invalid_orders';
  END IF;

  SELECT * INTO v_existing FROM private.gateway_payment_confirmations WHERE payment_id = p_gateway_id;
  IF FOUND THEN
    IF v_existing.store_id <> p_store_id OR v_existing.order_ids <> v_sorted_ids OR v_existing.amount <> p_amount THEN
      RAISE EXCEPTION 'gateway_payment_reused';
    END IF;
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;

  FOR v_order IN
    SELECT id, store_id, total_price, down_payment, payment_status
    FROM public.orders WHERE id = ANY(v_sorted_ids) ORDER BY id FOR UPDATE
  LOOP
    IF v_order.store_id <> p_store_id OR v_order.payment_status NOT IN ('aguardando_sinal', 'sinal_pago', 'pendente') THEN
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

  INSERT INTO private.gateway_payment_confirmations(payment_id, store_id, order_ids, amount)
  VALUES (p_gateway_id, p_store_id, v_sorted_ids, p_amount);

  FOR v_order IN
    SELECT id, total_price, down_payment, payment_status
    FROM public.orders WHERE id = ANY(v_sorted_ids)
  LOOP
    UPDATE public.orders SET
      payment_status = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                              AND v_order.down_payment > 0 AND v_order.down_payment < v_order.total_price
                             THEN 'sinal_pago' ELSE 'quitado' END,
      down_payment = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                            AND v_order.down_payment > 0 AND v_order.down_payment < v_order.total_price
                           THEN v_order.down_payment ELSE v_order.total_price END,
      payment_method = p_payment_method,
      gateway_payment_id = p_gateway_id,
      gateway_status = 'approved'
    WHERE id = v_order.id;

    IF v_order.payment_status <> 'aguardando_sinal' OR v_order.down_payment <= 0
       OR v_order.down_payment >= v_order.total_price THEN
      UPDATE public.order_installments SET status = 'paid', paid_at = now()
      WHERE order_id = v_order.id AND status = 'pending';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'updated_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_verified_gateway_payment(uuid, uuid[], numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_verified_gateway_payment(uuid, uuid[], numeric, text, text)
  TO service_role;
