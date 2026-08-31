CREATE TABLE IF NOT EXISTS public.order_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    installment_number INT NOT NULL,
    amount NUMERIC NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid'
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.order_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can manage order installments"
ON public.order_installments
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.stores s ON o.store_id = s.id
        WHERE o.id = order_installments.order_id
        AND s.owner_id = auth.uid()
    )
);

CREATE POLICY "Customers can view their order installments"
ON public.order_installments
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_installments.order_id
        AND o.user_id = auth.uid()
    )
);

CREATE POLICY "Enable read access for all users"
ON public.order_installments
FOR SELECT TO anon, authenticated
USING (true);
