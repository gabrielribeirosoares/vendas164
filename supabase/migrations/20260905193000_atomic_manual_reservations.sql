BEGIN;
CREATE OR REPLACE FUNCTION public.create_manual_reservations(_request_id UUID, _product_id UUID, _quantity INTEGER, _order JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid(); p RECORD; payload JSONB; previous public.checkout_requests;
  price NUMERIC; paid NUMERIC; signal NUMERIC; count INT; status TEXT;
  customer UUID; expires TIMESTAMPTZ; ids UUID[] := '{}'; new_id UUID;
  cents BIGINT; part BIGINT; due_day INT; first_day DATE; due DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _request_id IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 1 AND 100 OR _order IS NULL THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  payload := jsonb_build_object('manual_product', _product_id, 'quantity', _quantity, 'order', _order);
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || _request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE user_id=uid AND request_id=_request_id;
  IF FOUND THEN
    IF previous.items <> payload THEN RAISE EXCEPTION 'checkout_conflict'; END IF;
    RETURN previous.order_ids;
  END IF;
  SELECT * INTO p FROM public.products WHERE id=_product_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_owner(p.store_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p.stock < _quantity THEN RAISE EXCEPTION 'out_of_stock'; END IF;
  customer := (_order->>'user_id')::UUID;
  price := round((_order->>'total_price')::NUMERIC,2);
  paid := round(COALESCE((_order->>'down_payment')::NUMERIC,0),2);
  signal := round(COALESCE((_order->>'signal_amount')::NUMERIC,0),2);
  count := COALESCE((_order->>'installment_count')::INT,1);
  status := _order->>'payment_status';
  expires := (_order->>'reservation_expires_at')::TIMESTAMPTZ;
  IF customer IS NULL OR price IS NULL OR price < 0 OR paid < 0 OR paid > price OR signal < 0 OR signal > price
    OR count NOT BETWEEN 1 AND 12 OR status IS NULL OR status NOT IN ('aguardando_sinal','sinal_pago','quitado','pronta_entrega','sem_sinal') THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;
  IF status='quitado' THEN paid:=price; END IF;
  IF status IN ('pronta_entrega','sem_sinal') THEN signal:=0; expires:=NULL; END IF;
  IF status<>'aguardando_sinal' THEN expires:=NULL; END IF;
  UPDATE public.products SET initial_stock=COALESCE(initial_stock,stock), stock=stock-_quantity WHERE id=p.id;
  SELECT LEAST(31,GREATEST(1,COALESCE((to_jsonb(s)->>'default_installment_due_day')::INT,
    extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo')::INT))) INTO due_day FROM public.stores s WHERE id=p.store_id;
  FOR n IN 1.._quantity LOOP
    INSERT INTO public.orders(user_id,product_id,store_id,total_price,down_payment,payment_status,delivery_status,
      installment_count,reservation_expires_at,pix_key,signal_amount,sale_type,payment_terms)
    VALUES(customer,p.id,p.store_id,price,paid,status,'pendente',count,expires,_order->>'pix_key',signal,
      CASE WHEN status='pronta_entrega' THEN 'pronta_entrega' ELSE 'pre_venda' END,
      CASE WHEN status IN ('pronta_entrega','sem_sinal') THEN 'sem_sinal' ELSE 'com_sinal' END) RETURNING id INTO new_id;
    ids:=array_append(ids,new_id);
    cents:=round(GREATEST(0,price-GREATEST(signal,paid))*100)::BIGINT;
    IF status<>'quitado' AND count>1 AND cents>0 THEN
      FOR i IN 1..count LOOP
        first_day:=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')+make_interval(months=>i))::DATE;
        due:=first_day+LEAST(due_day,extract(day FROM first_day+interval '1 month - 1 day')::INT)-1;
        part:=cents/count+CASE WHEN i<=cents%count THEN 1 ELSE 0 END;
        INSERT INTO public.order_installments(order_id,installment_number,amount,due_date,status)
          VALUES(new_id,i,part::NUMERIC/100,due::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo','pending');
      END LOOP;
    END IF;
  END LOOP;
  INSERT INTO public.customer_store_link(user_id,store_id) VALUES(customer,p.store_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.checkout_requests(user_id,request_id,items,order_ids) VALUES(uid,_request_id,payload,ids);
  RETURN ids;
END; $$;
REVOKE ALL ON FUNCTION public.create_manual_reservations(UUID,UUID,INTEGER,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manual_reservations(UUID,UUID,INTEGER,JSONB) TO authenticated;
COMMIT;
