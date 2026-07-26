
-- Allow store owners to read profiles of customers linked to their store
-- (via customer_store_link or orders).
-- This fixes the "Cliente sem nome registrado" bug where the store owner
-- could not read customer profiles due to RLS restrictions.

CREATE POLICY "store owner reads linked customers"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Users can always read their own profile (already covered, but belt-and-suspenders)
    auth.uid() = id
    OR
    -- Store owners can read profiles of customers linked to their stores
    EXISTS (
      SELECT 1
      FROM public.stores s
      JOIN public.customer_store_link csl ON csl.store_id = s.id
      WHERE s.owner_id = auth.uid()
        AND csl.user_id = profiles.id
    )
    OR
    -- Store owners can read profiles of customers who have orders in their stores
    EXISTS (
      SELECT 1
      FROM public.stores s
      JOIN public.orders o ON o.store_id = s.id
      WHERE s.owner_id = auth.uid()
        AND o.user_id = profiles.id
    )
  );
