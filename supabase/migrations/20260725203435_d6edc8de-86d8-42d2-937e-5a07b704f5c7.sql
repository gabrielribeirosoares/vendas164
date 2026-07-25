
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;
REVOKE ALL ON FUNCTION public.is_store_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_reservation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reservation(UUID) TO authenticated, service_role;
