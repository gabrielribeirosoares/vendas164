BEGIN;

-- 1. Garantir que as colunas de gateway existem na tabela orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_status TEXT;

-- 2. Função RPC com SECURITY DEFINER para dar baixa automática em pedidos aprovados pelo Mercado Pago
CREATE OR REPLACE FUNCTION public.confirm_gateway_payment(
  p_order_ids UUID[],
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'mercadopago',
  p_gateway_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_count INTEGER := 0;
  v_next_inst INTEGER;
  v_order_balance NUMERIC;
BEGIN
  IF p_order_ids IS NULL OR cardinality(p_order_ids) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum pedido informado.');
  END IF;

  FOR v_order IN
    SELECT o.id, o.store_id, o.user_id, o.total_price, o.down_payment, o.payment_status
    FROM public.orders o
    WHERE o.id = ANY(p_order_ids)
    FOR UPDATE
  LOOP
    -- Permitir se for o próprio cliente comprador, o lojista dono ou service_role/admin
    IF auth.uid() IS NOT NULL 
       AND v_order.user_id <> auth.uid() 
       AND NOT public.is_store_owner(v_order.store_id) THEN
      RAISE EXCEPTION 'Acesso não autorizado para baixar o pedido %', v_order.id;
    END IF;

    -- Determinar se é pagamento de sinal ou quitação total
    DECLARE
      v_new_status TEXT := 'quitado';
      v_new_down_payment NUMERIC := v_order.down_payment;
      v_allocated NUMERIC := COALESCE(p_amount, v_order.total_price);
    BEGIN
      IF v_order.payment_status = 'aguardando_sinal' THEN
        IF v_allocated < v_order.total_price THEN
          v_new_status := 'sinal_pago';
          v_new_down_payment := v_allocated;
        ELSE
          v_new_status := 'quitado';
        END IF;
      ELSIF v_order.payment_status = 'sinal_pago' THEN
        v_new_status := 'quitado';
      END IF;

      IF v_new_status = 'quitado' THEN
        v_new_down_payment := v_order.total_price;
      END IF;

      -- Atualizar pedido com status correto
      UPDATE public.orders
      SET payment_status = v_new_status,
          down_payment = v_new_down_payment,
          payment_method = COALESCE(p_payment_method, payment_method),
          gateway_payment_id = COALESCE(p_gateway_id, gateway_payment_id),
          gateway_status = 'approved'
      WHERE id = v_order.id;

      -- Se quitou totalmente, marcar parcelas pendentes como pagas
      IF v_new_status = 'quitado' THEN
        UPDATE public.order_installments
        SET status = 'paid', paid_at = now()
        WHERE order_id = v_order.id AND status = 'pending';
      END IF;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment(UUID[], NUMERIC, TEXT, TEXT) TO authenticated, anon, service_role;

COMMIT;
