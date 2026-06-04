
CREATE TABLE public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NULL,
  notchpay_reference VARCHAR NULL,
  event_type VARCHAR NOT NULL,
  level VARCHAR NOT NULL DEFAULT 'info',
  message TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_order_id ON public.payment_events(order_id);
CREATE INDEX idx_payment_events_reference ON public.payment_events(notchpay_reference);
CREATE INDEX idx_payment_events_created_at ON public.payment_events(created_at DESC);

GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to payment_events"
  ON public.payment_events FOR SELECT
  TO public
  USING (false);
