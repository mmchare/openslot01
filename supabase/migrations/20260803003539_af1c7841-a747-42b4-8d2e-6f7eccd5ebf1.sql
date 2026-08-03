ALTER VIEW public.applications_catalog SET (security_invoker = false);
GRANT SELECT ON public.applications_catalog TO anon, authenticated;