-- =========================================================================
-- CONFIGURAÇÃO COMPLETA MERCADO PAGO + BAIXA AUTOMÁTICA DE PEDIDOS
-- Execute este script no SQL Editor do Supabase (Dashboard -> SQL Editor -> Run)
-- =========================================================================

BEGIN;

-- 1. Colunas de rastreamento do Gateway na tabela de Pedidos
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_status TEXT;

-- 2. Tabela de Conexões e Credenciais do Mercado Pago por Loja
CREATE TABLE IF NOT EXISTS public.mercadopago_connections (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  mp_user_id TEXT,
  public_key TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mercadopago_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mercadopago_connections TO service_role;

-- 3. Função RPC para o Checkout consultar a Chave Pública da Loja
CREATE OR REPLACE FUNCTION public.get_store_payment_public_config(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'is_configured', (is_active AND public_key IS NOT NULL AND access_token IS NOT NULL),
    'public_key', public_key,
    'is_sandbox', is_sandbox
  )
  INTO v_result
  FROM public.mercadopago_connections
  WHERE store_id = p_store_id AND is_active = true;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'is_configured', false,
      'public_key', NULL,
      'is_sandbox', true
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_payment_public_config(UUID) TO anon, authenticated;

-- 4. Função RPC para o Lojista consultar o Status da sua Conexão
CREATE OR REPLACE FUNCTION public.get_store_payment_status(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_conn RECORD;
BEGIN
  SELECT (owner_id = auth.uid()) INTO v_is_owner
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT coalesce(v_is_owner, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Acesso negado: Você não tem permissão para gerenciar esta loja.';
    END IF;
  END IF;

  SELECT is_active, is_sandbox, public_key, mp_user_id, updated_at,
         (access_token IS NOT NULL AND length(access_token) > 10) AS has_token
  INTO v_conn
  FROM public.mercadopago_connections
  WHERE store_id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_configured', false,
      'is_active', false,
      'is_sandbox', true,
      'public_key', NULL,
      'has_token', false,
      'updated_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'is_configured', (v_conn.is_active AND v_conn.has_token AND v_conn.public_key IS NOT NULL),
    'is_active', v_conn.is_active,
    'is_sandbox', v_conn.is_sandbox,
    'public_key', v_conn.public_key,
    'mp_user_id', v_conn.mp_user_id,
    'has_token', v_conn.has_token,
    'updated_at', v_conn.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_payment_status(UUID) TO authenticated;

-- 5. Função RPC para o Lojista salvar suas Credenciais
CREATE OR REPLACE FUNCTION public.save_store_payment_credentials(
  p_store_id UUID,
  p_public_key TEXT,
  p_access_token TEXT,
  p_is_sandbox BOOLEAN DEFAULT true,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT (owner_id = auth.uid()) INTO v_is_owner
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT coalesce(v_is_owner, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Acesso negado: Você não tem permissão para gerenciar esta loja.';
    END IF;
  END IF;

  INSERT INTO public.mercadopago_connections (
    store_id,
    public_key,
    access_token,
    is_sandbox,
    is_active,
    updated_at
  )
  VALUES (
    p_store_id,
    trim(p_public_key),
    trim(p_access_token),
    p_is_sandbox,
    p_is_active,
    now()
  )
  ON CONFLICT (store_id) DO UPDATE SET
    public_key = EXCLUDED.public_key,
    access_token = CASE 
      WHEN length(trim(EXCLUDED.access_token)) > 0 THEN EXCLUDED.access_token 
      ELSE public.mercadopago_connections.access_token 
    END,
    is_sandbox = EXCLUDED.is_sandbox,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_store_payment_credentials(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- 6. FUNÇÃO PRINCIPAL: Baixa automática de pedidos aprovados com SECURITY DEFINER
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
    -- Validação: permitir se for o próprio cliente, lojista ou admin
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

      -- Atualiza status e sinal do pedido
      UPDATE public.orders
      SET payment_status = v_new_status,
          down_payment = v_new_down_payment,
          payment_method = COALESCE(p_payment_method, payment_method),
          gateway_payment_id = COALESCE(p_gateway_id, gateway_payment_id),
          gateway_status = 'approved'
      WHERE id = v_order.id;

      -- Se quitou totalmente, marca parcelas pendentes como pagas
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

-- 7. Seed de credenciais da LOJA TESTE
INSERT INTO public.mercadopago_connections (
  store_id,
  mp_user_id,
  public_key,
  access_token,
  is_sandbox,
  is_active,
  updated_at
)
VALUES (
  '5cdfaeec-48d1-4a0d-825d-d4b25785ff13',
  '3443278484',
  'APP_USR-5fe1ca74-2c4a-4f92-832e-d1060745a302',
  'APP_USR-8834082435427894-092509-454b02c83c5d231d7b473529c3ddb1d4-3443278484',
  true,
  true,
  now()
)
ON CONFLICT (store_id) DO UPDATE SET
  mp_user_id = EXCLUDED.mp_user_id,
  public_key = EXCLUDED.public_key,
  access_token = EXCLUDED.access_token,
  is_sandbox = EXCLUDED.is_sandbox,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
