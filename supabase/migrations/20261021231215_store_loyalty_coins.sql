BEGIN;
CREATE TABLE public.loyalty_programs (
 store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.loyalty_accounts (
 store_id uuid REFERENCES public.loyalty_programs(store_id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 eligible_cents bigint NOT NULL DEFAULT 0 CHECK(eligible_cents>=0),
 adjustment bigint NOT NULL DEFAULT 0, spent bigint NOT NULL DEFAULT 0 CHECK(spent>=0),
 PRIMARY KEY(store_id,user_id)
);
CREATE TABLE private.loyalty_order_credit (
 order_id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.loyalty_programs(store_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 baseline bigint NOT NULL DEFAULT 0, eligible_cents bigint NOT NULL DEFAULT 0 CHECK(eligible_cents>=0)
);
ALTER TABLE private.loyalty_order_credit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.loyalty_order_credit FROM PUBLIC,anon,authenticated;
CREATE TABLE public.loyalty_rewards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.loyalty_programs(store_id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 image_url text NOT NULL DEFAULT '' CHECK(image_url='' OR image_url ~ '^https://'),
 coins integer NOT NULL CHECK(coins BETWEEN 1 AND 1000000), stock integer NOT NULL CHECK(stock BETWEEN 0 AND 1000000),
 per_customer_limit integer CHECK(per_customer_limit BETWEEN 1 AND 1000000), active boolean NOT NULL DEFAULT true
);
CREATE INDEX loyalty_rewards_store ON public.loyalty_rewards(store_id);
CREATE TABLE public.loyalty_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL,
 store_id uuid NOT NULL REFERENCES public.loyalty_programs(store_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reward_id uuid NOT NULL REFERENCES public.loyalty_rewards(id), reward_name text NOT NULL, coins integer NOT NULL CHECK(coins>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','shipped','delivered','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(store_id,user_id,request_id)
);
CREATE INDEX loyalty_redemptions_store_user ON public.loyalty_redemptions(store_id,user_id,created_at DESC);
CREATE TABLE public.loyalty_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.loyalty_programs(store_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 coins bigint NOT NULL DEFAULT 0, eligible_cents bigint NOT NULL DEFAULT 0,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500), order_id uuid,
 redemption_id uuid REFERENCES public.loyalty_redemptions(id), actor_id uuid REFERENCES auth.users(id),
 request_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(store_id,request_id)
);
CREATE INDEX loyalty_ledger_store_user ON public.loyalty_ledger(store_id,user_id,created_at DESC);

-- All browser writes use narrowly authorized, atomic commands. No direct writes.
REVOKE ALL ON public.loyalty_programs, public.loyalty_accounts, public.loyalty_rewards, public.loyalty_redemptions, public.loyalty_ledger FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.loyalty_programs, public.loyalty_accounts, public.loyalty_rewards, public.loyalty_redemptions, public.loyalty_ledger TO authenticated;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_program_read ON public.loyalty_programs FOR SELECT TO authenticated USING(enabled OR public.is_store_owner(store_id) OR EXISTS(SELECT 1 FROM public.loyalty_accounts a WHERE a.store_id=loyalty_programs.store_id AND a.user_id=(select auth.uid())));
CREATE POLICY loyalty_account_read ON public.loyalty_accounts FOR SELECT TO authenticated USING(user_id=(select auth.uid()) OR public.is_store_owner(store_id));
CREATE POLICY loyalty_reward_read ON public.loyalty_rewards FOR SELECT TO authenticated USING(public.is_store_owner(store_id) OR (active AND EXISTS(SELECT 1 FROM public.loyalty_programs p WHERE p.store_id=loyalty_rewards.store_id)));
CREATE POLICY loyalty_redemption_read ON public.loyalty_redemptions FOR SELECT TO authenticated USING(user_id=(select auth.uid()) OR public.is_store_owner(store_id));
CREATE POLICY loyalty_ledger_read ON public.loyalty_ledger FOR SELECT TO authenticated USING(user_id=(select auth.uid()) OR public.is_store_owner(store_id));

CREATE FUNCTION private.loyalty_received(_order_id uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE((SELECT CASE WHEN o.payment_status='cancelado' OR o.delivery_status='cancelado' THEN 0
 WHEN o.payment_status='quitado' THEN greatest(0,round(o.total_price*100))
 ELSE least(greatest(0,round(o.total_price*100)),
 CASE WHEN o.payment_status='sinal_pago' THEN greatest(0,round(o.down_payment*100)) ELSE 0 END+
 COALESCE((SELECT sum(greatest(0,round(i.amount*100))) FROM public.order_installments i WHERE i.order_id=o.id AND i.status='paid'),0)) END
 FROM public.orders o WHERE o.id=_order_id),0)::bigint;
$$;
REVOKE ALL ON FUNCTION private.loyalty_received(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.loyalty_sync_order(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; c private.loyalty_order_credit%ROWTYPE; a public.loyalty_accounts%ROWTYPE;
 active boolean; received bigint; next_amount bigint; delta bigint; before_coins bigint;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_id;
 IF o.id IS NOT NULL THEN
   SELECT enabled INTO active FROM public.loyalty_programs WHERE store_id=o.store_id;
   IF NOT FOUND THEN RETURN; END IF;
   INSERT INTO public.loyalty_accounts(store_id,user_id) VALUES(o.store_id,o.user_id) ON CONFLICT DO NOTHING;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=o.store_id AND user_id=o.user_id FOR UPDATE;
   received:=private.loyalty_received(_id);
   INSERT INTO private.loyalty_order_credit(order_id,store_id,user_id,baseline)
    VALUES(_id,o.store_id,o.user_id,CASE WHEN active THEN 0 ELSE received END) ON CONFLICT DO NOTHING;
 ELSE
   SELECT * INTO c FROM private.loyalty_order_credit WHERE order_id=_id;
   IF NOT FOUND THEN RETURN; END IF;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=c.store_id AND user_id=c.user_id FOR UPDATE;
   received:=0; active:=false;
 END IF;
 SELECT * INTO c FROM private.loyalty_order_credit WHERE order_id=_id FOR UPDATE;
 -- Identity of an enrolled order cannot be moved between accounts.
 IF o.id IS NOT NULL AND (o.user_id<>c.user_id OR o.store_id<>c.store_id) THEN RAISE EXCEPTION 'loyalty_order_identity'; END IF;
 next_amount:=greatest(0,received-c.baseline);
 IF NOT active THEN next_amount:=least(c.eligible_cents,next_amount); END IF;
 delta:=next_amount-c.eligible_cents;
 UPDATE private.loyalty_order_credit SET eligible_cents=next_amount,
 baseline=CASE WHEN NOT active THEN greatest(baseline,received-next_amount) ELSE baseline END WHERE order_id=_id;
 IF delta=0 THEN RETURN; END IF;
 before_coins:=a.eligible_cents/5000;
 UPDATE public.loyalty_accounts SET eligible_cents=eligible_cents+delta WHERE store_id=c.store_id AND user_id=c.user_id;
 INSERT INTO public.loyalty_ledger(store_id,user_id,coins,eligible_cents,reason,order_id)
 VALUES(c.store_id,c.user_id,(a.eligible_cents+delta)/5000-before_coins,delta,
 CASE WHEN delta>0 THEN 'Pagamento confirmado' ELSE 'Estorno ou ajuste de pagamento' END,_id);
END;
$$;
REVOKE ALL ON FUNCTION private.loyalty_sync_order(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.loyalty_payment_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='orders' THEN
   IF TG_OP='UPDATE' AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.store_id IS DISTINCT FROM NEW.store_id)
      AND EXISTS(SELECT 1 FROM private.loyalty_order_credit WHERE order_id=OLD.id) THEN RAISE EXCEPTION 'loyalty_order_identity'; END IF;
   IF TG_OP='DELETE' THEN PERFORM private.loyalty_sync_order(OLD.id);
   ELSE PERFORM private.loyalty_sync_order(NEW.id); END IF;
 ELSE
   IF TG_OP<>'INSERT' THEN PERFORM private.loyalty_sync_order(OLD.order_id); END IF;
   IF TG_OP<>'DELETE' THEN PERFORM private.loyalty_sync_order(NEW.order_id); END IF;
 END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.loyalty_payment_trigger() FROM PUBLIC,anon,authenticated;
-- Reconcile final transaction state after existing financial status triggers finish.
CREATE CONSTRAINT TRIGGER loyalty_orders_sync AFTER INSERT OR UPDATE OR DELETE ON public.orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.loyalty_payment_trigger();
CREATE CONSTRAINT TRIGGER loyalty_installments_sync AFTER INSERT OR UPDATE OR DELETE ON public.order_installments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.loyalty_payment_trigger();

CREATE FUNCTION private.loyalty_command(_store_id uuid,_action text,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); a public.loyalty_accounts%ROWTYPE; r public.loyalty_rewards%ROWTYPE;
 d public.loyalty_redemptions%ROWTYPE; target uuid; req uuid; amount bigint; next_status text; rid uuid; current_enabled boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'loyalty_unauthorized'; END IF;
 IF _action<>'redeem' AND NOT public.is_store_owner(_store_id) THEN RAISE EXCEPTION 'loyalty_forbidden'; END IF;
 IF _action='configure' THEN
   -- Serialize first activation with store-level enrollment.
   PERFORM 1 FROM public.stores WHERE id=_store_id FOR UPDATE;
   IF NOT EXISTS(SELECT 1 FROM public.loyalty_programs WHERE store_id=_store_id) THEN
     PERFORM 1 FROM public.orders WHERE store_id=_store_id ORDER BY id FOR UPDATE;
     INSERT INTO public.loyalty_programs(store_id) VALUES(_store_id);
     INSERT INTO public.loyalty_accounts(store_id,user_id)
      SELECT store_id,user_id FROM public.orders WHERE store_id=_store_id
      UNION SELECT store_id,user_id FROM public.customer_store_link WHERE store_id=_store_id
      ON CONFLICT DO NOTHING;
     INSERT INTO private.loyalty_order_credit(order_id,store_id,user_id,baseline)
      SELECT id,store_id,user_id,private.loyalty_received(id) FROM public.orders WHERE store_id=_store_id;
   END IF;
   UPDATE public.loyalty_programs SET enabled=(_data->>'enabled')::boolean WHERE store_id=_store_id;
   RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT enabled INTO current_enabled FROM public.loyalty_programs WHERE store_id=_store_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'loyalty_not_configured'; END IF;
 IF _action='reward' THEN
   rid:=COALESCE((_data->>'id')::uuid,gen_random_uuid());
   SELECT * INTO r FROM public.loyalty_rewards WHERE id=rid FOR UPDATE;
   IF FOUND THEN
     IF r.store_id<>_store_id THEN RAISE EXCEPTION 'loyalty_forbidden'; END IF;
     IF (_data->>'expected_stock')::integer IS DISTINCT FROM r.stock THEN RAISE EXCEPTION 'loyalty_stock_changed'; END IF;
   ELSIF (SELECT count(*) FROM public.loyalty_rewards WHERE store_id=_store_id)>=100 THEN RAISE EXCEPTION 'loyalty_reward_capacity'; END IF;
   INSERT INTO public.loyalty_rewards(id,store_id,name,description,image_url,coins,stock,per_customer_limit,active)
   VALUES(rid,_store_id,trim(_data->>'name'),COALESCE(_data->>'description',''),COALESCE(_data->>'image_url',''),
     (_data->>'coins')::integer,(_data->>'stock')::integer,(_data->>'per_customer_limit')::integer,COALESCE((_data->>'active')::boolean,true))
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,image_url=excluded.image_url,
    coins=excluded.coins,stock=excluded.stock,per_customer_limit=excluded.per_customer_limit,active=excluded.active;
   RETURN jsonb_build_object('id',rid);
 ELSIF _action='adjust' THEN
   target:=(_data->>'user_id')::uuid; req:=(_data->>'request_id')::uuid; amount:=(_data->>'coins')::bigint;
   IF req IS NULL OR amount IS NULL OR amount=0 OR abs(amount)>1000000 OR length(trim(COALESCE(_data->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'loyalty_invalid_adjustment'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.orders WHERE store_id=_store_id AND user_id=target) AND NOT EXISTS(SELECT 1 FROM public.customer_store_link WHERE store_id=_store_id AND user_id=target) THEN RAISE EXCEPTION 'loyalty_customer_not_found'; END IF;
   INSERT INTO public.loyalty_accounts(store_id,user_id) VALUES(_store_id,target) ON CONFLICT DO NOTHING;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=_store_id AND user_id=target FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.loyalty_ledger WHERE store_id=_store_id AND request_id=req) THEN RETURN jsonb_build_object('ok',true); END IF;
   IF amount<0 AND a.eligible_cents/5000+a.adjustment-a.spent+amount<0 THEN RAISE EXCEPTION 'loyalty_insufficient_balance'; END IF;
   UPDATE public.loyalty_accounts SET adjustment=adjustment+amount WHERE store_id=_store_id AND user_id=target;
   INSERT INTO public.loyalty_ledger(store_id,user_id,coins,reason,actor_id,request_id) VALUES(_store_id,target,amount,trim(_data->>'reason'),uid,req);
   RETURN jsonb_build_object('ok',true);
 ELSIF _action='redeem' THEN
   IF NOT current_enabled THEN RAISE EXCEPTION 'loyalty_paused'; END IF;
   req:=(_data->>'request_id')::uuid; rid:=(_data->>'reward_id')::uuid;
   IF req IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'loyalty_invalid_request'; END IF;
   INSERT INTO public.loyalty_accounts(store_id,user_id) VALUES(_store_id,uid) ON CONFLICT DO NOTHING;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=_store_id AND user_id=uid FOR UPDATE;
   SELECT * INTO d FROM public.loyalty_redemptions WHERE store_id=_store_id AND user_id=uid AND request_id=req;
   IF FOUND THEN RETURN jsonb_build_object('id',d.id); END IF;
   SELECT * INTO r FROM public.loyalty_rewards WHERE id=rid AND store_id=_store_id FOR UPDATE;
   IF NOT FOUND OR NOT r.active OR r.stock<=0 THEN RAISE EXCEPTION 'loyalty_reward_unavailable'; END IF;
   IF (_data->>'expected_coins')::integer IS DISTINCT FROM r.coins THEN RAISE EXCEPTION 'loyalty_reward_changed'; END IF;
   IF a.eligible_cents/5000+a.adjustment-a.spent<r.coins THEN RAISE EXCEPTION 'loyalty_insufficient_balance'; END IF;
   IF r.per_customer_limit IS NOT NULL AND (SELECT count(*) FROM public.loyalty_redemptions WHERE reward_id=rid AND user_id=uid AND status<>'rejected')>=r.per_customer_limit THEN RAISE EXCEPTION 'loyalty_reward_limit'; END IF;
   UPDATE public.loyalty_accounts SET spent=spent+r.coins WHERE store_id=_store_id AND user_id=uid;
   UPDATE public.loyalty_rewards SET stock=stock-1 WHERE id=rid;
   INSERT INTO public.loyalty_redemptions(request_id,store_id,user_id,reward_id,reward_name,coins) VALUES(req,_store_id,uid,rid,r.name,r.coins) RETURNING * INTO d;
   INSERT INTO public.loyalty_ledger(store_id,user_id,coins,reason,redemption_id,actor_id) VALUES(_store_id,uid,-r.coins,'Resgate: '||r.name,d.id,uid);
   RETURN jsonb_build_object('id',d.id);
 ELSIF _action='redemption_status' THEN
   SELECT * INTO d FROM public.loyalty_redemptions WHERE id=(_data->>'id')::uuid AND store_id=_store_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'loyalty_request_not_found'; END IF;
   -- Match redemption lock order with redeem: account, reward, redemption.
   PERFORM 1 FROM public.loyalty_accounts WHERE store_id=_store_id AND user_id=d.user_id FOR UPDATE;
   PERFORM 1 FROM public.loyalty_rewards WHERE id=d.reward_id FOR UPDATE;
   SELECT * INTO d FROM public.loyalty_redemptions WHERE id=d.id FOR UPDATE;
   next_status:=_data->>'status';
   IF next_status=d.status THEN RETURN jsonb_build_object('ok',true); END IF;
   IF NOT ((d.status='pending' AND next_status IN ('approved','rejected')) OR (d.status='approved' AND next_status IN ('shipped','rejected')) OR (d.status='shipped' AND next_status='delivered')) THEN RAISE EXCEPTION 'loyalty_invalid_status'; END IF;
   IF next_status='rejected' THEN
     UPDATE public.loyalty_accounts SET spent=spent-d.coins WHERE store_id=_store_id AND user_id=d.user_id;
     UPDATE public.loyalty_rewards SET stock=stock+1 WHERE id=d.reward_id;
     INSERT INTO public.loyalty_ledger(store_id,user_id,coins,reason,redemption_id,actor_id) VALUES(_store_id,d.user_id,d.coins,'Devolução de Coins por resgate recusado',d.id,uid);
   END IF;
   UPDATE public.loyalty_redemptions SET status=next_status,updated_at=now() WHERE id=d.id;
   RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'loyalty_invalid_action';
END;
$$;
REVOKE ALL ON FUNCTION private.loyalty_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.loyalty_command(uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.loyalty_command(_store_id uuid,_action text,_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.loyalty_command(_store_id,_action,_data);$$;
REVOKE ALL ON FUNCTION public.loyalty_command(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_command(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.loyalty_data(_store_id uuid DEFAULT NULL,_customer_id uuid DEFAULT NULL,_offset integer DEFAULT 0,_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; owner boolean:=false; target uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'loyalty_unauthorized'; END IF;
 IF _store_id IS NULL THEN
  RETURN jsonb_build_object('programs',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT p.*,s.name,s.slug FROM public.loyalty_programs p JOIN public.stores s ON s.id=p.store_id
   WHERE public.is_store_owner(p.store_id) OR EXISTS(SELECT 1 FROM public.customer_store_link l WHERE l.store_id=p.store_id AND l.user_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.orders o WHERE o.store_id=p.store_id AND o.user_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.loyalty_accounts a WHERE a.store_id=p.store_id AND a.user_id=auth.uid()) ORDER BY s.name LIMIT 100
  )x),'[]'::jsonb));
 END IF;
 owner:=public.is_store_owner(_store_id);
 target:=CASE WHEN owner THEN _customer_id ELSE auth.uid() END;
 SELECT jsonb_build_object(
  'program',(SELECT to_jsonb(p) FROM public.loyalty_programs p WHERE store_id=_store_id),
  'accounts',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT a.*,greatest(0,a.eligible_cents/5000+a.adjustment-a.spent) AS balance,
    greatest(0,-(a.eligible_cents/5000+a.adjustment-a.spent)) AS deficit,
    a.eligible_cents%5000 AS remainder_cents,p.name AS customer_name
   FROM public.loyalty_accounts a LEFT JOIN public.profiles p ON p.id=a.user_id
   WHERE a.store_id=_store_id AND (target IS NULL OR a.user_id=target)
    AND (COALESCE(_search,'')='' OR p.name ILIKE '%'||left(_search,120)||'%')
   ORDER BY p.name NULLS LAST,a.user_id LIMIT 100 OFFSET CASE WHEN target IS NOT NULL THEN 0 ELSE greatest(0,least(_offset,100000)) END
  )x),'[]'::jsonb),
  'rewards',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.loyalty_rewards WHERE store_id=_store_id ORDER BY coins,name LIMIT 100)x),'[]'::jsonb),
  'redemptions',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT d.*,p.name AS customer_name FROM public.loyalty_redemptions d LEFT JOIN public.profiles p ON p.id=d.user_id WHERE d.store_id=_store_id AND (target IS NULL OR d.user_id=target) ORDER BY created_at DESC LIMIT 100 OFFSET greatest(0,least(_offset,100000)))x),'[]'::jsonb),
  'ledger',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.loyalty_ledger WHERE store_id=_store_id AND (target IS NULL OR user_id=target) ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET greatest(0,least(_offset,100000)))x),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.loyalty_data(uuid,uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_data(uuid,uuid,integer,text) TO authenticated;
COMMIT;
