-- Item 0.5 do plano de seguranca: escalonamento de privilegio via UPDATE na
-- propria linha de public.profiles.
--
-- ESTADO ANTES (confirmado com arnes em supabase/.temp/_f05_harness.sql):
--   A RLS de profiles so checa `id = auth.uid()` e nao ha trigger guardando
--   'role'. Com `grant update on profiles to authenticated`, qualquer usuario
--   logado fazia na PROPRIA linha:
--     - role = 'super-admin'  => is_super_admin() => is_admin_staff() => /admin
--     - markup = 0            => zera a margem de cobranca da conta
--     - tokens_* / *_cost_*   => zera o proprio consumo faturavel
--     - openai_spend_limit_usd, openai_token, openai_key_source ...
--     - status/deactivated_at/deletion_warning_sent_at => reativa conta suspensa
--   Reproduzido tanto com role='admin' quanto com role='agent'.
--
-- CORRECAO:
--   Privilegio de COLUNA nao vence GRANT de TABELA: `revoke update (col)` e
--   silenciosamente inocuo enquanto existir `grant update on profiles`. Por isso
--   o UPDATE sai da TABELA e volta coluna por coluna, apenas nas colunas que o
--   front realmente escreve.
--
-- NAO AFETA:
--   - service_role / postgres (edge functions, crons, n8n) tem rolbypassrls e
--     grants proprios;
--   - as 6 funcoes SECURITY DEFINER que escrevem profiles
--     (increment_profile_token_usage, track_token_usage, track_audio_usage,
--     reset_monthly_tokens, admin_deactivate_profile, admin_reactivate_profile);
--   - SELECT e INSERT em profiles seguem como estavam (o signup anonimo usa
--     pending_signups, nao profiles).
--
-- Rollback: 20260922220000_profiles_revoke_privilege_columns_rollback.sql

begin;

set local lock_timeout = '5s';

revoke update on public.profiles from authenticated, anon;

-- Colunas escritas pelo front hoje:
--   Settings.updateCompany (upsert => precisa de UPDATE(id)), cadastro proprio,
--   updateFinancialAccess, ChangePasswordModal/ResetPassword
--   (must_change_password), AutoCloseSettings, RecurrenceConfigModal /
--   RecurrenceDefaultTemplateCard, OrcamentoBrandingCard.
grant update (
  id, full_name, avatar_url, company_name, phone, address, email, instagram,
  notifications_enabled, group_notifications_enabled, financial_access,
  must_change_password, updated_at,
  recurrence_dispatch_hour, recurrence_campaign_duration_days,
  recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3,
  auto_close_enabled, auto_close_warning_minutes, auto_close_final_minutes,
  auto_close_warning_message, auto_close_final_message,
  auto_close_no_interaction_enabled, auto_close_no_interaction_hours,
  auto_close_no_interaction_include_customer,
  orcamento_header_url, orcamento_footer_text
) on public.profiles to authenticated;

commit;
