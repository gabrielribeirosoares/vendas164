BEGIN;

ALTER TABLE public.mercadopago_connections
  ADD COLUMN IF NOT EXISTS encrypted_tokens TEXT,
  ADD COLUMN IF NOT EXISTS oauth_state_hash TEXT,
  ADD COLUMN IF NOT EXISTS oauth_code_verifier TEXT,
  ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_lock_until TIMESTAMPTZ;

ALTER TABLE public.mercadopago_connections
  DROP CONSTRAINT IF EXISTS mercadopago_connections_connection_type_check;
ALTER TABLE public.mercadopago_connections
  ADD CONSTRAINT mercadopago_connections_connection_type_check
  CHECK (connection_type IN ('manual', 'oauth'));

CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_connections_oauth_state_uidx
  ON public.mercadopago_connections (oauth_state_hash)
  WHERE oauth_state_hash IS NOT NULL;

-- A conta passa a ser conectada exclusivamente pelo servidor via OAuth.
-- As conexoes manuais existentes continuam validas, mas novas credenciais
-- nao podem mais ser gravadas diretamente pelo navegador.
REVOKE ALL ON FUNCTION public.save_store_payment_credentials(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_store_payment_credentials(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_store_payment_public_config(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_payment_public_config(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_store_payment_status(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_payment_status(UUID)
  TO service_role;

COMMIT;
