-- Permitir que Administradores (SuperAdmin) possam atualizar qualquer loja no painel de moderação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update all stores'
  ) THEN
    CREATE POLICY "Admins can update all stores"
    ON public.stores
    FOR UPDATE
    TO authenticated
    USING (
      (SELECT email FROM auth.users WHERE id = auth.uid()) ILIKE '%gabrielribeirosoares@hotmail.com%'
      OR (SELECT email FROM auth.users WHERE id = auth.uid()) ILIKE '%triade%'
    )
    WITH CHECK (
      (SELECT email FROM auth.users WHERE id = auth.uid()) ILIKE '%gabrielribeirosoares@hotmail.com%'
      OR (SELECT email FROM auth.users WHERE id = auth.uid()) ILIKE '%triade%'
    );
  END IF;
END $$;
