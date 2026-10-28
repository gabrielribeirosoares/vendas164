BEGIN;
-- Guests can discover active programs, without account, reward or payment access.
GRANT SELECT (store_id, enabled) ON public.loyalty_programs TO anon;
CREATE POLICY loyalty_program_guest_read ON public.loyalty_programs
FOR SELECT TO anon USING (enabled);
COMMIT;
