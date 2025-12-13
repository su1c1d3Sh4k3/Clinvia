-- =============================================
-- Migration: Correção de dados CRM
-- Criado em: 2025-12-11
-- 
-- Corrige o user_id de crm_stages e crm_funnels que podem ter
-- been criados com IDs incorretos antes da implementação multi-tenant.
-- =============================================

-- 1. Atualizar crm_funnels: garantir que todos os funis de um admin 
-- tenham o mesmo user_id (o ID do admin)
-- Esta query encontra funis onde o user_id não corresponde ao owner correto
-- e os atualiza baseado na tabela team_members

UPDATE public.crm_funnels f
SET user_id = (
    SELECT tm.user_id 
    FROM public.team_members tm 
    WHERE tm.auth_user_id = f.user_id 
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 
    FROM public.team_members tm 
    WHERE tm.auth_user_id = f.user_id
);

-- 2. Atualizar crm_stages: garantir que todas as etapas herdem o user_id do funil pai
UPDATE public.crm_stages s
SET user_id = f.user_id
FROM public.crm_funnels f
WHERE s.funnel_id = f.id
AND s.user_id != f.user_id;

-- 3. Atualizar crm_deals: garantir que todas os deals herdem o user_id do funil pai
UPDATE public.crm_deals d
SET user_id = f.user_id
FROM public.crm_funnels f
WHERE d.funnel_id = f.id
AND d.user_id != f.user_id;

-- 4. Verificação final - listar funnels e seus user_ids
-- (Isso é apenas para debug, não altera nada)
-- SELECT f.id, f.name, f.user_id, 
--        (SELECT COUNT(*) FROM crm_stages WHERE funnel_id = f.id) as stages_count
-- FROM crm_funnels f;
