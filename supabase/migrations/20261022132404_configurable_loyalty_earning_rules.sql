BEGIN;
-- Immutable earning rules keep credits and refunds at their original rate.
CREATE TABLE private.loyalty_earning_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 version bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 spend_cents bigint NOT NULL CHECK(spend_cents BETWEEN 1 AND 100000000),
 coins_per_step integer NOT NULL CHECK(coins_per_step BETWEEN 1 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid REFERENCES auth.users(id),
 UNIQUE(id,store_id)
);
ALTER TABLE public.loyalty_programs ADD COLUMN spend_cents bigint NOT NULL DEFAULT 5000 CHECK(spend_cents BETWEEN 1 AND 100000000),
 ADD COLUMN coins_per_step integer NOT NULL DEFAULT 1 CHECK(coins_per_step BETWEEN 1 AND 1000000), ADD COLUMN rule_id uuid;
INSERT INTO private.loyalty_earning_rules(store_id,spend_cents,coins_per_step) SELECT store_id,5000,1 FROM public.loyalty_programs;
UPDATE public.loyalty_programs p SET rule_id=r.id FROM private.loyalty_earning_rules r WHERE r.store_id=p.store_id;
ALTER TABLE public.loyalty_programs ALTER COLUMN rule_id SET NOT NULL,
 ADD CONSTRAINT loyalty_program_rule_fk FOREIGN KEY(rule_id,store_id) REFERENCES private.loyalty_earning_rules(id,store_id);
ALTER TABLE public.loyalty_accounts ADD COLUMN earned_coins bigint NOT NULL DEFAULT 0 CHECK(earned_coins>=0);
UPDATE public.loyalty_accounts SET earned_coins=eligible_cents/5000;
CREATE TABLE private.loyalty_rule_accounts (
 rule_id uuid NOT NULL, store_id uuid NOT NULL, user_id uuid NOT NULL,
 eligible_cents bigint NOT NULL DEFAULT 0 CHECK(eligible_cents>=0), PRIMARY KEY(rule_id,user_id),
 FOREIGN KEY(rule_id,store_id) REFERENCES private.loyalty_earning_rules(id,store_id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,user_id) REFERENCES public.loyalty_accounts(store_id,user_id) ON DELETE CASCADE
);
CREATE INDEX loyalty_rule_accounts_customer ON private.loyalty_rule_accounts(store_id,user_id);
CREATE TABLE private.loyalty_order_rule_credit (
 order_id uuid REFERENCES private.loyalty_order_credit(order_id) ON DELETE CASCADE,
 rule_id uuid REFERENCES private.loyalty_earning_rules(id) ON DELETE CASCADE,
 eligible_cents bigint NOT NULL CHECK(eligible_cents>=0), PRIMARY KEY(order_id,rule_id)
);
INSERT INTO private.loyalty_rule_accounts(rule_id,store_id,user_id,eligible_cents)
 SELECT p.rule_id,a.store_id,a.user_id,a.eligible_cents FROM public.loyalty_accounts a JOIN public.loyalty_programs p USING(store_id);
INSERT INTO private.loyalty_order_rule_credit(order_id,rule_id,eligible_cents)
 SELECT c.order_id,p.rule_id,c.eligible_cents FROM private.loyalty_order_credit c JOIN public.loyalty_programs p USING(store_id) WHERE c.eligible_cents>0;
ALTER TABLE private.loyalty_earning_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.loyalty_rule_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.loyalty_order_rule_credit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.loyalty_earning_rules,private.loyalty_rule_accounts,private.loyalty_order_rule_credit FROM PUBLIC,anon,authenticated;
-- These tables are internal-only, including when their schema is accidentally exposed.
CREATE POLICY loyalty_rules_internal ON private.loyalty_earning_rules FOR ALL TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY loyalty_rule_accounts_internal ON private.loyalty_rule_accounts FOR ALL TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY loyalty_order_rules_internal ON private.loyalty_order_rule_credit FOR ALL TO authenticated USING(false) WITH CHECK(false);

CREATE FUNCTION private.loyalty_apply_rule_credit(_store_id uuid,_user_id uuid,_order_id uuid,_rule_id uuid,_delta bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r private.loyalty_earning_rules%ROWTYPE; before_amount bigint; after_amount bigint;
BEGIN
 SELECT * INTO STRICT r FROM private.loyalty_earning_rules WHERE id=_rule_id AND store_id=_store_id;
 INSERT INTO private.loyalty_rule_accounts(rule_id,store_id,user_id) VALUES(_rule_id,_store_id,_user_id) ON CONFLICT DO NOTHING;
 SELECT eligible_cents INTO STRICT before_amount FROM private.loyalty_rule_accounts WHERE rule_id=_rule_id AND user_id=_user_id FOR UPDATE;
 after_amount:=before_amount+_delta;
 IF after_amount<0 THEN RAISE EXCEPTION 'loyalty_rule_balance_invariant'; END IF;
 UPDATE private.loyalty_rule_accounts SET eligible_cents=after_amount WHERE rule_id=_rule_id AND user_id=_user_id;
 INSERT INTO private.loyalty_order_rule_credit(order_id,rule_id,eligible_cents) VALUES(_order_id,_rule_id,greatest(0,_delta))
 ON CONFLICT(order_id,rule_id) DO UPDATE SET eligible_cents=loyalty_order_rule_credit.eligible_cents+_delta;
 RETURN ((after_amount/r.spend_cents)-(before_amount/r.spend_cents))*r.coins_per_step;
END;
$$;
REVOKE ALL ON FUNCTION private.loyalty_apply_rule_credit(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.loyalty_sync_order(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; c private.loyalty_order_credit%ROWTYPE; a public.loyalty_accounts%ROWTYPE;
 p public.loyalty_programs%ROWTYPE; b record; received bigint; next_amount bigint; delta bigint;
 rest bigint; part bigint; coin_delta bigint:=0;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_id;
 IF o.id IS NOT NULL THEN
   SELECT * INTO p FROM public.loyalty_programs WHERE store_id=o.store_id FOR SHARE;
   IF NOT FOUND THEN RETURN; END IF;
   INSERT INTO public.loyalty_accounts(store_id,user_id) VALUES(o.store_id,o.user_id) ON CONFLICT DO NOTHING;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=o.store_id AND user_id=o.user_id FOR UPDATE;
   received:=private.loyalty_received(_id);
   INSERT INTO private.loyalty_order_credit(order_id,store_id,user_id,baseline)
    VALUES(_id,o.store_id,o.user_id,CASE WHEN p.enabled THEN 0 ELSE received END) ON CONFLICT DO NOTHING;
 ELSE
   SELECT * INTO c FROM private.loyalty_order_credit WHERE order_id=_id;
   IF NOT FOUND THEN RETURN; END IF;
   SELECT * INTO p FROM public.loyalty_programs WHERE store_id=c.store_id FOR SHARE;
   IF NOT FOUND THEN RETURN; END IF;
   SELECT * INTO a FROM public.loyalty_accounts WHERE store_id=c.store_id AND user_id=c.user_id FOR UPDATE;
   received:=0; p.enabled:=false;
 END IF;
 SELECT * INTO c FROM private.loyalty_order_credit WHERE order_id=_id FOR UPDATE;
 IF o.id IS NOT NULL AND (o.user_id<>c.user_id OR o.store_id<>c.store_id) THEN RAISE EXCEPTION 'loyalty_order_identity'; END IF;
 next_amount:=greatest(0,received-c.baseline);
 IF NOT p.enabled THEN next_amount:=least(c.eligible_cents,next_amount); END IF;
 delta:=next_amount-c.eligible_cents;
 UPDATE private.loyalty_order_credit SET eligible_cents=next_amount,
 baseline=CASE WHEN NOT p.enabled THEN greatest(baseline,received-next_amount) ELSE baseline END WHERE order_id=_id;
 IF delta=0 THEN RETURN; END IF;
 rest:=abs(delta);
 IF delta>0 THEN
   -- Complete unfinished progress under its original rule before using the new one.
   FOR b IN SELECT ra.rule_id,ra.eligible_cents,r.spend_cents FROM private.loyalty_rule_accounts ra
     JOIN private.loyalty_earning_rules r ON r.id=ra.rule_id WHERE ra.store_id=c.store_id AND ra.user_id=c.user_id
     AND ra.rule_id<>p.rule_id AND ra.eligible_cents%r.spend_cents>0 ORDER BY r.version
   LOOP
     part:=least(rest,b.spend_cents-b.eligible_cents%b.spend_cents);
     coin_delta:=coin_delta+private.loyalty_apply_rule_credit(c.store_id,c.user_id,_id,b.rule_id,part);
     rest:=rest-part; EXIT WHEN rest=0;
   END LOOP;
   IF rest>0 THEN coin_delta:=coin_delta+private.loyalty_apply_rule_credit(c.store_id,c.user_id,_id,p.rule_id,rest); END IF;
 ELSE
   -- Reverse only this order's original contributions, newest rule first.
   FOR b IN SELECT oc.rule_id,oc.eligible_cents FROM private.loyalty_order_rule_credit oc
     JOIN private.loyalty_earning_rules r ON r.id=oc.rule_id WHERE oc.order_id=_id AND oc.eligible_cents>0 ORDER BY r.version DESC
   LOOP
     part:=least(rest,b.eligible_cents);
     coin_delta:=coin_delta+private.loyalty_apply_rule_credit(c.store_id,c.user_id,_id,b.rule_id,-part);
     rest:=rest-part; EXIT WHEN rest=0;
   END LOOP;
   IF rest<>0 THEN RAISE EXCEPTION 'loyalty_refund_invariant'; END IF;
 END IF;
 UPDATE public.loyalty_accounts SET eligible_cents=eligible_cents+delta,earned_coins=earned_coins+coin_delta WHERE store_id=c.store_id AND user_id=c.user_id;
 INSERT INTO public.loyalty_ledger(store_id,user_id,coins,eligible_cents,reason,order_id)
 VALUES(c.store_id,c.user_id,coin_delta,delta,CASE WHEN delta>0 THEN 'Pagamento confirmado' ELSE 'Estorno ou ajuste de pagamento' END,_id);
END;
$$;

CREATE FUNCTION private.loyalty_progress(_store_id uuid,_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.loyalty_programs%ROWTYPE; b record;
BEGIN
 IF auth.uid() IS NULL OR _user_id IS NULL OR _store_id IS NULL OR (auth.uid()<>_user_id AND NOT public.is_store_owner(_store_id)) THEN RAISE EXCEPTION 'loyalty_forbidden'; END IF;
 SELECT * INTO p FROM public.loyalty_programs WHERE store_id=_store_id;
 SELECT r.spend_cents,r.coins_per_step,ra.eligible_cents%r.spend_cents AS remainder,r.id<>p.rule_id AS previous_rule INTO b
 FROM private.loyalty_rule_accounts ra JOIN private.loyalty_earning_rules r ON r.id=ra.rule_id
 WHERE ra.store_id=_store_id AND ra.user_id=_user_id AND (ra.rule_id=p.rule_id OR ra.eligible_cents%r.spend_cents>0)
 ORDER BY (r.id=p.rule_id),r.version LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('remainder_cents',b.remainder,'next_spend_cents',b.spend_cents,'next_coins',b.coins_per_step,'previous_rule',b.previous_rule); END IF;
 RETURN jsonb_build_object('remainder_cents',0,'next_spend_cents',p.spend_cents,'next_coins',p.coins_per_step,'previous_rule',false);
END;
$$;
REVOKE ALL ON FUNCTION private.loyalty_progress(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.loyalty_progress(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.loyalty_command(_store_id uuid,_action text,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); a public.loyalty_accounts%ROWTYPE; r public.loyalty_rewards%ROWTYPE;
 d public.loyalty_redemptions%ROWTYPE; target uuid; req uuid; amount bigint; next_status text; rid uuid; current_enabled boolean; p public.loyalty_programs%ROWTYPE; next_spend numeric; next_coins numeric; new_rule uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'loyalty_unauthorized'; END IF;
 IF _action<>'redeem' AND NOT public.is_store_owner(_store_id) THEN RAISE EXCEPTION 'loyalty_forbidden'; END IF;
 IF _action='configure' THEN
   PERFORM 1 FROM public.stores WHERE id=_store_id FOR UPDATE;
   SELECT * INTO p FROM public.loyalty_programs WHERE store_id=_store_id FOR UPDATE;
   IF p.store_id IS NOT NULL AND _data ? 'expected_rule_id' AND (_data->>'expected_rule_id')::uuid IS DISTINCT FROM p.rule_id THEN RAISE EXCEPTION 'loyalty_rule_changed'; END IF;
   next_spend:=CASE WHEN _data ? 'spend_cents' THEN (_data->>'spend_cents')::numeric ELSE COALESCE(p.spend_cents,5000) END;
   next_coins:=CASE WHEN _data ? 'coins_per_step' THEN (_data->>'coins_per_step')::numeric ELSE COALESCE(p.coins_per_step,1) END;
   IF next_spend IS NULL OR next_spend NOT BETWEEN 1 AND 100000000 OR next_spend<>trunc(next_spend)
     OR next_coins IS NULL OR next_coins NOT BETWEEN 1 AND 1000000 OR next_coins<>trunc(next_coins) THEN RAISE EXCEPTION 'loyalty_invalid_rule'; END IF;
   IF p.store_id IS NULL THEN
     PERFORM 1 FROM public.orders WHERE store_id=_store_id ORDER BY id FOR UPDATE;
     INSERT INTO private.loyalty_earning_rules(store_id,spend_cents,coins_per_step,actor_id) VALUES(_store_id,next_spend::bigint,next_coins::integer,uid) RETURNING id INTO new_rule;
     INSERT INTO public.loyalty_programs(store_id,spend_cents,coins_per_step,rule_id) VALUES(_store_id,next_spend::bigint,next_coins::integer,new_rule);
     INSERT INTO public.loyalty_accounts(store_id,user_id)
      SELECT store_id,user_id FROM public.orders WHERE store_id=_store_id
      UNION SELECT store_id,user_id FROM public.customer_store_link WHERE store_id=_store_id ON CONFLICT DO NOTHING;
     INSERT INTO private.loyalty_order_credit(order_id,store_id,user_id,baseline)
      SELECT id,store_id,user_id,private.loyalty_received(id) FROM public.orders WHERE store_id=_store_id;
   ELSIF p.spend_cents<>next_spend OR p.coins_per_step<>next_coins THEN
     INSERT INTO private.loyalty_earning_rules(store_id,spend_cents,coins_per_step,actor_id) VALUES(_store_id,next_spend::bigint,next_coins::integer,uid) RETURNING id INTO new_rule;
   ELSE new_rule:=p.rule_id;
   END IF;
   UPDATE public.loyalty_programs SET enabled=COALESCE((_data->>'enabled')::boolean,p.enabled,false),spend_cents=next_spend::bigint,coins_per_step=next_coins::integer,rule_id=new_rule WHERE store_id=_store_id;
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
   IF amount<0 AND a.earned_coins+a.adjustment-a.spent+amount<0 THEN RAISE EXCEPTION 'loyalty_insufficient_balance'; END IF;
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
   IF a.earned_coins+a.adjustment-a.spent<r.coins THEN RAISE EXCEPTION 'loyalty_insufficient_balance'; END IF;
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

CREATE OR REPLACE FUNCTION public.loyalty_data(_store_id uuid DEFAULT NULL,_customer_id uuid DEFAULT NULL,_offset integer DEFAULT 0,_search text DEFAULT '') RETURNS jsonb
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
  'configurable_rules',true,
  'program',(SELECT to_jsonb(p) FROM public.loyalty_programs p WHERE store_id=_store_id),
  'accounts',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT a.*,greatest(0,a.earned_coins+a.adjustment-a.spent) AS balance,
    greatest(0,-(a.earned_coins+a.adjustment-a.spent)) AS deficit,
    (pr.progress->>'remainder_cents')::bigint AS remainder_cents,(pr.progress->>'next_spend_cents')::bigint AS next_spend_cents,(pr.progress->>'next_coins')::integer AS next_coins,(pr.progress->>'previous_rule')::boolean AS previous_rule,p.name AS customer_name
   FROM public.loyalty_accounts a LEFT JOIN public.profiles p ON p.id=a.user_id
   CROSS JOIN LATERAL (SELECT private.loyalty_progress(a.store_id,a.user_id) AS progress) pr
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

COMMIT;
