-- Keep the trigger available to Postgres without exposing it as a Data API RPC.
ALTER FUNCTION public.snapshot_product_on_order()
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.snapshot_product_on_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.snapshot_product_on_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.snapshot_product_on_order() FROM authenticated;
