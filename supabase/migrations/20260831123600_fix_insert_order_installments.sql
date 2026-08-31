DROP POLICY IF EXISTS "Customers can insert order installments" ON public.order_installments;
CREATE POLICY "Customers can insert order installments"
ON public.order_installments
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
        AND o.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Store owners can insert order installments" ON public.order_installments;
CREATE POLICY "Store owners can insert order installments"
ON public.order_installments
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.stores s ON o.store_id = s.id
        WHERE o.id = order_id
        AND s.owner_id = auth.uid()
    )
);
