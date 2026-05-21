
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS subscription_duration_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_end_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.allocate_slot_for_order(p_order_id uuid)
 RETURNS TABLE(slot_id uuid, account_email character varying, account_password character varying, slot_number integer, profile_name character varying, application_name character varying, remaining_stock integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app_id UUID;
  v_slot RECORD;
  v_remaining INT;
  v_duration INT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  SELECT o.application_id INTO v_app_id
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT a.subscription_duration_days INTO v_duration
  FROM public.applications a WHERE a.id = v_app_id;
  IF v_duration IS NULL THEN v_duration := 30; END IF;

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
  v_end := v_start + (v_duration || ' days')::interval;

  UPDATE public.orders
  SET slot_id = v_slot.id,
      status = 'paye',
      subscription_start_at = v_start,
      subscription_end_at = v_end
  WHERE id = p_order_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.slots_stock
  WHERE application_id = v_app_id AND status = 'disponible';

  RETURN QUERY
  SELECT
    v_slot.id,
    v_slot.account_email,
    v_slot.account_password,
    v_slot.slot_number,
    v_slot.profile_name,
    (SELECT name FROM public.applications WHERE id = v_app_id),
    v_remaining;
END;
$function$;
