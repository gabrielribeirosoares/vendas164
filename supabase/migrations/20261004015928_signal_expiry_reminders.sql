BEGIN;
-- No changes to existing orders, prices, stock or payment records.
CREATE TABLE public.signal_reminder_deliveries (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  claim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, subscription_id, expires_at)
);
ALTER TABLE public.signal_reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_reminder_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_reminder_deliveries TO service_role;
CREATE INDEX signal_reminder_subscription_idx ON public.signal_reminder_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS orders_upcoming_signal_idx ON public.orders(reservation_expires_at, id)
  WHERE payment_status = 'aguardando_sinal' AND delivery_status <> 'cancelado';

-- Atomic lease per order, deadline and device. Only the trusted scheduler can claim.
CREATE OR REPLACE FUNCTION public.claim_signal_reminders(_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_reminder_limit'; END IF;
  WITH candidates AS (
    SELECT o.id AS order_id, o.reservation_expires_at AS expires_at, s.id AS subscription_id
    FROM public.orders o
    JOIN public.push_subscriptions s ON s.user_id = o.user_id
    LEFT JOIN public.signal_reminder_deliveries d ON d.order_id=o.id
      AND d.subscription_id=s.id AND d.expires_at=o.reservation_expires_at
    WHERE o.payment_status='aguardando_sinal' AND o.delivery_status<>'cancelado'
      AND o.reservation_expires_at>now() AND o.reservation_expires_at<=now()+interval '24 hours'
      AND least(o.total_price,greatest(coalesce(o.signal_amount,0),coalesce(o.down_payment,0)))>0
      AND (d.order_id IS NULL OR d.attempts<3 AND (d.status='failed'
        OR d.status='sending' AND d.updated_at<now()-interval '10 minutes'))
    ORDER BY o.reservation_expires_at,o.id,s.id LIMIT _limit
  ), claimed AS (
    INSERT INTO public.signal_reminder_deliveries AS d(order_id,subscription_id,expires_at)
    SELECT order_id,subscription_id,expires_at FROM candidates
    ON CONFLICT(order_id,subscription_id,expires_at) DO UPDATE SET
      claim_id=gen_random_uuid(),status='sending',attempts=d.attempts+1,updated_at=now()
    WHERE d.attempts<3 AND (d.status='failed' OR d.status='sending' AND d.updated_at<now()-interval '10 minutes')
    RETURNING *
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id',d.order_id,'subscription_id',d.subscription_id,'expires_at',d.expires_at,
    'claim_id',d.claim_id,'user_id',o.user_id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,
    'model',p.model,'store_name',st.name,
    'amount',least(o.total_price,greatest(coalesce(o.signal_amount,0),coalesce(o.down_payment,0)))
  )), '[]'::jsonb) INTO result FROM claimed d
  JOIN public.orders o ON o.id=d.order_id
  JOIN public.push_subscriptions s ON s.id=d.subscription_id
  JOIN public.products p ON p.id=o.product_id
  JOIN public.stores st ON st.id=o.store_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_signal_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signal_reminders(integer) TO service_role;

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

REVOKE ALL ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_orders_page(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,INTEGER,INTEGER) TO authenticated, service_role;
COMMIT;
