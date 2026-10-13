BEGIN;
DROP POLICY IF EXISTS "Users can delete their own subscriptions by endpoint" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Store owners can manage their subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update their own subscriptions" ON public.push_subscriptions FOR UPDATE TO authenticated USING ((select auth.uid())=user_id) WITH CHECK ((select auth.uid())=user_id);
REVOKE ALL ON public.push_subscriptions FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.push_subscriptions TO authenticated,service_role;

CREATE FUNCTION public.seller_mutate_orders(_ids uuid[],_patch jsonb DEFAULT '{}'::jsonb,_delete boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o record; p record; was_cancelled boolean; now_cancelled boolean; delta integer; changed integer:=0; payment text; delivery text; signal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _ids IS NULL OR cardinality(_ids) NOT BETWEEN 1 AND 1000 OR array_position(_ids,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(_ids) id)<>cardinality(_ids)
    OR _delete IS NULL OR _patch IS NULL OR jsonb_typeof(_patch)<>'object' THEN RAISE EXCEPTION 'invalid_order_mutation'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('payment_status','delivery_status','down_payment','reservation_expires_at')) THEN RAISE EXCEPTION 'invalid_order_mutation'; END IF;
  IF (SELECT count(*) FROM public.orders WHERE id=ANY(_ids))<>cardinality(_ids)
    OR EXISTS(SELECT 1 FROM public.orders WHERE id=ANY(_ids) AND NOT public.is_store_owner(store_id)) THEN RAISE EXCEPTION 'store_access_denied'; END IF;
  IF _patch ? 'payment_status' AND coalesce(_patch->>'payment_status','') NOT IN ('pronta_entrega','sem_sinal','aguardando_sinal','sinal_pago','quitado','cancelado') THEN RAISE EXCEPTION 'invalid_payment_status'; END IF;
  IF _patch ? 'delivery_status' AND coalesce(_patch->>'delivery_status','') NOT IN ('pendente','enviado','em_transito','entregue','cancelado') THEN RAISE EXCEPTION 'invalid_delivery_status'; END IF;
  -- Use the same product-first lock order as checkout, across the whole batch.
  PERFORM id FROM public.products WHERE id IN(SELECT product_id FROM public.orders WHERE id=ANY(_ids)) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.orders WHERE id=ANY(_ids) ORDER BY product_id,id FOR UPDATE;
  IF (SELECT count(*) FROM public.orders WHERE id=ANY(_ids))<>cardinality(_ids) THEN RAISE EXCEPTION 'order_changed'; END IF;
  FOR o IN SELECT * FROM public.orders WHERE id=ANY(_ids) ORDER BY product_id,id LOOP
    IF NOT public.is_store_owner(o.store_id) THEN RAISE EXCEPTION 'store_access_denied'; END IF;
    SELECT * INTO p FROM public.products WHERE id=o.product_id;
    payment:=coalesce(_patch->>'payment_status',o.payment_status);
    delivery:=coalesce(_patch->>'delivery_status',o.delivery_status);
    was_cancelled:=o.payment_status='cancelado' OR o.delivery_status='cancelado';
    now_cancelled:=_delete OR payment='cancelado' OR delivery='cancelado';
    delta:=CASE WHEN NOT was_cancelled AND now_cancelled THEN 1 WHEN was_cancelled AND NOT now_cancelled THEN -1 ELSE 0 END;
    IF o.variant_id IS NULL AND delta<>0 THEN
      IF p.stock+delta<0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;
      UPDATE public.products SET stock=stock+delta WHERE id=o.product_id;
    END IF;
    IF _delete THEN
      DELETE FROM public.orders WHERE id=o.id;
    ELSE
      signal:=CASE WHEN _patch ? 'down_payment' THEN (_patch->>'down_payment')::numeric ELSE o.down_payment END;
      IF NOT (_patch ? 'down_payment') AND _patch ? 'payment_status' THEN
        IF payment IN ('sem_sinal','pronta_entrega','aguardando_sinal') THEN signal:=0;
        ELSIF payment='sinal_pago' AND coalesce(signal,0)=0 THEN signal:=least(o.total_price,coalesce(o.signal_amount,p.down_payment_amount,round(o.total_price*0.2,2))); END IF;
      END IF;
      IF _patch ? 'down_payment' AND (signal IS NULL OR signal<0 OR signal>o.total_price OR round(signal,2)<>signal) THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;
      UPDATE public.orders SET payment_status=payment,delivery_status=delivery,down_payment=signal,
        reservation_expires_at=CASE WHEN _patch ? 'reservation_expires_at' THEN (_patch->>'reservation_expires_at')::timestamptz WHEN _patch ? 'payment_status' AND payment IN ('sinal_pago','quitado','pronta_entrega','sem_sinal') THEN NULL ELSE reservation_expires_at END WHERE id=o.id;
      IF now_cancelled THEN DELETE FROM public.order_installments WHERE order_id=o.id AND status='pending';
      ELSIF _patch->>'payment_status'='quitado' THEN UPDATE public.order_installments SET status='paid' WHERE order_id=o.id AND status='pending';
      ELSIF _patch->>'payment_status'='sinal_pago' AND (SELECT count(*) FROM public.order_installments WHERE order_id=o.id)=1 THEN
        UPDATE public.order_installments SET amount=greatest(0,o.total_price-signal) WHERE order_id=o.id AND status='pending';
      END IF;
    END IF;
    changed:=changed+1;
  END LOOP;
  RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.seller_mutate_orders(uuid[],jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.seller_mutate_orders(uuid[],jsonb,boolean) TO authenticated;

CREATE TABLE private.order_push_claims(order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,event_key text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,event_key));
ALTER TABLE private.order_push_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_push_claims FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.claim_order_push(_order_id uuid,_kind text,_field text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o record; owner uuid; recipient uuid; event text; status text; inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  SELECT owner_id INTO owner FROM public.stores WHERE id=o.store_id;
  IF _kind='new' THEN
    IF o.user_id<>auth.uid() OR o.created_at<now()-interval '15 minutes' THEN RAISE EXCEPTION 'notification_access_denied'; END IF;
    recipient:=owner; event:='new'; status:=NULL;
  ELSIF _kind='update' THEN
    IF NOT public.is_store_owner(o.store_id) THEN RAISE EXCEPTION 'notification_access_denied'; END IF;
    IF _field NOT IN ('payment','delivery') OR _field IS NULL THEN RAISE EXCEPTION 'invalid_notification'; END IF;
    recipient:=o.user_id; status:=CASE WHEN _field='payment' THEN o.payment_status ELSE o.delivery_status END;
    event:=_field||':'||status;
  ELSE RAISE EXCEPTION 'invalid_notification'; END IF;
  INSERT INTO private.order_push_claims(order_id,event_key) VALUES(o.id,event) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('recipient',recipient,'status',status);
END; $$;
REVOKE ALL ON FUNCTION public.claim_order_push(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_order_push(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.seller_orders_page(
  _store_id UUID,
  _search TEXT DEFAULT '',
  _payment TEXT DEFAULT 'todos',
  _delivery TEXT DEFAULT 'todos',
  _category TEXT DEFAULT 'todos',
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL,
  _focus TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 25
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_store_owner(_store_id) THEN RAISE EXCEPTION 'store_access_denied'; END IF;
  IF _page NOT BETWEEN 1 AND 100000 OR _page_size NOT BETWEEN 1 AND 100
    OR length(COALESCE(_search, '')) > 200
    OR _category NOT IN ('todos', 'pre_venda', 'pronta_entrega')
    OR _focus IS NOT NULL AND _focus NOT IN ('atrasado', 'envios', 'vencendo') THEN
    RAISE EXCEPTION 'invalid_orders_page_request';
  END IF;

  WITH order_values AS (
    SELECT o.*, p.brand, p.model, to_jsonb(p)->>'sku' AS sku, p.release_date,
      CASE
        WHEN o.sale_type = 'pronta_entrega' THEN true
        WHEN o.sale_type = 'pre_venda' THEN false
        WHEN o.payment_status = 'pronta_entrega' THEN true
        ELSE (
          COALESCE(to_jsonb(p)->>'category' = 'pronta_entrega', false)
          OR (
            p.release_date IS NULL
            AND COALESCE((to_jsonb(p)->>'down_payment_amount')::numeric, 0) <= 0
            AND p.payment_deadline_date IS NULL
            AND COALESCE(p.payment_deadline_hours, 0) <= 0
          )
        )
      END AS ready,
      pr.name AS profile_name, pr.email AS profile_email, pr.phone AS profile_phone,
      COALESCE(inst.items, '[]'::jsonb) AS installments,
      COALESCE(inst.paid, 0) AS installment_paid
    FROM public.orders o
    JOIN public.products p ON p.id = o.product_id
    LEFT JOIN public.profiles pr ON pr.id = o.user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.installment_number) AS items,
        COALESCE(sum(oi.amount) FILTER (WHERE oi.status = 'paid'), 0) AS paid
      FROM public.order_installments oi WHERE oi.order_id = o.id
    ) inst ON true
    WHERE o.store_id = _store_id
  ), filtered AS (
    SELECT * FROM order_values v
    WHERE (_start_date IS NULL OR v.created_at >= _start_date::timestamptz)
      AND (_end_date IS NULL OR v.created_at < (_end_date + 1)::timestamptz)
      AND (_category = 'todos' OR (_category = 'pronta_entrega' AND v.ready) OR (_category = 'pre_venda' AND NOT v.ready))
      AND (
        _focus = 'atrasado' AND v.payment_status = 'aguardando_sinal' AND v.reservation_expires_at < now()
        OR _focus = 'vencendo' AND v.payment_status = 'aguardando_sinal' AND v.delivery_status <> 'cancelado' AND v.reservation_expires_at > now() AND v.reservation_expires_at <= now() + interval '24 hours'
        OR _focus = 'envios' AND v.payment_status = 'quitado' AND v.delivery_status NOT IN ('enviado','em_transito','cancelado','entregue')
        OR _focus IS NULL
      )
      AND (
        _payment = 'atrasado' AND v.payment_status = 'aguardando_sinal' AND v.reservation_expires_at < now()
        OR _payment <> 'atrasado' AND (_payment = 'todos' OR v.payment_status = _payment)
      )
      AND (_delivery = 'todos' OR v.delivery_status = _delivery)
      AND (NOT (_payment = 'todos' AND _delivery = 'todos') OR (v.payment_status <> 'cancelado' AND v.delivery_status <> 'cancelado'))
      AND (COALESCE(_search, '') = '' OR lower(
        COALESCE(v.profile_name, '') || ' ' || COALESCE(v.profile_email, '') || ' ' ||
        COALESCE(v.profile_phone, '') || ' ' || COALESCE(v.model, '') || ' ' ||
        COALESCE(v.brand, '') || ' ' || COALESCE(v.sku, '') || ' ' ||
        v.id::text || ' ' || COALESCE(to_jsonb(v)->>'tracking_code', '')
      ) LIKE '%' || lower(trim(leading '#' FROM _search)) || '%')
  ), grouped AS (
    SELECT user_id, product_id, variant_id, payment_status, delivery_status, COALESCE(pix_key, '') AS pix_key,
      date_trunc('minute', created_at) AS batch_minute,
      array_agg(id ORDER BY created_at, id) AS ids,
      min(created_at) AS first_created_at,
      max(created_at) AS last_created_at,
      min(reservation_expires_at) AS earliest_expiry
    FROM filtered
    GROUP BY user_id, product_id, variant_id, payment_status, delivery_status, COALESCE(pix_key, ''), date_trunc('minute', created_at)
  ), page_groups AS (
    SELECT * FROM grouped ORDER BY CASE WHEN _focus = 'vencendo' THEN earliest_expiry END ASC NULLS LAST, last_created_at DESC, ids[1] DESC
    LIMIT _page_size OFFSET ((_page - 1) * _page_size)
  ), page_items AS (
    SELECT jsonb_build_object(
      'ids', to_jsonb(g.ids),
      'quantity', cardinality(g.ids),
      'order', to_jsonb(v) - 'brand' - 'model' - 'sku' - 'release_date' - 'ready'
        - 'profile_name' - 'profile_email' - 'profile_phone' - 'installments' - 'installment_paid'
        || jsonb_build_object(
          'products', to_jsonb(p),
          'profiles', jsonb_build_object('name', v.profile_name, 'email', v.profile_email, 'phone', v.profile_phone),
          'order_installments', v.installments
        )
    ) AS item, g.last_created_at, g.earliest_expiry, g.ids[1] AS first_id
    FROM page_groups g
    JOIN filtered v ON v.id = g.ids[1]
    JOIN public.products p ON p.id = v.product_id
  ), active AS (
    SELECT * FROM order_values WHERE payment_status <> 'cancelado' AND delivery_status <> 'cancelado'
  ), overview AS (
    SELECT COALESCE(sum(total_price), 0) AS projected,
      COALESCE(sum(LEAST(total_price,
        CASE WHEN payment_status='quitado' THEN total_price ELSE CASE WHEN payment_status='sinal_pago' THEN down_payment ELSE 0 END + installment_paid END)), 0) AS received,
      count(*) AS active_count,
      count(*) FILTER (WHERE payment_status = 'quitado') AS paid_in_full,
      count(*) FILTER (WHERE ready) AS ready_count,
      count(*) FILTER (WHERE NOT ready) AS preorder_count
    FROM active
  ), brand_stats AS (
    SELECT brand AS name, count(*) AS count FROM active
    GROUP BY brand ORDER BY count(*) DESC, brand LIMIT 5
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT jsonb_agg(item ORDER BY CASE WHEN _focus = 'vencendo' THEN earliest_expiry END ASC NULLS LAST, last_created_at DESC, first_id DESC) FROM page_items), '[]'::jsonb),
    'total', (SELECT count(*) FROM grouped),
    'counts', jsonb_build_object(
      'all', (SELECT count(*) FROM active),
      'preorder', (SELECT preorder_count FROM overview),
      'ready', (SELECT ready_count FROM overview)
    ),
    'overview', jsonb_build_object(
      'projected', (SELECT projected FROM overview),
      'received', (SELECT received FROM overview),
      'pending', GREATEST(0, (SELECT projected - received FROM overview)),
      'activeCount', (SELECT active_count FROM overview),
      'avgTicket', CASE WHEN (SELECT active_count FROM overview) > 0 THEN (SELECT projected / active_count FROM overview) ELSE 0 END,
      'paidInFull', (SELECT paid_in_full FROM overview)
    ),
    'brands', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM brand_stats b), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.seller_clients_page(
  _store_id UUID,
  _search TEXT DEFAULT '',
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 25
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_store_owner(_store_id) THEN RAISE EXCEPTION 'store_access_denied'; END IF;
  IF _page NOT BETWEEN 1 AND 100000 OR _page_size NOT BETWEEN 1 AND 100
    OR length(COALESCE(_search, '')) > 200 THEN RAISE EXCEPTION 'invalid_clients_page_request'; END IF;

  WITH customer_events AS (
    SELECT user_id, created_at FROM public.customer_store_link WHERE store_id = _store_id
    UNION ALL
    SELECT user_id, created_at FROM public.orders WHERE store_id = _store_id
  ), customer_ids AS (
    SELECT user_id, min(created_at) AS linked_at FROM customer_events GROUP BY user_id
  ), paid AS (
    SELECT oi.order_id, COALESCE(sum(oi.amount) FILTER (WHERE oi.status = 'paid'), 0) AS amount
    FROM public.order_installments oi
    JOIN public.orders o ON o.id = oi.order_id AND o.store_id = _store_id
    GROUP BY oi.order_id
  ), order_summary AS (
    SELECT o.user_id,
      count(*) FILTER (WHERE o.payment_status <> 'cancelado' AND o.delivery_status <> 'cancelado') AS total_items,
      COALESCE(sum(o.total_price) FILTER (WHERE o.payment_status <> 'cancelado' AND o.delivery_status <> 'cancelado'), 0) AS total_spent,
      COALESCE(sum(LEAST(o.total_price,
        CASE WHEN o.payment_status='quitado' THEN o.total_price ELSE CASE WHEN o.payment_status='sinal_pago' THEN o.down_payment ELSE 0 END + COALESCE(pd.amount, 0) END
      )) FILTER (WHERE o.payment_status <> 'cancelado' AND o.delivery_status <> 'cancelado'), 0) AS total_paid,
      min(o.created_at) AS first_order,
      count(*) FILTER (WHERE o.delivery_status = 'entregue' AND o.payment_status <> 'cancelado') AS delivered_count,
      count(*) FILTER (WHERE o.delivery_status = 'em_transito' AND o.payment_status <> 'cancelado') AS shipped_count,
      count(*) FILTER (WHERE o.delivery_status NOT IN ('entregue','em_transito','cancelado') AND (p.release_date IS NULL OR p.release_date <= CURRENT_DATE) AND o.payment_status <> 'cancelado') AS arrived_count,
      count(*) FILTER (WHERE o.delivery_status NOT IN ('entregue','em_transito','cancelado') AND p.release_date > CURRENT_DATE AND o.payment_status <> 'cancelado') AS preorder_count
    FROM public.orders o
    JOIN public.products p ON p.id = o.product_id
    LEFT JOIN paid pd ON pd.order_id = o.id
    WHERE o.store_id = _store_id
    GROUP BY o.user_id
  ), clients AS (
    SELECT c.user_id, p.name, p.email, p.phone,
      COALESCE(os.total_items, 0) AS total_items,
      COALESCE(os.total_spent, 0) AS total_spent,
      COALESCE(os.total_paid, 0) AS total_paid,
      GREATEST(0, COALESCE(os.total_spent, 0) - COALESCE(os.total_paid, 0)) AS remaining_balance,
      COALESCE(os.arrived_count, 0) AS arrived_count,
      COALESCE(os.preorder_count, 0) AS preorder_count,
      COALESCE(os.shipped_count, 0) AS shipped_count,
      COALESCE(os.delivered_count, 0) AS delivered_count,
      COALESCE(os.first_order, c.linked_at, p.created_at) AS first_order_date,
      COALESCE(os.total_items, 0) = 0 AS follower_only
    FROM customer_ids c
    LEFT JOIN public.profiles p ON p.id = c.user_id
    LEFT JOIN order_summary os ON os.user_id = c.user_id
  ), filtered AS (
    SELECT * FROM clients c WHERE COALESCE(_search, '') = '' OR lower(
      COALESCE(c.name, '') || ' ' || COALESCE(c.email, '') || ' ' || COALESCE(c.phone, '')
    ) LIKE '%' || lower(_search) || '%'
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY total_spent DESC, first_order_date DESC, user_id
    LIMIT _page_size OFFSET ((_page - 1) * _page_size)
  ), top_clients AS (
    SELECT user_id, name, total_spent FROM clients ORDER BY total_spent DESC, user_id LIMIT 3
  ), top_brand AS (
    SELECT p.brand, count(*) AS count FROM public.orders o JOIN public.products p ON p.id = o.product_id
    WHERE o.store_id = _store_id AND o.payment_status <> 'cancelado' AND o.delivery_status <> 'cancelado'
    GROUP BY p.brand ORDER BY count(*) DESC, p.brand LIMIT 1
  )
  SELECT jsonb_build_object(
    'clients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'profile', jsonb_build_object('id', user_id, 'name', COALESCE(name, 'Cliente'), 'email', COALESCE(email, ''), 'phone', COALESCE(phone, '')),
      'orders', '[]'::jsonb,
      'totalSpent', total_spent, 'totalPaid', total_paid, 'remainingBalance', remaining_balance,
      'progressPercent', CASE WHEN total_spent > 0 THEN LEAST(100, round(total_paid * 100 / total_spent)) ELSE 0 END,
      'totalItems', total_items, 'arrivedCount', arrived_count, 'preorderCount', preorder_count,
      'shippedCount', shipped_count, 'deliveredCount', delivered_count,
      'firstOrderDate', first_order_date, 'isFollowerOnly', follower_only
    ) ORDER BY total_spent DESC, first_order_date DESC) FROM page_rows), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'stats', jsonb_build_object(
      'topBrand', COALESCE((SELECT brand FROM top_brand), 'Nenhuma venda'),
      'topBrandCount', COALESCE((SELECT count FROM top_brand), 0),
      'newClientsThisMonth', (SELECT count(*) FROM clients WHERE date_trunc('month', first_order_date) = date_trunc('month', CURRENT_DATE)),
      'topClients', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY total_spent DESC) FROM top_clients t), '[]'::jsonb)
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seller_clients_page(UUID,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seller_clients_page(UUID,TEXT,INTEGER,INTEGER) TO authenticated, service_role;


COMMIT;
