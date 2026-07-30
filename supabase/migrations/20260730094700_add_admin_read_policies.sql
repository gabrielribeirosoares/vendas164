DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = '5fb17599-28a0-4c1c-92cf-38176f7d57a2'
  OR (auth.jwt()->>'email') ILIKE '%gabrielribeirosoares@hotmail.com%'
  OR (auth.jwt()->>'email') ILIKE '%triade%'
);

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  auth.uid() = '5fb17599-28a0-4c1c-92cf-38176f7d57a2'
  OR (auth.jwt()->>'email') ILIKE '%gabrielribeirosoares@hotmail.com%'
  OR (auth.jwt()->>'email') ILIKE '%triade%'
);
