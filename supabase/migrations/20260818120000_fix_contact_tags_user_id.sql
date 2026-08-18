-- Fix: contact_tags criadas por edge functions (service role) ficavam com
-- user_id NULL — o trigger set_contact_tags_user_id usava só get_owner_id(),
-- que retorna NULL sem auth.uid(). Com a RLS (user_id = get_owner_id()),
-- as tags de campanha sumiam do front (campanha "Botox vencido dez a março
-- 1 a 100", 2026-08-17: 95 contatos taggeados, nenhum visível).

-- 1) Trigger com fallback: se get_owner_id() não resolver, herda o dono da tag
CREATE OR REPLACE FUNCTION public.set_contact_tags_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.user_id IS NULL THEN
        NEW.user_id := get_owner_id();
    END IF;
    IF NEW.user_id IS NULL THEN
        SELECT t.user_id INTO NEW.user_id FROM public.tags t WHERE t.id = NEW.tag_id;
    END IF;
    RETURN NEW;
END;
$function$;

-- 2) Backfill: linhas órfãs herdam o dono da tag
UPDATE public.contact_tags ct
SET user_id = t.user_id
FROM public.tags t
WHERE ct.tag_id = t.id
  AND ct.user_id IS NULL;

-- 3) Reinsere tags faltantes de envios 'sent' de campanhas cuja tag ainda existe
--    (o upsert do dispatch com ignoreDuplicates pulava linhas NULL já existentes)
INSERT INTO public.contact_tags (contact_id, tag_id, user_id)
SELECT cc.contact_id, c.tag_id, c.user_id
FROM public.campaign_contacts cc
JOIN public.campaigns c ON c.id = cc.campaign_id
WHERE c.tag_id IS NOT NULL
  AND cc.status = 'sent'
  AND cc.contact_id IS NOT NULL
ON CONFLICT (contact_id, tag_id) DO NOTHING;
