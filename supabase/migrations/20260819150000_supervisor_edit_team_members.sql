-- User rule: supervisor pode EDITAR membros da equipe.
-- O frontend já liberava (canEdit('team_members') default TRUE p/ supervisor,
-- botão visível p/ linhas não-admin), mas o RLS de team_members só permitia
-- UPDATE via is_admin() ou o próprio perfil — o update do supervisor afetava
-- 0 linhas silenciosamente (toast de sucesso sem efeito).
--
-- Policy nova: supervisor edita membros NÃO-admin da mesma empresa.
-- WITH CHECK repete role <> 'admin' → impossível promover alguém (ou a si) a admin.

SET lock_timeout = '5s';

DROP POLICY IF EXISTS "Supervisores podem editar membros nao-admin da empresa" ON public.team_members;
CREATE POLICY "Supervisores podem editar membros nao-admin da empresa"
ON public.team_members
FOR UPDATE
TO authenticated
USING (
    is_supervisor()
    AND user_id = get_my_owner_id()
    AND role <> 'admin'
)
WITH CHECK (
    is_supervisor()
    AND user_id = get_my_owner_id()
    AND role <> 'admin'
);
