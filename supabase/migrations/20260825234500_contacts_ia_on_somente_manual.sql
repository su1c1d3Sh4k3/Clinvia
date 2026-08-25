-- REGRA DO USUÁRIO (2026-08-25): NADA no sistema pode desligar a IA de um
-- contato. contacts.ia_on nasce true (default) e só o switch manual da página
-- Clientes pode desligá-lo.
--
-- Violação encontrada: campaign-dispatch gravava contacts.ia_on = ia_enabled da
-- campanha em todo contato disparado — campanha de fila Humano desligava a IA
-- do contato para sempre (2.885 contatos da conta PELE; 100% dos desligados do
-- banco vieram daí, nenhum desligamento manual). O bloqueio da IA numa campanha
-- Humano já é garantido pela FILA da conversa ('Atendimento Humano' reprova o
-- gate de encaminhamento ao n8n).

-- 1) Backfill: religa todos os contatos desligados pelo sistema
UPDATE contacts
SET ia_on = TRUE
WHERE ia_on IS DISTINCT FROM TRUE;

-- 2) Guarda permanente: escrita de sistema (service role / cron / edge fn, sem
--    usuário autenticado) nunca desliga a IA do contato. Usuário logado, sim.
CREATE OR REPLACE FUNCTION public.contacts_ia_on_manual_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.ia_on IS DISTINCT FROM OLD.ia_on
       AND NEW.ia_on IS NOT TRUE
       AND auth.uid() IS NULL THEN
        NEW.ia_on := OLD.ia_on;
    END IF;
    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_contacts_ia_on_manual_only ON public.contacts;
CREATE TRIGGER trg_contacts_ia_on_manual_only
    BEFORE UPDATE OF ia_on ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.contacts_ia_on_manual_only();

COMMENT ON FUNCTION public.contacts_ia_on_manual_only() IS
    'contacts.ia_on só pode ser desligado por usuário autenticado (switch manual em Clientes). Escritas de sistema (service role) que tentem desligar são ignoradas.';
