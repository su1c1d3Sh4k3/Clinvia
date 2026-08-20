-- USER RULES 2026-08-20:
-- 1) Grafia correta: campanhas de recorrência usam "Recorrência" (com acento)
--    no nome — corrige as existentes (campanhas + tags espelho).
-- 2) Duração configurável das campanhas de recorrência: padrão 3 dias
--    (profiles.recurrence_campaign_duration_days, ajustável na engrenagem da
--    página Recorrência). valid_until = disparo + N dias.

-- ── 1) Coluna de duração (dias) ──────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS recurrence_campaign_duration_days integer NOT NULL DEFAULT 3;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_recurrence_duration_days_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_recurrence_duration_days_check
    CHECK (recurrence_campaign_duration_days BETWEEN 1 AND 30);

-- ── 2) Data-fix grafia: campanhas de recorrência existentes ─────────────────
UPDATE public.tags t
   SET name = replace(t.name, 'Recorrencia - ', 'Recorrência - ')
  FROM public.campaigns c
 WHERE c.tag_id = t.id
   AND c.recurrence_date IS NOT NULL
   AND t.name LIKE 'Recorrencia - %';

UPDATE public.campaigns
   SET name = replace(name, 'Recorrencia - ', 'Recorrência - ')
 WHERE recurrence_date IS NOT NULL
   AND name LIKE 'Recorrencia - %';
