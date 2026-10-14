BEGIN;

-- Reversing a receipt must also reverse settlement, in the same transaction.
CREATE OR REPLACE FUNCTION public.sync_order_after_installment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
  paid_total numeric;
  signal_paid numeric;
  next_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'paid' THEN RETURN OLD; END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  END IF;

  SELECT * INTO order_row FROM public.orders WHERE id = OLD.order_id FOR UPDATE;
  IF NOT FOUND OR order_row.payment_status = 'cancelado' OR order_row.delivery_status = 'cancelado' THEN
    RETURN NULL;
  END IF;
  signal_paid := CASE WHEN order_row.payment_status IN ('sinal_pago', 'quitado')
    THEN COALESCE(order_row.down_payment, 0) ELSE 0 END;
  SELECT COALESCE(sum(amount), 0) INTO paid_total
    FROM public.order_installments WHERE order_id = order_row.id AND status = 'paid';

  IF round((signal_paid + paid_total) * 100) >= round(order_row.total_price * 100) THEN
    next_status := 'quitado';
  ELSIF signal_paid > 0 THEN
    next_status := 'sinal_pago';
  ELSIF order_row.payment_status <> 'quitado' THEN
    next_status := order_row.payment_status;
  ELSIF COALESCE(order_row.signal_amount, 0) > 0 THEN
    next_status := 'aguardando_sinal';
  ELSE
    next_status := 'sem_sinal';
  END IF;

  UPDATE public.orders SET payment_status = next_status WHERE id = order_row.id
    AND payment_status IS DISTINCT FROM next_status;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_after_installment_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_order_after_installment_change
AFTER UPDATE OF status OR DELETE ON public.order_installments
FOR EACH ROW EXECUTE FUNCTION public.sync_order_after_installment_change();

COMMIT;
