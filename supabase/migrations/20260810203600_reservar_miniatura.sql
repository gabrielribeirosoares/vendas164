CREATE OR REPLACE FUNCTION public.reservar_miniatura(
  p_produto_id UUID,
  p_quantidade INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock INT;
BEGIN
  SELECT stock INTO v_stock
  FROM public.products
  WHERE id = p_produto_id
  FOR UPDATE;

  IF v_stock IS NULL OR v_stock < p_quantidade THEN
    RETURN FALSE;
  END IF;

  UPDATE public.products
  SET stock = stock - p_quantidade
  WHERE id = p_produto_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_miniatura(UUID, INT) TO anon, authenticated, service_role;

