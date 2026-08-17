-- USER RULE (2026-08-17): quem encerra um atendimento leva a atribuição.
-- Mover card para etapa final resolve os tickets do contato (trigger abaixo);
-- quando a ação vem de um usuário autenticado (kanban, inbox), a conversa
-- resolvida é atribuída a ele. Ações de service role (crons/campanhas)
-- continuam sem atribuição — e por isso NÃO aparecem no board Finalizados
-- do Monitoramento (que exige conversa resolvida com atendente).

CREATE OR REPLACE FUNCTION public.crm_terminal_resolve_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_resolver uuid;
BEGIN
    IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')
       AND (TG_OP = 'INSERT' OR OLD.stage NOT IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')) THEN

        -- team_member do usuário autenticado que disparou a ação (NULL p/ service role)
        SELECT tm.id INTO v_resolver
        FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
          AND tm.user_id = NEW.user_id
        LIMIT 1;

        UPDATE conversations c
        SET status = 'resolved',
            assigned_agent_id = COALESCE(v_resolver, c.assigned_agent_id)
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('open', 'pending');
    END IF;
    RETURN NEW;
END $function$;
