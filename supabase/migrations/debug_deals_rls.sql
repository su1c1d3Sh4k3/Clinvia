-- =============================================
-- Script de DEBUG - Execute no SQL Editor do Supabase
-- COPIE E EXECUTE CADA SEÇÃO SEPARADAMENTE
-- =============================================

-- 1. VERIFICAR ESTRUTURA DE TEAM_MEMBERS
-- Execute para ver os membros e seus IDs
SELECT id, user_id, auth_user_id, name, email, role 
FROM public.team_members;

-- 2. VERIFICAR DEALS E SEUS RESPONSÁVEIS  
-- Execute para ver os deals e quem é responsável
SELECT d.id, d.title, d.user_id as deal_owner, d.responsible_id,
       tm.name as responsible_name, tm.role as responsible_role
FROM public.crm_deals d
LEFT JOIN public.team_members tm ON d.responsible_id = tm.id;

-- 3. TESTAR FUNÇÃO is_agent() PARA O AGENTE
-- Substitua 'ID_DO_AGENTE_AQUI' pelo ID do agente (coluna auth_user_id da query 1)
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claim.sub = 'ID_DO_AGENTE_AQUI';
-- SELECT is_agent();

-- 4. VERIFICAR SE RESPONSIBLE_ID ESTÁ PREENCHIDO
SELECT 
    (SELECT COUNT(*) FROM crm_deals WHERE responsible_id IS NULL) as deals_sem_responsavel,
    (SELECT COUNT(*) FROM crm_deals WHERE responsible_id IS NOT NULL) as deals_com_responsavel;

-- 5. VERIFICAR AS POLICIES ATUAIS EM CRM_DEALS
SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) as qual
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relname = 'crm_deals';
