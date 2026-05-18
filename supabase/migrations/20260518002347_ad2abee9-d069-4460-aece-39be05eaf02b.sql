
-- Fix search_path sur set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Restreindre l'exécution de allocate_slot_for_order au service_role uniquement
REVOKE EXECUTE ON FUNCTION public.allocate_slot_for_order(UUID) FROM PUBLIC, anon, authenticated;

-- Politiques restrictives explicites (zéro accès public)
CREATE POLICY "No public access to slots_stock"
  ON public.slots_stock FOR SELECT USING (false);

CREATE POLICY "No public access to orders"
  ON public.orders FOR SELECT USING (false);
