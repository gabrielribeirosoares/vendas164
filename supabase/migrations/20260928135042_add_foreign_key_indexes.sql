-- Cover foreign-key columns used by joins, RLS checks and referential actions.
CREATE INDEX IF NOT EXISTS order_installments_order_id_idx
  ON public.order_installments(order_id);

CREATE INDEX IF NOT EXISTS orders_product_id_idx
  ON public.orders(product_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_store_id_idx
  ON public.push_subscriptions(store_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS store_reviews_store_id_idx
  ON public.store_reviews(store_id);

CREATE INDEX IF NOT EXISTS stores_owner_id_idx
  ON public.stores(owner_id);

CREATE INDEX IF NOT EXISTS waitlist_product_id_idx
  ON public.waitlist(product_id);

CREATE INDEX IF NOT EXISTS waitlist_store_id_idx
  ON public.waitlist(store_id);
