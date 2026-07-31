ALTER TABLE public.products
ADD COLUMN bulk_discount_threshold INTEGER,
ADD COLUMN bulk_discount_price NUMERIC(12,2),
ADD COLUMN bulk_has_installment_surcharge BOOLEAN,
ADD COLUMN bulk_installment_price NUMERIC(12,2);
