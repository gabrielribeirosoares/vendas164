BEGIN;

CREATE INDEX IF NOT EXISTS orders_store_user_created_idx
  ON public.orders(store_id, user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS customer_store_link_store_created_idx
  ON public.customer_store_link(store_id, created_at DESC, user_id);

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
    OR _focus IS NOT NULL AND _focus NOT IN ('atrasado', 'envios') THEN
    RAISE EXCEPTION 'invalid_orders_page_request';
  END IF;

  WITH order_values AS (
    SELECT o.*, p.brand, p.model, to_jsonb(p)->>'sku' AS sku, p.release_date,
      (COALESCE(to_jsonb(p)->>'category' = 'pronta_entrega', false)
        OR (p.release_date IS NULL AND COALESCE((to_jsonb(p)->>'down_payment_amount')::numeric, 0) <= 0
          AND p.payment_deadline_date IS NULL AND COALESCE(p.payment_deadline_hours, 0) <= 0)) AS ready,
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
    SELECT user_id, product_id, payment_status, delivery_status, COALESCE(pix_key, '') AS pix_key,
      date_trunc('minute', created_at) AS batch_minute,
      array_agg(id ORDER BY created_at, id) AS ids,
      min(created_at) AS first_created_at,
      max(created_at) AS last_created_at
    FROM filtered
    GROUP BY user_id, product_id, payment_status, delivery_status, COALESCE(pix_key, ''), date_trunc('minute', created_at)
  ), page_groups AS (
    SELECT * FROM grouped ORDER BY last_created_at DESC, ids[1] DESC
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
    ) AS item, g.last_created_at
    FROM page_groups g
    JOIN filtered v ON v.id = g.ids[1]
    JOIN public.products p ON p.id = v.product_id
  ), active AS (
    SELECT * FROM order_values WHERE payment_status <> 'cancelado' AND delivery_status <> 'cancelado'
  ), overview AS (
    SELECT COALESCE(sum(total_price), 0) AS projected,
      COALESCE(sum(LEAST(total_price,
        CASE WHEN payment_status IN ('sinal_pago','quitado') THEN down_payment ELSE 0 END + installment_paid)), 0) AS received,
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
    'groups', COALESCE((SELECT jsonb_agg(item ORDER BY last_created_at DESC) FROM page_items), '[]'::jsonb),
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
        CASE WHEN o.payment_status IN ('sinal_pago','quitado') THEN o.down_payment ELSE 0 END + COALESCE(pd.amount, 0)
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
