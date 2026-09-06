BEGIN;
CREATE TABLE public.bling_connections (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  encrypted_tokens TEXT,
  oauth_state TEXT,
  oauth_expires_at TIMESTAMPTZ,
  refresh_lock_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bling_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bling_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bling_connections TO service_role;
COMMIT;
