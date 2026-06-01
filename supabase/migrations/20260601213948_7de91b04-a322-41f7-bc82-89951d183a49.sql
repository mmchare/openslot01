
CREATE TYPE public.product_type AS ENUM ('account', 'apk');

ALTER TABLE public.applications
  ADD COLUMN product_type public.product_type NOT NULL DEFAULT 'account',
  ADD COLUMN apk_file_path text,
  ADD COLUMN apk_version varchar(50),
  ADD COLUMN apk_size_bytes bigint;

DROP VIEW IF EXISTS public.applications_catalog;
CREATE VIEW public.applications_catalog AS
SELECT
  id,
  name,
  category,
  description,
  price_fcfa,
  image_url,
  sort_order,
  product_type,
  apk_version,
  apk_size_bytes,
  CASE
    WHEN product_type = 'apk' THEN
      CASE WHEN apk_file_path IS NOT NULL THEN 999999 ELSE 0 END
    ELSE
      COALESCE((
        SELECT count(*)::int
        FROM public.slots_stock s
        WHERE s.application_id = a.id
          AND s.status = 'disponible'
      ), 0)
  END AS stock_disponible
FROM public.applications a
WHERE is_active = true
ORDER BY sort_order, name;

GRANT SELECT ON public.applications_catalog TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'apk-files',
  'apk-files',
  false,
  220 * 1024 * 1024,
  ARRAY['application/vnd.android.package-archive','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.allocate_slot_for_order(p_order_id uuid)
RETURNS TABLE(
  slot_id uuid,
  account_email varchar,
  account_password varchar,
  slot_number int,
  profile_name varchar,
  profile_password varchar,
  application_name varchar,
  remaining_stock int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_app_id UUID;
  v_app RECORD;
  v_slot RECORD;
  v_remaining INT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  SELECT o.application_id INTO v_app_id
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT a.* INTO v_app
  FROM public.applications a WHERE a.id = v_app_id;

  IF v_app.product_type = 'apk' THEN
    IF v_app.apk_file_path IS NULL THEN
      UPDATE public.orders SET status = 'echoue' WHERE id = p_order_id;
      RAISE EXCEPTION 'APK file not configured for application %', v_app_id;
    END IF;

    v_start := now();
    v_end := v_start + (COALESCE(v_app.subscription_duration_days, 365) || ' days')::interval;

    UPDATE public.orders
    SET status = 'paye',
        subscription_start_at = v_start,
        subscription_end_at = v_end
    WHERE id = p_order_id;

    RETURN QUERY SELECT
      NULL::uuid, NULL::varchar, NULL::varchar, NULL::int,
      NULL::varchar, NULL::varchar, v_app.name, 999999::int;
    RETURN;
  END IF;

  SELECT s.* INTO v_slot
  FROM public.slots_stock s
  WHERE s.application_id = v_app_id AND s.status = 'disponible'
  ORDER BY s.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_slot.id IS NULL THEN
    UPDATE public.orders SET status = 'echoue' WHERE id = p_order_id;
    RAISE EXCEPTION 'No available slot for application %', v_app_id;
  END IF;

  UPDATE public.slots_stock SET status = 'vendu' WHERE id = v_slot.id;

  v_start := now();
  v_end := v_start + (COALESCE(v_app.subscription_duration_days, 30) || ' days')::interval;

  UPDATE public.orders
  SET slot_id = v_slot.id,
      status = 'paye',
      subscription_start_at = v_start,
      subscription_end_at = v_end
  WHERE id = p_order_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.slots_stock
  WHERE application_id = v_app_id AND status = 'disponible';

  RETURN QUERY SELECT
    v_slot.id, v_slot.account_email, v_slot.account_password,
    v_slot.slot_number, v_slot.profile_name, v_slot.profile_password,
    v_app.name, v_remaining;
END;
$function$;
