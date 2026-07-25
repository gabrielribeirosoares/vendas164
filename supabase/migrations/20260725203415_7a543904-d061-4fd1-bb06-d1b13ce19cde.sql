
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STORES
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#e11d48',
  whatsapp_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT SELECT ON public.stores TO anon;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores public read" ON public.stores FOR SELECT USING (true);
CREATE POLICY "stores owner insert" ON public.stores FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "stores owner update" ON public.stores FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "stores owner delete" ON public.stores FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = auth.uid());
$$;

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  scale TEXT NOT NULL DEFAULT '1:64',
  image_url TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  release_date DATE,
  stock INTEGER NOT NULL DEFAULT 0,
  is_open BOOLEAN NOT NULL DEFAULT true,
  payment_deadline_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products owner write" ON public.products FOR ALL TO authenticated
  USING (public.is_store_owner(store_id)) WITH CHECK (public.is_store_owner(store_id));

-- ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  down_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12,2) GENERATED ALWAYS AS (total_price - down_payment) STORED,
  payment_status TEXT NOT NULL DEFAULT 'aguardando_sinal',
  delivery_status TEXT NOT NULL DEFAULT 'pendente',
  reservation_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders read own or store" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_store_owner(store_id));
CREATE POLICY "orders insert own" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders store update" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_store_owner(store_id)) WITH CHECK (public.is_store_owner(store_id));
CREATE POLICY "orders delete own or store" ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_store_owner(store_id));

-- WAITLIST
CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist read own or store" ON public.waitlist FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_store_owner(store_id));
CREATE POLICY "waitlist insert own" ON public.waitlist FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "waitlist delete own or store" ON public.waitlist FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_store_owner(store_id));

-- CUSTOMER STORE LINK
CREATE TABLE public.customer_store_link (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);
GRANT SELECT, INSERT, DELETE ON public.customer_store_link TO authenticated;
GRANT ALL ON public.customer_store_link TO service_role;
ALTER TABLE public.customer_store_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "link read own or store" ON public.customer_store_link FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_store_owner(store_id));
CREATE POLICY "link insert own" ON public.customer_store_link FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "link delete own" ON public.customer_store_link FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- EXPIRATION ROUTINE
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD;
  next_user UUID;
  expired_count INTEGER := 0;
  p RECORD;
BEGIN
  FOR o IN
    SELECT * FROM public.orders
    WHERE payment_status = 'aguardando_sinal'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at < now()
  LOOP
    UPDATE public.orders SET payment_status = 'cancelado', delivery_status = 'cancelado' WHERE id = o.id;
    expired_count := expired_count + 1;

    SELECT user_id INTO next_user FROM public.waitlist
      WHERE product_id = o.product_id ORDER BY created_at ASC LIMIT 1;

    IF next_user IS NOT NULL THEN
      SELECT * INTO p FROM public.products WHERE id = o.product_id;
      INSERT INTO public.orders (user_id, product_id, store_id, total_price, reservation_expires_at)
      VALUES (next_user, o.product_id, o.store_id, p.price, now() + (p.payment_deadline_hours || ' hours')::interval);
      DELETE FROM public.waitlist WHERE product_id = o.product_id AND user_id = next_user;
      INSERT INTO public.customer_store_link (user_id, store_id) VALUES (next_user, o.store_id) ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.products SET stock = stock + 1 WHERE id = o.product_id;
    END IF;
  END LOOP;
  RETURN expired_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO authenticated, anon, service_role;

-- RESERVATION CREATION (atomic stock check)
CREATE OR REPLACE FUNCTION public.create_reservation(_product_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  new_id UUID;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF NOT p.is_open THEN RAISE EXCEPTION 'presale_closed'; END IF;
  IF p.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  UPDATE public.products SET stock = stock - 1 WHERE id = _product_id;
  INSERT INTO public.orders (user_id, product_id, store_id, total_price, reservation_expires_at)
  VALUES (uid, _product_id, p.store_id, p.price, now() + (p.payment_deadline_hours || ' hours')::interval)
  RETURNING id INTO new_id;
  INSERT INTO public.customer_store_link (user_id, store_id) VALUES (uid, p.store_id) ON CONFLICT DO NOTHING;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_reservation(UUID) TO authenticated, service_role;
