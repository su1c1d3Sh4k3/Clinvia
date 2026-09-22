-- Item 5: `profiles.financial_access` sai da lista de colunas escrivel pelo
-- token do navegador e passa a ser alterada por RPC com dono verificado.
--
-- ESTADO ANTES:
--   - 20260922220000 devolveu UPDATE para 28 colunas seguras de profiles, e
--     `financial_access` entrou nessa lista porque o toggle de
--     Configuracoes > Empresa escrevia direto na tabela;
--   - a unica trava era no front (`if (userRole !== 'admin') return;`), ou seja,
--     nenhuma trava: `.update({financial_access}).eq('id', user.id)` sai do
--     navegador com o token de quem estiver logado.
--
-- POR QUE IMPORTA: a coluna e lida pela policy `notifications_select` de
-- public.notifications, via has_financial_notification_access() — ela decide se
-- SUPERVISOR ve notificacao financeira. Hoje as 9 contas estao em `true`.
--
-- CORRECAO:
--   - revoke update/insert da coluna para authenticated (funciona porque desde
--     20260922220000 o privilegio de authenticated e por COLUNA; com o grant de
--     tabela ainda no lugar um revoke de coluna seria inocuo);
--   - RPC SECURITY DEFINER que escreve apenas na linha do DONO da conta, e so
--     se quem chamou for o dono ou um colaborador com papel de gestao (admin)
--     da equipe daquele tenant.
--
-- NAO AFETA: service_role (edge functions/crons continuam com UPDATE de tabela),
-- has_financial_notification_access / notifications_select (leitura), nem o
-- restante do upsert de Settings.updateCompany (id, company_name, updated_at).
--
-- Destino combinado: a permissao migra para as permissoes de team_members; este
-- RPC e a trava do meio-tempo.
--
-- Rollback: 20260922250000_financial_access_rpc_rollback.sql

begin;

set local lock_timeout = '5s';

revoke update (financial_access) on public.profiles from authenticated;
revoke insert (financial_access) on public.profiles from authenticated;

create or replace function public.set_financial_access(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_owner uuid;
begin
  -- Dono da conta: a linha de profiles e a do proprio auth.uid()
  select p.id into v_owner from public.profiles p where p.id = auth.uid();

  if v_owner is null then
    -- Colaborador com papel de gestao na equipe de um tenant
    select tm.user_id into v_owner
      from public.team_members tm
     where tm.auth_user_id = auth.uid()
       and tm.role::text = 'admin'
     limit 1;
  end if;

  if v_owner is null then
    raise exception 'Somente o responsavel pela conta pode alterar o acesso financeiro'
      using errcode = '42501';
  end if;

  update public.profiles
     set financial_access = coalesce(p_enabled, true),
         updated_at = now()
   where id = v_owner;

  return coalesce(p_enabled, true);
end;
$fn$;

revoke all on function public.set_financial_access(boolean) from public, anon;
grant execute on function public.set_financial_access(boolean) to authenticated, service_role;

commit;
