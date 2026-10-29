BEGIN;
-- Customers retain read access, but cannot erase their reservations via the API.
-- Seller cancellation continues through seller_mutate_orders, preserving stock
-- handling and payment history. Keep seller deletion for existing management flows.
ALTER POLICY "orders delete own or store" ON public.orders
  TO authenticated USING (public.is_store_owner(store_id));
COMMIT;
