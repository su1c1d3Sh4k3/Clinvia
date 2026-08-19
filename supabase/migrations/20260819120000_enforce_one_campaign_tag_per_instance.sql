-- Regra (user): máx 1 tag de campanha por contato POR INSTÂNCIA.
-- As automações (takeover T-1h, dispatch, expiry) respeitavam, mas a UI permite
-- atribuir qualquer tag manualmente (Contacts bulk, ClientSidebar, TagAssignment)
-- e furava a regra — casos Antonio Rodrigues (tag ULTRAFORMER manual 18/08 19:58,
-- sem entry na campanha) e Tatiane (tag Botox manual 18/08 21:10 após takeover
-- movê-la p/ ULTRAFORMER), tenant PELE DERMATOLOGIA.
--
-- Trigger garante o invariante em QUALQUER insert (UI, service role, backfill):
-- ao inserir uma tag de campanha, remove as demais tags de campanha do contato
-- na mesma instância (atribuição mais recente vence — espelha o takeover).

CREATE OR REPLACE FUNCTION public.enforce_one_campaign_tag_per_instance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_instance uuid;
BEGIN
    -- Tag pertence a alguma campanha?
    SELECT c.instance_id INTO v_instance
    FROM public.campaigns c
    WHERE c.tag_id = NEW.tag_id
    LIMIT 1;

    IF v_instance IS NULL THEN
        RETURN NEW; -- tag comum (ou campanha sem instância): sem regra
    END IF;

    -- Remove as outras tags de campanha do contato na MESMA instância
    DELETE FROM public.contact_tags ct
    USING public.campaigns c
    WHERE ct.contact_id = NEW.contact_id
      AND ct.tag_id <> NEW.tag_id
      AND c.tag_id = ct.tag_id
      AND c.instance_id = v_instance;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_campaign_tag_per_instance ON public.contact_tags;
CREATE TRIGGER trg_one_campaign_tag_per_instance
    BEFORE INSERT ON public.contact_tags
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_one_campaign_tag_per_instance();

-- ── Data-fix: remove as 2 tags manuais incorretas (únicas violações no banco) ──
-- Antonio Rodrigues: mantém "Botox vencido dez a março 1 a 100" (está na audiência),
-- remove "ULTRAFORMER 20% MAIO - AGO 25" (manual, sem entry na campanha)
DELETE FROM public.contact_tags
WHERE contact_id = 'aa63540e-51fa-49e3-8885-7b2b85ca311c'
  AND tag_id = '6f2b6d1e-f75e-485c-8bc4-e83a49569840';

-- Tatiane: mantém "ULTRAFORMER 20% MAIO - AGO 25" (takeover moveu a atribuição),
-- remove "Botox vencido dez a março 1 a 100" (manual, entry congelada 'moved')
DELETE FROM public.contact_tags
WHERE contact_id = 'f42bac92-93c0-4dc9-bd1f-f902a4647d4f'
  AND tag_id = 'a95b1b40-01ae-4ba0-9b9a-81dd9ddf48f1';
