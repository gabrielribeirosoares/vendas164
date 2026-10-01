BEGIN;

-- 1. Tabela para armazenar com segurança as credenciais e conexões do Mercado Pago por loja
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

-- 2. Habilitar RLS e restringir acesso direto
ALTER TABLE public.mercadopago_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mercadopago_connections TO service_role;

-- 3. Adicionar campos de gateway nos pedidos caso não existam
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_status TEXT;

-- 4. Função RPC segura para o Frontend do Checkout consultar apenas os dados públicos da loja (Public Key)
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

-- 5. Função RPC segura para o Dono da Loja consultar o status da sua conexão
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
  -- Validar se o usuário autenticado é dono da loja ou admin
  SELECT (owner_id = auth.uid()) INTO v_is_owner
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT coalesce(v_is_owner, false) THEN
    -- Verificar se é admin da plataforma
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

-- 6. Função RPC segura para o Dono da Loja salvar/atualizar suas credenciais
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
  -- Validar permissão
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

-- Credenciais são configuradas individualmente pelo lojista; não incluir tokens em SQL.

COMMIT;
