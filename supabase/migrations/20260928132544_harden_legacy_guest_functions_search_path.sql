-- These legacy maintenance functions are already unavailable to browser roles.
-- Pin their object resolution to trusted schemas as defense in depth.
ALTER FUNCTION public.merge_guest_profile(UUID, UUID[])
  SET search_path = public, pg_temp;

ALTER FUNCTION public.migrar_reservas_telefone_duplicado()
  SET search_path = public, pg_temp;
