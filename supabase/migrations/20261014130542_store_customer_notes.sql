BEGIN;
CREATE TABLE public.store_customer_notes (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 5000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, customer_id)
);
ALTER TABLE public.store_customer_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_customer_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_customer_notes TO authenticated, service_role;
CREATE POLICY "Store owner can read customer notes" ON public.store_customer_notes
FOR SELECT TO authenticated USING (public.is_store_owner(store_id));
CREATE POLICY "Store owner can insert customer notes" ON public.store_customer_notes
FOR INSERT TO authenticated WITH CHECK (public.is_store_owner(store_id));
CREATE POLICY "Store owner can update customer notes" ON public.store_customer_notes
FOR UPDATE TO authenticated USING (public.is_store_owner(store_id)) WITH CHECK (public.is_store_owner(store_id));
CREATE POLICY "Store owner can delete customer notes" ON public.store_customer_notes
FOR DELETE TO authenticated USING (public.is_store_owner(store_id));
COMMIT;
