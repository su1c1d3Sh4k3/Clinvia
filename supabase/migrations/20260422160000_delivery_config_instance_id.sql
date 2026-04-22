-- delivery_config.instance_id: when the owner has multiple connected
-- instances, they pick which one the Delivery Automation uses to dispatch
-- messages. NULL means "fallback to first connected" (legacy behavior for
-- single-instance accounts).

ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_config_instance_id
  ON public.delivery_config (instance_id);
