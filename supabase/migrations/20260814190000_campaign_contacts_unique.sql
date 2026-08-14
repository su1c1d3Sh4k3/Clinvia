-- Regra de negócio (2026-08-14): cada contato só pode ter UMA entrada por campanha,
-- independente da fonte da audiência (reverte a permissão de duplicados da campaigns_v2).
-- Verificado: nenhuma linha duplicada existente no banco; dedupe defensivo mesmo assim.

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY campaign_id, contact_id
               ORDER BY (status = 'sent') DESC, created_at
           ) AS rn
    FROM public.campaign_contacts
    WHERE contact_id IS NOT NULL
)
DELETE FROM public.campaign_contacts cc
USING ranked r
WHERE cc.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_contact
    ON public.campaign_contacts (campaign_id, contact_id)
    WHERE contact_id IS NOT NULL;
