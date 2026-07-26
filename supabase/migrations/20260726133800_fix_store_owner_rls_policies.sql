-- Allow store owners to manage customer_store_link and orders for their store
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Store owners can manage customer_store_link'
  ) THEN
    CREATE POLICY "Store owners can manage customer_store_link"
    ON public.customer_store_link
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = customer_store_link.store_id
          AND stores.owner_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = customer_store_link.store_id
          AND stores.owner_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Store owners can manage orders for their store'
  ) THEN
    CREATE POLICY "Store owners can manage orders for their store"
    ON public.orders
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = orders.store_id
          AND stores.owner_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = orders.store_id
          AND stores.owner_id = auth.uid()
      )
    );
  END IF;
END $$;
