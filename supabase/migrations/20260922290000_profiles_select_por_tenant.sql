-- Item 2 do plano de seguranca: leitura de `profiles` deixa de ser global.
--
-- ESTADO ANTERIOR (medido em 22/09/2026, arnes
-- supabase/tests/security/item_0_6_profiles_select/harness.sql):
--   policy "Users can view all profiles" | SELECT | authenticated | using (true)
-- Consequencia medida: QUALQUER usuario logado — inclusive um colaborador comum
-- e inclusive uma conta criada segundos antes — lia as 10 linhas de profiles com
-- e-mail, empresa, telefone, role, status, tokens_total, approximate_cost_total,
-- audio_cost_*, financial_access e os metadados do projeto OpenAI de TODOS os
-- tenants.
--
-- POLICY NOVA = o proprio usuario + o dono do mesmo tenant + super admin.
-- O "dono do mesmo tenant" e obrigatorio: os colaboradores NAO tem linha propria
-- em profiles (medido: 12/12 membros da PELE com auth_user_id nao tem profile) e
-- 7 pontos do front leem a linha do DONO por ownerId — Settings, useMinhaConta,
-- useRecurrenceDefaults, useOrcamentoBranding, OrcamentoBrandingCard,
-- AutoCloseSettings, RecurrenceConfigModal/RecurrenceDefaultTemplateCard.
-- Hoje isso so funciona por causa do using(true).
--
-- NADA do front precisou virar RPC: o painel admin ja le por RPC SECURITY
-- DEFINER (admin_get_all_profiles / _pending_profiles / _inactive_profiles) e as
-- fotos pela edge function admin-get-avatars. As 25 funcoes do banco que tocam
-- profiles sao SECURITY DEFINER (imunes) e as 25 edge functions usam
-- service_role (nao passa por RLS). Nao existe view sobre profiles.
--
-- get_profile_name(uuid) e a UNICA funcao SECURITY INVOKER que le profiles: e
-- resto do NotificationsBoard (deletado), sem nenhum chamador no banco, no front
-- ou nas edge functions. Fica como esta e passa a devolver 'Usuario' para id de
-- outro tenant.

-- 1) A policy global sai.
drop policy if exists "Users can view all profiles" on public.profiles;

-- 2) Entra o recorte por tenant.
create policy profiles_select_scoped on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or id = public.get_owner_id()
  or public.is_super_admin()
);

-- 3) `anon` mantinha SELECT nas 47 colunas liberadas pela 20260922133000.
-- Hoje e inerte (nenhuma policy de SELECT alcanca anon, medido: 0 linhas), mas e
-- exatamente o padrao "acidente esperando uma policy nova" que ja foi fechado em
-- token_usage_log. Nenhum caminho anonimo le profiles: o link publico de
-- agendamento e o /admin vao por edge function com service_role.
revoke select on public.profiles from anon;

comment on table public.profiles is
  'Conta (tenant). Leitura por authenticated e restrita a: o proprio usuario, o dono do mesmo tenant (get_owner_id()) e super admin (admin_users). Painel admin le por RPC SECURITY DEFINER. anon nao le.';
