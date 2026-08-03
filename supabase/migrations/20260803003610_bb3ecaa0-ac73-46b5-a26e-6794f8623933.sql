CREATE OR REPLACE FUNCTION public.available_slot_count(p_app_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::int, 0) FROM public.slots_stock s
  WHERE s.application_id = p_app_id AND s.status = 'disponible';
$$;

REVOKE ALL ON FUNCTION public.available_slot_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.available_slot_count(uuid) TO anon, authenticated, service_role;

ALTER VIEW public.applications_catalog SET (security_invoker = true);

CREATE OR REPLACE VIEW public.applications_catalog AS
SELECT a.id, a.name, a.category, a.description, a.price_fcfa, a.image_url,
       a.sort_order, a.product_type, a.apk_version, a.apk_size_bytes,
       CASE
         WHEN a.product_type = 'apk'::product_type THEN
           CASE WHEN a.apk_file_path IS NOT NULL THEN 999999 ELSE 0 END
         ELSE public.available_slot_count(a.id)
       END AS stock_disponible
FROM public.applications a
WHERE a.is_active = true
ORDER BY a.sort_order, a.name;

GRANT SELECT ON public.applications_catalog TO anon, authenticated;