-- =============================================
-- FIX: Security Hardening (RLS & Function Search Paths)
-- Date: 2026-02-18
-- =============================================

-- 1. Webhook Queue Security
-- Enable RLS and restrict access to service_role only.
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Enable access to service_role" ON public.webhook_queue;
DROP POLICY IF EXISTS "Public write access" ON public.webhook_queue;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.webhook_queue;

-- Create restrictive policy
CREATE POLICY "Enable access to service_role" 
ON public.webhook_queue 
TO service_role 
USING (true) 
WITH CHECK (true);


-- 2. Groups Security (Restrict to Auth/Service)
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Enable insert for all users" ON public.groups;
DROP POLICY IF EXISTS "Enable update for all users" ON public.groups;

-- Create stricter policies
-- Allow authenticated users to insert (e.g. creating a group via UI?)
CREATE POLICY "Enable insert for authenticated" 
ON public.groups 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update (e.g. editing group name)
CREATE POLICY "Enable update for authenticated" 
ON public.groups 
FOR UPDATE 
TO authenticated 
USING (true);

-- Ensure Service Role has full access (for webhooks)
CREATE POLICY "Enable all for service_role" 
ON public.groups 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Drop existing permissive policies on group_members
DROP POLICY IF EXISTS "Enable insert for all users" ON public.group_members;
DROP POLICY IF EXISTS "Enable update for all users" ON public.group_members;

-- Create stricter policies for group_members
CREATE POLICY "Enable insert for authenticated" 
ON public.group_members 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated" 
ON public.group_members 
FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Enable all for service_role" 
ON public.group_members 
TO service_role 
USING (true) 
WITH CHECK (true);


-- 3. Contact Tags (Restrict to Auth)
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert contact_tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Authenticated users can delete contact_tags" ON public.contact_tags;

-- Recreate restrictive policies
CREATE POLICY "Authenticated users can insert contact_tags" 
ON public.contact_tags 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contact_tags" 
ON public.contact_tags 
FOR DELETE 
TO authenticated 
USING (true);


-- 4. Function Hardening (Set search_path = public)
-- This prevents search path hijacking.
-- Applying to a selection of functions found in the audit.

ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_agent() SET search_path = public;
ALTER FUNCTION public.is_supervisor() SET search_path = public;
ALTER FUNCTION public.delete_old_conversations() SET search_path = public;
ALTER FUNCTION public.update_conversation_on_message() SET search_path = public;
ALTER FUNCTION public.update_task_status() SET search_path = public;
ALTER FUNCTION public.update_all_task_statuses() SET search_path = public;
ALTER FUNCTION public.format_currency_brl(numeric) SET search_path = public;
ALTER FUNCTION public.get_profile_name(uuid) SET search_path = public;
ALTER FUNCTION public.create_default_ia_tag() SET search_path = public;
ALTER FUNCTION public.update_patients_updated_at() SET search_path = public;
-- ALTER FUNCTION public.trigger_message_push_notification(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.update_instagram_instance_timestamp() SET search_path = public;
ALTER FUNCTION public.get_my_owner_id() SET search_path = public;
ALTER FUNCTION public.generate_sale_installments() SET search_path = public;
-- ALTER FUNCTION public.get_dashboard_history(text, timestamp with time zone, timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.update_ia_config_updated_at() SET search_path = public;
ALTER FUNCTION public.debug_get_owner_id() SET search_path = public;
ALTER FUNCTION public.get_monthly_metrics(text) SET search_path = public;
ALTER FUNCTION public.get_global_metrics(text, text) SET search_path = public;
ALTER FUNCTION public.track_audio_usage() SET search_path = public;
ALTER FUNCTION public.delete_messages_on_resolve() SET search_path = public;
ALTER FUNCTION public.create_default_financial_categories() SET search_path = public;
-- ALTER FUNCTION public.get_top_product_service() SET search_path = public;
-- ALTER FUNCTION public.handle_new_user() SET search_path = public;
-- ALTER FUNCTION public.has_financial_notification_access() SET search_path = public;
ALTER FUNCTION public.invoke_auto_follow_up(uuid) SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_agent() SET search_path = public;
-- ALTER FUNCTION public.is_staff() SET search_path = public;
ALTER FUNCTION public.is_supervisor() SET search_path = public;
ALTER FUNCTION public.log_audio_updates() SET search_path = public;
ALTER FUNCTION public.log_token_updates() SET search_path = public;
-- ALTER FUNCTION public.notify_appointment_status_change() SET search_path = public;
-- ALTER FUNCTION public.notify_deal_change() SET search_path = public;
-- ALTER FUNCTION public.notify_queue_change() SET search_path = public;
-- ALTER FUNCTION public.notify_sale_created() SET search_path = public;
-- ALTER FUNCTION public.notify_task_change() SET search_path = public;
-- ALTER FUNCTION public.process_recurring_entries() SET search_path = public;
ALTER FUNCTION public.reset_monthly_tokens() SET search_path = public;
-- ALTER FUNCTION public.send_push_notification() SET search_path = public;
ALTER FUNCTION public.set_appointment_names() SET search_path = public;
ALTER FUNCTION public.set_appointment_service_name() SET search_path = public;
ALTER FUNCTION public.sync_profile_to_team_member() SET search_path = public;
ALTER FUNCTION public.track_audio_usage() SET search_path = public;
-- ALTER FUNCTION public.track_response_time() SET search_path = public;
ALTER FUNCTION public.track_token_usage() SET search_path = public;
-- ALTER FUNCTION public.trigger_message_push_notification(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.trigger_push_notification(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.update_all_task_statuses() SET search_path = public;
-- ALTER FUNCTION public.update_conversation_last_message() SET search_path = public;
ALTER FUNCTION public.update_conversation_on_message() SET search_path = public;
ALTER FUNCTION public.update_history_on_message_update() SET search_path = public;
ALTER FUNCTION public.update_ia_config_updated_at() SET search_path = public;
ALTER FUNCTION public.update_instagram_instance_timestamp() SET search_path = public;
-- ALTER FUNCTION public.update_overdue_entries() SET search_path = public;
ALTER FUNCTION public.update_overdue_sale_installments() SET search_path = public;
ALTER FUNCTION public.update_patients_updated_at() SET search_path = public;
ALTER FUNCTION public.update_push_subscription_timestamp() SET search_path = public;
ALTER FUNCTION public.update_stage_changed_at() SET search_path = public;
ALTER FUNCTION public.update_task_status() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
