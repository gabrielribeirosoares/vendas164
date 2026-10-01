BEGIN;

-- Guarda a única forma automática de pagamento ativa no checkout de cada loja.
-- As integrações permanecem salvas para que o lojista possa alternar depois.
CREATE TABLE IF NOT EXISTS public.store_payment_provider_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  active_provider text CHECK (active_provider IN ('mercadopago', 'infinitepay')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_payment_provider_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_payment_provider_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payment_provider_settings TO service_role;

-- Migra automaticamente lojas com apenas uma integração ativa. Se ambas estiverem
-- ativas, exige que o lojista escolha explicitamente, evitando uma decisão arbitrária.
INSERT INTO public.store_payment_provider_settings (store_id, active_provider)
SELECT store_id,
       CASE
         WHEN has_mp AND NOT has_infinitepay THEN 'mercadopago'
         WHEN has_infinitepay AND NOT has_mp THEN 'infinitepay'
         ELSE NULL
       END
FROM (
  SELECT s.id AS store_id,
         coalesce(mp.is_active AND (mp.access_token IS NOT NULL OR mp.encrypted_tokens IS NOT NULL), false) AS has_mp,
         coalesce(ip.is_active, false) AS has_infinitepay
  FROM public.stores s
  LEFT JOIN public.mercadopago_connections mp ON mp.store_id = s.id
  LEFT JOIN public.infinitepay_connections ip ON ip.store_id = s.id
) configured
WHERE has_mp OR has_infinitepay
ON CONFLICT (store_id) DO NOTHING;

COMMIT;
