-- =============================================
-- DEBUG: Verificar estado do sistema
-- Execute cada seção separadamente no SQL Editor
-- =============================================

-- 1. VER TODOS OS PROFILES
SELECT id, full_name, email FROM public.profiles ORDER BY created_at DESC;

-- 2. VER TODOS OS TEAM_MEMBERS
SELECT id, user_id, auth_user_id, name, email, role FROM public.team_members ORDER BY created_at DESC;

-- 3. VER CONTACTS E SEUS user_id
SELECT id, push_name, user_id FROM public.contacts LIMIT 10;

-- 4. TESTAR get_owner_id() - deve retornar o user_id do admin logado
SELECT get_owner_id();

-- 5. VERIFICAR SE A FUNÇÃO get_owner_id() EXISTE
SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_owner_id' LIMIT 1;

-- =============================================
-- SE O PROBLEMA FOR QUE contacts.user_id ESTÁ NULL OU INCORRETO:
-- =============================================

-- OPÇÃO A: Atualizar contacts para usar o user_id de um usuario específico
-- UPDATE public.contacts SET user_id = 'UUID-DO-OWNER-AQUI' WHERE user_id IS NULL;

-- OPÇÃO B: Ver quantos contacts não tem user_id
SELECT COUNT(*) as contacts_sem_user_id FROM public.contacts WHERE user_id IS NULL;
