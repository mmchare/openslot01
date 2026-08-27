-- =========================================================
-- Config interne (secret serveur)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access to app_config" ON public.app_config;
CREATE POLICY "No public access to app_config" ON public.app_config
  FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.srv_assert_secret(p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  SELECT value INTO v FROM public.app_config WHERE key = 'server_secret';
  IF v IS NULL OR length(v) = 0 THEN
    RAISE EXCEPTION 'Secret serveur non configuré';
  END IF;
  IF p_secret IS NULL OR p_secret <> v THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.srv_assert_secret(text) FROM PUBLIC, anon, authenticated;

-- =========================================================
-- Création de commande (public, prix pris dans la base)
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_application_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO public.orders (application_id, client_name, client_email, client_whatsapp, amount_paid, status)
  VALUES (v_app.id, left(p_client_name,255), left(p_client_email,255), left(p_client_whatsapp,20), v_app.price_fcfa, 'en_attente')
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'amount_paid', v_app.price_fcfa,
    'application_name', v_app.name,
    'product_type', v_app.product_type
  );
END $$;

GRANT EXECUTE ON FUNCTION public.create_order_secure(uuid, text, text, text) TO anon, authenticated;

-- =========================================================
-- Fonctions serveur protégées par le secret
-- =========================================================
CREATE OR REPLACE FUNCTION public.srv_set_order_reference(p_secret text, p_order_id uuid, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  UPDATE public.orders SET notchpay_reference = p_reference WHERE id = p_order_id;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_set_order_reference(text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_log_payment_event(
  p_secret text, p_order_id uuid, p_reference text, p_event_type text,
  p_level text, p_message text, p_metadata jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  INSERT INTO public.payment_events (order_id, notchpay_reference, event_type, level, message, metadata)
  VALUES (p_order_id, p_reference, p_event_type, coalesce(p_level,'info'), p_message, p_metadata);
END $$;
GRANT EXECUTE ON FUNCTION public.srv_log_payment_event(text, uuid, text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_get_order(p_secret text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT jsonb_build_object(
    'id', o.id, 'status', o.status, 'created_at', o.created_at,
    'client_name', o.client_name, 'client_email', o.client_email,
    'client_whatsapp', o.client_whatsapp, 'amount_paid', o.amount_paid,
    'slot_id', o.slot_id, 'application_id', o.application_id,
    'notchpay_reference', o.notchpay_reference,
    'subscription_start_at', o.subscription_start_at,
    'subscription_end_at', o.subscription_end_at,
    'application', jsonb_build_object(
      'name', a.name, 'product_type', a.product_type,
      'apk_version', a.apk_version, 'apk_size_bytes', a.apk_size_bytes,
      'apk_file_path', a.apk_file_path
    ),
    'access', CASE WHEN o.slot_id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'email', s.account_email, 'password', s.account_password,
        'slot_number', s.slot_number, 'profile_name', s.profile_name,
        'profile_password', s.profile_password)
      FROM public.slots_stock s WHERE s.id = o.slot_id) END
  ) INTO v
  FROM public.orders o JOIN public.applications a ON a.id = o.application_id
  WHERE o.id = p_order_id;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_get_order(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_find_order_by_reference(p_secret text, p_reference text, p_trxref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_id uuid;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT id INTO v_id FROM public.orders WHERE notchpay_reference = p_reference LIMIT 1;
  IF v_id IS NULL AND p_trxref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_id FROM public.orders WHERE id = p_trxref::uuid;
  END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'id', o.id, 'status', o.status, 'application_id', o.application_id,
    'created_at', o.created_at, 'client_whatsapp', o.client_whatsapp,
    'notchpay_reference', o.notchpay_reference
  ) INTO v FROM public.orders o WHERE o.id = v_id;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_find_order_by_reference(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_mark_order_paid(p_secret text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT * INTO r FROM public.allocate_slot_for_order(p_order_id);
  RETURN jsonb_build_object(
    'application_name', r.application_name,
    'remaining_stock', r.remaining_stock
  );
END $$;
GRANT EXECUTE ON FUNCTION public.srv_mark_order_paid(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_set_order_status(
  p_secret text, p_order_id uuid, p_status text, p_expected_status text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  IF p_status NOT IN ('en_attente','paye','echoue') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;
  IF p_status = 'paye' THEN
    RAISE EXCEPTION 'Utiliser srv_mark_order_paid';
  END IF;
  UPDATE public.orders SET status = p_status::order_status
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status::order_status);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_set_order_status(text, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.srv_last_mtn_processing_event(p_secret text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);
  SELECT jsonb_build_object('id', e.id, 'notchpay_reference', e.notchpay_reference, 'created_at', e.created_at)
  INTO v FROM public.payment_events e
  WHERE e.order_id = p_order_id
    AND e.event_type = 'notchpay_direct_charge_success'
    AND e.metadata->>'channel' = 'cm.mtn'
    AND e.metadata->>'status' IN ('processing','pending')
  ORDER BY e.created_at DESC LIMIT 1;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_last_mtn_processing_event(text, uuid) TO anon, authenticated;

-- =========================================================
-- Panneau admin : dispatcher unique
-- =========================================================
CREATE OR REPLACE FUNCTION public.srv_admin(p_secret text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  v_id uuid;
  v_status slot_status;
  v_q text;
  v_order jsonb;
  v_order_id uuid;
BEGIN
  PERFORM public.srv_assert_secret(p_secret);

  IF p_action = 'list_apps' THEN
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'sort_order'), '[]'::jsonb) INTO v FROM (
      SELECT jsonb_build_object(
        'id', a.id, 'name', a.name, 'category', a.category, 'price_fcfa', a.price_fcfa,
        'image_url', a.image_url, 'subscription_duration_days', a.subscription_duration_days,
        'is_active', a.is_active, 'sort_order', a.sort_order, 'product_type', a.product_type,
        'apk_file_path', a.apk_file_path, 'apk_version', a.apk_version, 'apk_size_bytes', a.apk_size_bytes,
        'stock_disponible', (SELECT count(*) FROM public.slots_stock s WHERE s.application_id = a.id AND s.status='disponible'),
        'stock_vendu', (SELECT count(*) FROM public.slots_stock s WHERE s.application_id = a.id AND s.status='vendu')
      ) AS x
      FROM public.applications a ORDER BY a.sort_order
    ) t;
    RETURN v;

  ELSIF p_action = 'create_app' THEN
    INSERT INTO public.applications (name, category, description, price_fcfa, image_url, subscription_duration_days, product_type, is_active)
    VALUES (
      p_payload->>'name', p_payload->>'category', nullif(p_payload->>'description',''),
      (p_payload->>'price_fcfa')::int, nullif(p_payload->>'image_url',''),
      coalesce((p_payload->>'subscription_duration_days')::int, 30),
      coalesce(nullif(p_payload->>'product_type','')::product_type, 'account'), true
    ) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);

  ELSIF p_action = 'update_app' THEN
    v_id := (p_payload->>'application_id')::uuid;
    UPDATE public.applications a SET
      image_url = CASE WHEN p_payload ? 'image_url' THEN nullif(p_payload->>'image_url','') ELSE a.image_url END,
      price_fcfa = CASE WHEN p_payload ? 'price_fcfa' THEN (p_payload->>'price_fcfa')::int ELSE a.price_fcfa END,
      is_active = CASE WHEN p_payload ? 'is_active' THEN (p_payload->>'is_active')::boolean ELSE a.is_active END,
      subscription_duration_days = CASE WHEN p_payload ? 'subscription_duration_days' THEN (p_payload->>'subscription_duration_days')::int ELSE a.subscription_duration_days END,
      product_type = CASE WHEN p_payload ? 'product_type' THEN (p_payload->>'product_type')::product_type ELSE a.product_type END,
      apk_file_path = CASE WHEN p_payload ? 'apk_file_path' THEN nullif(p_payload->>'apk_file_path','') ELSE a.apk_file_path END,
      apk_size_bytes = CASE WHEN p_payload ? 'apk_size_bytes' THEN (p_payload->>'apk_size_bytes')::bigint ELSE a.apk_size_bytes END,
      apk_version = CASE WHEN p_payload ? 'apk_version' THEN nullif(p_payload->>'apk_version','') ELSE a.apk_version END
    WHERE a.id = v_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'get_app' THEN
    SELECT to_jsonb(a) INTO v FROM public.applications a WHERE a.id = (p_payload->>'application_id')::uuid;
    RETURN v;

  ELSIF p_action = 'list_slots' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'account_email', s.account_email, 'slot_number', s.slot_number,
      'profile_name', s.profile_name, 'profile_password', s.profile_password,
      'status', s.status, 'created_at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v FROM public.slots_stock s WHERE s.application_id = (p_payload->>'application_id')::uuid;
    RETURN v;

  ELSIF p_action = 'add_slot' THEN
    INSERT INTO public.slots_stock (application_id, account_email, account_password, slot_number, profile_name, profile_password, status)
    VALUES ((p_payload->>'application_id')::uuid, p_payload->>'account_email', p_payload->>'account_password',
            (p_payload->>'slot_number')::int, nullif(p_payload->>'profile_name',''), nullif(p_payload->>'profile_password',''), 'disponible');
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'delete_slot' THEN
    v_id := (p_payload->>'slot_id')::uuid;
    SELECT status INTO v_status FROM public.slots_stock WHERE id = v_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Slot introuvable.'; END IF;
    IF v_status <> 'disponible' THEN RAISE EXCEPTION 'Impossible de supprimer un slot déjà vendu/réservé.'; END IF;
    DELETE FROM public.slots_stock WHERE id = v_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'available_stock' THEN
    RETURN jsonb_build_object('count', public.available_slot_count((p_payload->>'application_id')::uuid));

  ELSIF p_action = 'recent_orders' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'status', o.status, 'client_name', o.client_name,
      'client_whatsapp', o.client_whatsapp, 'amount_paid', o.amount_paid,
      'notchpay_reference', o.notchpay_reference, 'created_at', o.created_at,
      'application_name', a.name) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v FROM public.orders o LEFT JOIN public.applications a ON a.id = o.application_id
    WHERE o.created_at >= now() - interval '24 hours';
    RETURN v;

  ELSIF p_action = 'payment_events' THEN
    v_q := trim(p_payload->>'query');
    SELECT jsonb_build_object(
      'id', o.id, 'status', o.status, 'client_name', o.client_name,
      'client_whatsapp', o.client_whatsapp, 'client_email', o.client_email,
      'amount_paid', o.amount_paid, 'notchpay_reference', o.notchpay_reference,
      'created_at', o.created_at), o.id
    INTO v_order, v_order_id
    FROM public.orders o
    WHERE o.notchpay_reference = v_q
       OR (v_q ~* '^[0-9a-f]{8}' AND o.id::text ILIKE v_q || '%')
    ORDER BY o.created_at DESC LIMIT 1;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'order_id', e.order_id, 'notchpay_reference', e.notchpay_reference,
      'event_type', e.event_type, 'level', e.level, 'message', e.message,
      'metadata', e.metadata, 'created_at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
    INTO v FROM public.payment_events e
    WHERE (v_order_id IS NOT NULL AND e.order_id = v_order_id)
       OR (v_order_id IS NULL AND e.notchpay_reference = v_q);

    RETURN jsonb_build_object('order', v_order, 'events', v);
  END IF;

  RAISE EXCEPTION 'Action inconnue: %', p_action;
END $$;
GRANT EXECUTE ON FUNCTION public.srv_admin(text, text, jsonb) TO anon, authenticated;

-- =========================================================
-- Stockage : téléversement possible sans clé administrateur
-- =========================================================
DROP POLICY IF EXISTS "App icons insert" ON storage.objects;
CREATE POLICY "App icons insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'app-icons');

DROP POLICY IF EXISTS "App icons update" ON storage.objects;
CREATE POLICY "App icons update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'app-icons') WITH CHECK (bucket_id = 'app-icons');

DROP POLICY IF EXISTS "Apk files manage" ON storage.objects;
CREATE POLICY "Apk files manage" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id = 'apk-files') WITH CHECK (bucket_id = 'apk-files');