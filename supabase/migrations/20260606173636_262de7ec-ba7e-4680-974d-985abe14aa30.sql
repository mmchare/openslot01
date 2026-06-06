
-- 1. Restrict SECURITY DEFINER function execution to service_role only
REVOKE EXECUTE ON FUNCTION public.allocate_slot_for_order(uuid) FROM PUBLIC, anon, authenticated;

-- 2. Explicit deny policies for write ops on orders (service_role bypasses RLS)
CREATE POLICY "No public insert on orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No public update on orders" ON public.orders FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No public delete on orders" ON public.orders FOR DELETE TO anon, authenticated USING (false);

-- 3. Explicit deny policies for write ops on slots_stock
CREATE POLICY "No public insert on slots_stock" ON public.slots_stock FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No public update on slots_stock" ON public.slots_stock FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No public delete on slots_stock" ON public.slots_stock FOR DELETE TO anon, authenticated USING (false);

-- 4. Also explicit deny writes on payment_events (same posture)
CREATE POLICY "No public insert on payment_events" ON public.payment_events FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No public update on payment_events" ON public.payment_events FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No public delete on payment_events" ON public.payment_events FOR DELETE TO anon, authenticated USING (false);

-- 5. Remove broad listing policy on app-icons bucket.
-- The bucket remains public: files are still served via their direct public URL,
-- but anonymous clients can no longer list/enumerate every object.
DROP POLICY IF EXISTS "Public read app-icons" ON storage.objects;
