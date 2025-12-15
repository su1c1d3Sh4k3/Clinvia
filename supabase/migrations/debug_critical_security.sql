-- =============================================
-- DEBUG CRÍTICO: Execute CADA query separadamente
-- =============================================

-- 1. VERIFICAR SE get_owner_id() RETORNA O VALOR CORRETO
-- Deve retornar o user_id do usuário logado
SELECT get_owner_id() as owner_id_retornado;

-- 2. VER O user_id DO USUÁRIO LOGADO em team_members
SELECT id, user_id, auth_user_id, name, role 
FROM public.team_members 
WHERE auth_user_id = auth.uid() OR user_id = auth.uid();

-- 3. VER QUAIS user_id EXISTEM NOS CONTACTS
SELECT DISTINCT user_id FROM public.contacts;

-- 4. VERIFICAR SE RLS ESTÁ ATIVO EM CONTACTS
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'contacts';

-- 5. VER AS POLICIES ATUAIS DE CONTACTS
SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) as policy_condition
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relname = 'contacts';

-- 6. TESTAR QUERY DIRETA - quantos contacts deveria retornar para o user logado
SELECT COUNT(*) as total_contacts_do_owner
FROM public.contacts 
WHERE user_id = get_owner_id();

-- 7. COMPARAR COM TOTAL DE CONTACTS
SELECT COUNT(*) as total_contacts_na_tabela FROM public.contacts;

-- =============================================
-- SE O PROBLEMA FOR QUE get_owner_id() RETORNA NULL OU VALOR ERRADO:
-- =============================================
-- Verifique os resultados acima e me envie
