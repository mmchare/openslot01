
-- Enums
CREATE TYPE public.slot_status AS ENUM ('disponible', 'vendu', 'bloque');
CREATE TYPE public.order_status AS ENUM ('en_attente', 'paye', 'echoue');

-- Applications (catalogue)
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  price_fcfa INT NOT NULL CHECK (price_fcfa >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slots de stock
CREATE TABLE public.slots_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  account_email VARCHAR(255) NOT NULL,
  account_password VARCHAR(255) NOT NULL,
  slot_number INT NOT NULL,
  profile_name VARCHAR(255),
  status public.slot_status NOT NULL DEFAULT 'disponible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, account_email, slot_number)
);

CREATE INDEX idx_slots_stock_available ON public.slots_stock (application_id, status) WHERE status = 'disponible';

-- Commandes
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notchpay_reference VARCHAR(255) UNIQUE,
  client_name VARCHAR(255) NOT NULL,
  client_whatsapp VARCHAR(50) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  application_id UUID NOT NULL REFERENCES public.applications(id),
  slot_id UUID REFERENCES public.slots_stock(id),
  amount_paid INT NOT NULL,
  status public.order_status NOT NULL DEFAULT 'en_attente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_notchpay_ref ON public.orders (notchpay_reference);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_slots_stock_updated BEFORE UPDATE ON public.slots_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Aucune policy publique => seul le service_role (backend) peut lire.
-- Le catalogue passe par une vue limitée ci-dessous.

-- Vue publique du catalogue (jamais les credentials)
CREATE OR REPLACE VIEW public.applications_catalog
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.name,
  a.category,
  a.description,
  a.price_fcfa,
  a.image_url,
  a.sort_order,
  COALESCE((SELECT COUNT(*) FROM public.slots_stock s
            WHERE s.application_id = a.id AND s.status = 'disponible'), 0)::INT AS stock_disponible
FROM public.applications a
WHERE a.is_active = true
ORDER BY a.sort_order, a.name;

-- Policy: le rôle anon ne lit pas la table directement, mais on autorise une lecture
-- très restreinte aux colonnes publiques via une policy permissive sur le SELECT public.
-- Approche choisie: tout passe par server functions (admin) → on garde RLS verrouillée.
-- Mais on autorise tout de même un SELECT public sur applications pour la vue:
CREATE POLICY "Public can read active applications"
  ON public.applications FOR SELECT
  USING (is_active = true);

-- Fonction atomique d'attribution d'un slot pour une commande payée
CREATE OR REPLACE FUNCTION public.allocate_slot_for_order(p_order_id UUID)
RETURNS TABLE (
  slot_id UUID,
  account_email VARCHAR,
  account_password VARCHAR,
  slot_number INT,
  profile_name VARCHAR,
  application_name VARCHAR,
  remaining_stock INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id UUID;
  v_slot RECORD;
  v_remaining INT;
BEGIN
  -- Récupère la commande
  SELECT o.application_id INTO v_app_id
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Sélectionne un slot disponible avec verrou
  SELECT s.* INTO v_slot
  FROM public.slots_stock s
  WHERE s.application_id = v_app_id AND s.status = 'disponible'
  ORDER BY s.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_slot.id IS NULL THEN
    -- Pas de stock : on marque la commande échouée
    UPDATE public.orders SET status = 'echoue' WHERE id = p_order_id;
    RAISE EXCEPTION 'No available slot for application %', v_app_id;
  END IF;

  -- Marque le slot vendu
  UPDATE public.slots_stock SET status = 'vendu' WHERE id = v_slot.id;

  -- Met à jour la commande
  UPDATE public.orders
  SET slot_id = v_slot.id, status = 'paye'
  WHERE id = p_order_id;

  -- Calcule le stock restant
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
$$;
