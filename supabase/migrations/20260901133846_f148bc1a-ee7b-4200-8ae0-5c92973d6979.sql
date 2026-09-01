-- Liaison commande → utilisateur (optionnel)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Profils utilisateurs
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  referral_code text UNIQUE,
  referral_balance integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile"
ON public.profiles FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Trigger updated_at pour profiles
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mise à jour de create_order_secure pour accepter un utilisateur optionnel
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_application_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.applications%ROWTYPE;
  v_count int;
  v_order_id uuid;
BEGIN
  IF length(coalesce(p_client_name,'')) < 2 OR length(coalesce(p_client_email,'')) < 5
     OR length(coalesce(p_client_whatsapp,'')) < 8 THEN
    RAISE EXCEPTION 'Informations client invalides.';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF v_app.id IS NULL OR v_app.is_active = false THEN
    RAISE EXCEPTION 'Produit indisponible.';
  END IF;

  IF v_app.product_type = 'apk' THEN
    IF v_app.apk_file_path IS NULL THEN
      RAISE EXCEPTION 'Cet APK n''est pas encore disponible au téléchargement.';
    END IF;
  ELSE
    SELECT count(*) INTO v_count FROM public.slots_stock
      WHERE application_id = v_app.id AND status = 'disponible';
    IF coalesce(v_count,0) <= 0 THEN
      RAISE EXCEPTION 'Désolé, ce produit est en rupture de stock.';
    END IF;
  END IF;

  INSERT INTO public.orders (
    application_id, client_name, client_email, client_whatsapp,
    amount_paid, status, user_id
  ) VALUES (
    v_app.id, left(p_client_name,255), left(p_client_email,255),
    left(p_client_whatsapp,20), v_app.price_fcfa, 'en_attente', p_user_id
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'amount_paid', v_app.price_fcfa,
    'application_name', v_app.name,
    'product_type', v_app.product_type
  );
END $function$;

-- Historique des commandes d'un utilisateur connecté
CREATE OR REPLACE FUNCTION public.srv_get_user_orders(p_secret text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'created_at', o.created_at,
    'client_name', o.client_name,
    'client_email', o.client_email,
    'client_whatsapp', o.client_whatsapp,
    'amount_paid', o.amount_paid,
    'application_name', a.name,
    'product_type', a.product_type,
    'subscription_start_at', o.subscription_start_at,
    'subscription_end_at', o.subscription_end_at
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v
  FROM public.orders o
  JOIN public.applications a ON a.id = o.application_id
  WHERE o.user_id = p_user_id;
  RETURN v;
END $function$;

-- Mise à jour / création du profil utilisateur
CREATE OR REPLACE FUNCTION public.srv_update_profile(
  p_secret text,
  p_user_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL THEN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (
      p_user_id,
      left(nullif(p_payload->>'full_name',''),255),
      left(nullif(p_payload->>'phone',''),20)
    );
  ELSE
    UPDATE public.profiles
    SET full_name = CASE WHEN p_payload ? 'full_name' THEN left(nullif(p_payload->>'full_name',''),255) ELSE full_name END,
        phone = CASE WHEN p_payload ? 'phone' THEN left(nullif(p_payload->>'phone',''),20) ELSE phone END
    WHERE id = p_user_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;