-- Rollback do item 2: volta a leitura global de profiles.
-- ATENCAO: isso REABRE o vazamento (qualquer usuario logado le e-mail, empresa,
-- consumo e custo de todos os tenants). Usar so como saida de emergencia.

drop policy if exists profiles_select_scoped on public.profiles;

create policy "Users can view all profiles" on public.profiles
for select to authenticated
using (true);

-- Devolve o SELECT do anon exatamente nas 47 colunas que a 20260922133000 tinha
-- liberado (as colunas de segredo/margem seguem fora).
grant select (
  id, full_name, avatar_url, company_name, phone, address, email, instagram,
  role, status, created_at, updated_at, deactivated_at, deletion_warning_sent_at,
  notifications_enabled, group_notifications_enabled, financial_access,
  must_change_password,
  tokens_total, tokens_monthly, approximate_cost_total, approximate_cost_monthly,
  audio_cost_total, audio_cost_monthly,
  openai_key_source, openai_project_id, openai_provision_error,
  openai_provisioned_at, openai_spend_alert_level, openai_spend_alert_sent_at,
  openai_spend_limit_usd, openai_token_invalid,
  orcamento_header_url, orcamento_footer_text,
  recurrence_dispatch_hour, recurrence_campaign_duration_days,
  recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3,
  auto_close_enabled, auto_close_warning_minutes, auto_close_final_minutes,
  auto_close_warning_message, auto_close_final_message,
  auto_close_no_interaction_enabled, auto_close_no_interaction_hours,
  auto_close_no_interaction_include_customer
) on public.profiles to anon;
