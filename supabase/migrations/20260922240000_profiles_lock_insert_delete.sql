-- Item 0.5 (continuacao): o revoke de UPDATE de 20260922220000 era CONTORNAVEL
-- por DELETE + INSERT da propria linha.
--
-- ESTADO ANTES (probe supabase/.temp/_f06_probe.sql):
--   - policy `profiles_all` e FOR ALL com using/check `id = auth.uid()` ⇒ cobre
--     DELETE e INSERT da propria linha;
--   - `grant delete, insert on profiles to authenticated` valia para a tabela
--     inteira (INSERT liberado nas 51 colunas).
--   Logo: `delete from profiles where id = auth.uid()` seguido de
--   `insert into profiles(id, role) values (auth.uid(), 'super-admin')` recriava
--   a linha com o privilegio que o UPDATE nao deixava mais escrever — e tambem
--   zerava markup, tokens e limites (a linha nasce do zero).
--   Um usuario de auth SEM linha em profiles (27 existem) fazia o INSERT direto.
--   Alem disso, a policy `Allow anonymous signup insert` (roles=public,
--   check `status='pendente' AND role='admin'`) NAO ancora o `id`: dava para
--   injetar linha de profiles para o id de outra pessoa.
--
-- CORRECAO (mesmo padrao do 0.5):
--   - DELETE sai de authenticated/anon (nenhuma tela apaga a propria linha de
--     profiles; exclusao de conta e admin_delete_tenant_data / edge functions,
--     que rodam como service_role);
--   - INSERT sai da tabela e volta nas mesmas colunas seguras do UPDATE, entao
--     `role` nasce sempre no default 'agent' e `status` em 'ativo'. Isso tambem
--     mata a injecao pela policy de signup, que exige role='admin'.
--
-- NAO AFETA: service_role (edge functions, crons, approve-client,
-- admin-create-user, admin-delete-client), as 6 funcoes SECURITY DEFINER e o
-- upsert de Settings.updateCompany (id, company_name, updated_at).
--
-- Rollback: 20260922240000_profiles_lock_insert_delete_rollback.sql

begin;

set local lock_timeout = '5s';

revoke delete on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;

grant insert (
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
