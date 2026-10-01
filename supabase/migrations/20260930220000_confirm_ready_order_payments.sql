BEGIN;

-- Confirma pagamentos do valor total também para pedidos sem sinal e pronta entrega.
-- A aprovação continua condicionada à verificação do gateway no servidor.
CREATE OR REPLACE FUNCTION public.confirm_gateway_payment_attempt(
  p_attempt_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_gateway_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt public.gateway_payment_attempts%ROWTYPE;
  v_order record;
  v_expected numeric := 0;
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
    SELECT id, store_id, user_id, total_price, down_payment, payment_status
    FROM public.orders WHERE id = ANY(v_attempt.order_ids) ORDER BY id FOR UPDATE
  LOOP
    IF v_order.store_id <> v_attempt.store_id OR v_order.user_id <> v_attempt.user_id
       OR v_order.payment_status NOT IN ('aguardando_sinal', 'sinal_pago', 'pendente', 'sem_sinal', 'pronta_entrega') THEN
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
  IF v_count <> cardinality(v_attempt.order_ids) OR round(v_expected, 2) <> v_attempt.amount THEN
    RAISE EXCEPTION 'gateway_amount_or_orders_mismatch';
  END IF;

  FOR v_order IN
    SELECT id, total_price, down_payment, payment_status
    FROM public.orders WHERE id = ANY(v_attempt.order_ids)
  LOOP
    UPDATE public.orders SET
      payment_status = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                              AND v_order.down_payment > 0 AND v_order.down_payment < v_order.total_price
                             THEN 'sinal_pago' ELSE 'quitado' END,
      down_payment = CASE WHEN v_order.payment_status = 'aguardando_sinal'
                            AND v_order.down_payment > 0 AND v_order.down_payment < v_order.total_price
                           THEN v_order.down_payment ELSE v_order.total_price END,
      payment_method = coalesce(p_payment_method, 'mercadopago'),
      gateway_payment_id = p_gateway_id,
      gateway_status = 'approved'
    WHERE id = v_order.id;

    IF v_order.payment_status <> 'aguardando_sinal' OR v_order.down_payment <= 0
       OR v_order.down_payment >= v_order.total_price THEN
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
$$;

REVOKE ALL ON FUNCTION public.confirm_gateway_payment_attempt(uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment_attempt(uuid, numeric, text, text)
  TO service_role;

COMMIT;
