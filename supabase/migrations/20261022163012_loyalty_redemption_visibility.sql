-- Counts cover all redemptions, independently of the displayed page. Existing RLS remains in force.
BEGIN;
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
  'pending_redemptions',(SELECT count(*) FROM public.loyalty_redemptions WHERE store_id=_store_id AND status='pending' AND (target IS NULL OR user_id=target)),
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
  'rewards',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT r.*, (SELECT count(*) FROM public.loyalty_redemptions d WHERE d.store_id=_store_id AND d.reward_id=r.id AND d.user_id=COALESCE(target,auth.uid()) AND d.status<>'rejected') AS redeemed_count FROM public.loyalty_rewards r WHERE r.store_id=_store_id ORDER BY r.coins,r.name LIMIT 100)x),'[]'::jsonb),
  'redemptions',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT d.*,p.name AS customer_name FROM public.loyalty_redemptions d LEFT JOIN public.profiles p ON p.id=d.user_id WHERE d.store_id=_store_id AND (target IS NULL OR d.user_id=target) ORDER BY CASE WHEN owner AND target IS NULL AND d.status='pending' THEN 0 ELSE 1 END,d.created_at DESC,d.id DESC LIMIT 100 OFFSET greatest(0,least(_offset,100000)))x),'[]'::jsonb),
  'ledger',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.loyalty_ledger WHERE store_id=_store_id AND (target IS NULL OR user_id=target) ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET greatest(0,least(_offset,100000)))x),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END;
$$;

COMMIT;
