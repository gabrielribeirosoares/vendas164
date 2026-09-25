-- Stop direct financial updates by browser/anonymous clients while the
-- server-only, verified gateway confirmation flow is rolled out.
REVOKE ALL ON FUNCTION public.confirm_gateway_payment(uuid[], numeric, text, text)
  FROM PUBLIC, anon, authenticated;
