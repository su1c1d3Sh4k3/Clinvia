-- Pin search_path on SECURITY DEFINER functions (silences advisor warnings
-- and prevents search_path hijacking).

ALTER FUNCTION public.delivery_automation_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.invoke_delivery_automation_dispatcher() SET search_path = public, vault, net;
ALTER FUNCTION public.invoke_delivery_automation_worker() SET search_path = public, vault, net;
ALTER FUNCTION public.pick_delivery_automation_job() SET search_path = public;
