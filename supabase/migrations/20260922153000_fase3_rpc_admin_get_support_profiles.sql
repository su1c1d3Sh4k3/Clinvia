-- Fase 3 (preparacao) — RPC para o painel admin ler o dono de cada chamado de
-- suporte SEM depender da policy aberta "Users can view all profiles"
-- (SELECT / authenticated / USING true), que a Fase 2 vai derrubar.
--
-- Hoje src/hooks/useSupportInbox.ts:37 faz
--   supabase.from("profiles").select("id, company_name, full_name, email").in("id", userIds)
-- com userIds de TODOS os tenants. Isso so funciona porque qualquer usuario
-- logado le a tabela profiles inteira — que e exatamente o achado #1 da
-- auditoria. Fechada a policy, a caixa de entrada do suporte perde o nome da
-- empresa e do dono em todos os chamados.
--
-- Esta migration e ADITIVA: cria a funcao e nada mais. Nenhuma policy, grant ou
-- coluna existente e alterada, logo NAO ha impacto no que roda hoje. O front
-- passa a chamar a RPC no mesmo commit; o comportamento na tela e identico
-- (mesmas 4 colunas, mesmos ids), so a porta de entrada muda.
--
-- A guarda e no CORPO (`where public.is_admin_staff()`), nao um revoke: quem nao
-- e staff do admin recebe 0 linhas em vez de erro, e o resto do app nunca chama
-- esta funcao.

create or replace function public.admin_get_support_profiles(p_user_ids uuid[])
returns table (id uuid, company_name text, full_name text, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.company_name, p.full_name, p.email
    from public.profiles p
   where public.is_admin_staff()
     and p.id = any(p_user_ids);
$$;

revoke execute on function public.admin_get_support_profiles(uuid[]) from public;
revoke execute on function public.admin_get_support_profiles(uuid[]) from anon;
grant  execute on function public.admin_get_support_profiles(uuid[]) to authenticated;
grant  execute on function public.admin_get_support_profiles(uuid[]) to service_role;
