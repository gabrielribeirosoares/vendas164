-- Adicionar colunas de moderação de status e justificativa na tabela de lojas (stores)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Remover a política antiga se existir
DROP POLICY IF EXISTS "Admins can update all stores" ON public.stores;

-- Permitir que Administradores (SuperAdmin) possam atualizar qualquer loja no painel de moderação usando auth.jwt()
CREATE POLICY "Admins can update all stores"
ON public.stores
FOR UPDATE
TO authenticated
USING (
  coalesce(auth.jwt() ->> 'email', '') ILIKE '%gabrielribeirosoares@hotmail.com%'
  OR coalesce(auth.jwt() ->> 'email', '') ILIKE '%triade%'
  OR (SELECT owner_id FROM public.stores WHERE id = stores.id) = auth.uid()
)
WITH CHECK (
  coalesce(auth.jwt() ->> 'email', '') ILIKE '%gabrielribeirosoares@hotmail.com%'
  OR coalesce(auth.jwt() ->> 'email', '') ILIKE '%triade%'
  OR (SELECT owner_id FROM public.stores WHERE id = stores.id) = auth.uid()
);
