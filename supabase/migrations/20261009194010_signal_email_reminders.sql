BEGIN;
CREATE TABLE public.signal_email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  consented_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signal_email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_email_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signal_email_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_email_preferences TO service_role;
CREATE POLICY own_signal_email_preference ON public.signal_email_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- Consent writes only through authenticated server functions. No editable recipient input.
CREATE TABLE public.signal_email_deliveries (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  claim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(order_id,expires_at)
);
ALTER TABLE public.signal_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_email_deliveries TO service_role;

CREATE FUNCTION public.claim_signal_email_reminders(_limit integer DEFAULT 10, _user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid_reminder_limit'; END IF;
  WITH candidates AS (
    SELECT o.id AS order_id, o.reservation_expires_at AS expires_at
    FROM public.orders o
    JOIN public.signal_email_preferences pref ON pref.user_id=o.user_id AND pref.enabled
    LEFT JOIN public.signal_email_deliveries d ON d.order_id=o.id AND d.expires_at=o.reservation_expires_at
    WHERE (_user_id IS NULL OR o.user_id=_user_id)
      AND o.payment_status='aguardando_sinal' AND o.delivery_status<>'cancelado'
      AND o.reservation_expires_at>now() AND o.reservation_expires_at<=now()+interval '24 hours'
      AND least(o.total_price,greatest(coalesce(o.signal_amount,0),coalesce(o.down_payment,0)))>0
      AND NOT EXISTS (SELECT 1 FROM public.signal_reminder_deliveries push
        WHERE push.order_id=o.id AND push.expires_at=o.reservation_expires_at AND (push.status='sent' OR push.status='sending' AND push.updated_at>now()-interval '10 minutes'))
      AND (d.order_id IS NULL OR d.attempts<3 AND (d.status='failed'
        OR d.status='sending' AND d.updated_at<now()-interval '10 minutes'))
    ORDER BY o.reservation_expires_at,o.id LIMIT _limit
  ), claimed AS (
    INSERT INTO public.signal_email_deliveries AS d(order_id,expires_at)
    SELECT order_id,expires_at FROM candidates
    ON CONFLICT(order_id,expires_at) DO UPDATE SET
      claim_id=gen_random_uuid(),status='sending',attempts=d.attempts+1,updated_at=now()
    WHERE d.attempts<3 AND (d.status='failed' OR d.status='sending' AND d.updated_at<now()-interval '10 minutes')
    RETURNING *
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('order_id',d.order_id,'expires_at',d.expires_at,
    'claim_id',d.claim_id,'user_id',o.user_id,'email',pref.email)), '[]'::jsonb) INTO result
  FROM claimed d JOIN public.orders o ON o.id=d.order_id
  JOIN public.signal_email_preferences pref ON pref.user_id=o.user_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_signal_email_reminders(integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signal_email_reminders(integer,uuid) TO service_role;

-- Replace the push claim with a targetable version for isolated preview tests.
DROP FUNCTION public.claim_signal_reminders(integer);
CREATE OR REPLACE FUNCTION public.claim_signal_reminders(_limit integer DEFAULT 100, _user_id uuid DEFAULT NULL)
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
    WHERE (_user_id IS NULL OR o.user_id=_user_id)
      AND NOT EXISTS (SELECT 1 FROM public.signal_email_preferences pref WHERE pref.user_id=o.user_id AND pref.enabled)
      AND NOT EXISTS (SELECT 1 FROM public.signal_email_deliveries email WHERE email.order_id=o.id AND email.expires_at=o.reservation_expires_at AND (email.status='sent' OR email.status='sending' AND email.updated_at>now()-interval '10 minutes'))
      AND o.payment_status='aguardando_sinal' AND o.delivery_status<>'cancelado'
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
REVOKE ALL ON FUNCTION public.claim_signal_reminders(integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signal_reminders(integer,uuid) TO service_role;

COMMIT;
