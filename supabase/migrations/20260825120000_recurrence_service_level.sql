-- ============================================================================
-- Recorrência no nível do SERVIÇO (service_name) — user rules 2026-08-25
--
-- 1. Config de recorrência (ativa/tempos/descontos/mensagens custom) sai da
--    aplicação (services_client) e passa a viver no serviço (service_name).
--    Mensagem NULL no serviço = usa o template padrão da conta (profiles) ou o
--    default embutido no código (_shared/recurrence-default-messages.ts).
-- 2. Template padrão editável por conta: profiles.recurrence_default_msg_1..3
--    (NULL = texto padrão embutido).
-- 3. message_templates de recorrência passam a referenciar service_name_id
--    (custom por serviço) ou NULL (template padrão da conta, rec_default_*).
-- 4. Globais pré-cadastrados (services_category/service_name/service_applications
--    com user_id NULL) são migrados para cópias do próprio cliente (como se
--    criados manualmente) e excluídos.
-- 5. Config existente das aplicações é promovida ao serviço-pai (a mais
--    recente vence; ativa se alguma aplicação estava ativa). As colunas antigas
--    de services_client ficam CONGELADAS (não dropamos por causa de bundles PWA
--    antigos que ainda escrevem nelas) — nada mais lê esses valores.
-- ============================================================================

BEGIN;

-- ── 1. Colunas de recorrência no serviço ────────────────────────────────────
ALTER TABLE public.service_name
    ADD COLUMN IF NOT EXISTS recurrence boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS time_recurrence_1 integer,
    ADD COLUMN IF NOT EXISTS time_recurrence_2 integer,
    ADD COLUMN IF NOT EXISTS time_recurrence_3 integer,
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_1 numeric,
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_2 numeric,
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_3 numeric,
    ADD COLUMN IF NOT EXISTS msg_recurrence_1 text,
    ADD COLUMN IF NOT EXISTS msg_recurrence_2 text,
    ADD COLUMN IF NOT EXISTS msg_recurrence_3 text;

-- ── 2. Template padrão da conta (NULL = default embutido no código) ─────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS recurrence_default_msg_1 text,
    ADD COLUMN IF NOT EXISTS recurrence_default_msg_2 text,
    ADD COLUMN IF NOT EXISTS recurrence_default_msg_3 text;

-- ── 3. message_templates: recorrência por serviço OU padrão da conta ────────
-- (rec_templates atuais = 0 linhas; troca de esquema é limpa)
DROP INDEX IF EXISTS public.uq_recurrence_template;
ALTER TABLE public.message_templates
    DROP COLUMN IF EXISTS service_client_id,
    ADD COLUMN IF NOT EXISTS service_name_id uuid REFERENCES public.service_name(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurrence_template_service
    ON public.message_templates (service_name_id, recurrence_msg_number, instance_id)
    WHERE service_name_id IS NOT NULL AND recurrence_msg_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurrence_template_default
    ON public.message_templates (user_id, instance_id, recurrence_msg_number)
    WHERE service_name_id IS NULL AND recurrence_msg_number IS NOT NULL;

-- ── 4. campaigns: referência ao serviço da recorrência ──────────────────────
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS recurrence_service_name_id uuid REFERENCES public.service_name(id) ON DELETE SET NULL;

-- ── 5. Migrar globais usados para cópias do próprio cliente ─────────────────
-- Unicidade de nome de categoria era GLOBAL (bug latente multi-tenant: dois
-- clientes não podiam ter categoria com o mesmo nome) — passa a ser por usuário
ALTER TABLE public.services_category DROP CONSTRAINT IF EXISTS services_category_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_category_user_name
    ON public.services_category (user_id, name);

-- Categorias globais usadas (via services_client OU via service_name do usuário
-- pendurado em categoria global) → cópia por owner
CREATE TEMP TABLE tmp_cat_usage ON COMMIT DROP AS
SELECT DISTINCT owner_id, cat_id FROM (
    SELECT sc.user_id AS owner_id, sc.category_id AS cat_id
    FROM public.services_client sc
    JOIN public.services_category c ON c.id = sc.category_id
    WHERE c.user_id IS NULL
    UNION
    SELECT sc.user_id, sn.category_id
    FROM public.services_client sc
    JOIN public.service_name sn ON sn.id = sc.service_name_id
    WHERE sn.user_id IS NULL AND sn.category_id IS NOT NULL
    UNION
    SELECT sn.user_id, sn.category_id
    FROM public.service_name sn
    JOIN public.services_category c ON c.id = sn.category_id
    WHERE sn.user_id IS NOT NULL AND c.user_id IS NULL
) u;

CREATE TEMP TABLE tmp_cat_map ON COMMIT DROP AS
SELECT u.owner_id, u.cat_id AS old_id, gen_random_uuid() AS new_id,
       c.name, c.description, c.category_type
FROM tmp_cat_usage u
JOIN public.services_category c ON c.id = u.cat_id;

INSERT INTO public.services_category (id, name, description, category_type, user_id)
SELECT new_id, name, description, category_type, owner_id FROM tmp_cat_map;

-- service_name globais usados (via services_client) → cópia por owner
CREATE TEMP TABLE tmp_sn_map ON COMMIT DROP AS
SELECT DISTINCT sc.user_id AS owner_id, sn.id AS old_id, gen_random_uuid() AS new_id,
       sn.name, sn.description, sn.category_id AS old_cat
FROM public.services_client sc
JOIN public.service_name sn ON sn.id = sc.service_name_id
WHERE sn.user_id IS NULL;

INSERT INTO public.service_name (id, name, description, category_id, user_id)
SELECT m.new_id, m.name, m.description,
       COALESCE(cm.new_id, m.old_cat), m.owner_id
FROM tmp_sn_map m
LEFT JOIN tmp_cat_map cm ON cm.owner_id = m.owner_id AND cm.old_id = m.old_cat;

-- Repontar services_client
UPDATE public.services_client sc
SET service_name_id = m.new_id
FROM tmp_sn_map m
WHERE sc.user_id = m.owner_id AND sc.service_name_id = m.old_id;

UPDATE public.services_client sc
SET category_id = m.new_id
FROM tmp_cat_map m
WHERE sc.user_id = m.owner_id AND sc.category_id = m.old_id;

-- Repontar service_name do usuário pendurado em categoria global
UPDATE public.service_name sn
SET category_id = m.new_id
FROM tmp_cat_map m
WHERE sn.user_id = m.owner_id AND sn.category_id = m.old_id;

-- Repontar appointments.service_name_id (referência solta, sem FK)
UPDATE public.appointments a
SET service_name_id = m.new_id
FROM tmp_sn_map m
WHERE a.user_id = m.owner_id AND a.service_name_id = m.old_id;

-- Excluir todos os globais pré-cadastrados (serão refeitos depois)
DELETE FROM public.service_applications;
DELETE FROM public.service_name WHERE user_id IS NULL;
ALTER TABLE public.services_category DISABLE TRIGGER services_category_protect_avaliacao;
DELETE FROM public.services_category WHERE user_id IS NULL;
ALTER TABLE public.services_category ENABLE TRIGGER services_category_protect_avaliacao;

-- ── 6. Promover config de recorrência da aplicação → serviço-pai ────────────
-- Ativa se alguma aplicação ativa; tempos/descontos da aplicação mais recente
-- (preferindo as com recurrence=true). Mensagens antigas: nenhuma existe (0).
WITH ranked AS (
    SELECT sc.service_name_id, sc.time_recurrence_1, sc.time_recurrence_2, sc.time_recurrence_3,
           sc.recurrence_discount_pct_1, sc.recurrence_discount_pct_2, sc.recurrence_discount_pct_3,
           row_number() OVER (
               PARTITION BY sc.service_name_id
               ORDER BY (sc.recurrence IS TRUE) DESC, sc.updated_at DESC NULLS LAST
           ) AS rn
    FROM public.services_client sc
    WHERE sc.recurrence IS TRUE
       OR sc.time_recurrence_1 IS NOT NULL
       OR sc.time_recurrence_2 IS NOT NULL
       OR sc.time_recurrence_3 IS NOT NULL
)
UPDATE public.service_name sn
SET recurrence = EXISTS (
        SELECT 1 FROM public.services_client x
        WHERE x.service_name_id = sn.id AND x.recurrence IS TRUE
    ),
    time_recurrence_1 = r.time_recurrence_1,
    time_recurrence_2 = r.time_recurrence_2,
    time_recurrence_3 = r.time_recurrence_3,
    recurrence_discount_pct_1 = r.recurrence_discount_pct_1,
    recurrence_discount_pct_2 = r.recurrence_discount_pct_2,
    recurrence_discount_pct_3 = r.recurrence_discount_pct_3
FROM ranked r
WHERE r.rn = 1 AND r.service_name_id = sn.id;

-- ── 7. Trigger de tracking passa a ler a config do SERVIÇO ──────────────────
CREATE OR REPLACE FUNCTION public.fn_create_recurrence_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sc services_client%ROWTYPE;
    v_sn service_name%ROWTYPE;
    v_contact_name text;
    v_proc_date date;
    v_recurrence_date date;
BEGIN
    IF NEW.status NOT IN ('waiting', 'completed') THEN
        RETURN NEW;
    END IF;

    IF NEW.service_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.recurrence_tracking
        WHERE appointment_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_sc
    FROM public.services_client
    WHERE id = NEW.service_id;

    IF v_sc.id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Config de recorrência vem do SERVIÇO (service_name), não da aplicação
    SELECT * INTO v_sn
    FROM public.service_name
    WHERE id = COALESCE(NEW.service_name_id, v_sc.service_name_id);

    IF v_sn.id IS NULL OR v_sn.recurrence IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Precisa de pelo menos um tempo de abordagem configurado
    IF v_sn.time_recurrence_1 IS NULL
       AND v_sn.time_recurrence_2 IS NULL
       AND v_sn.time_recurrence_3 IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT c.push_name INTO v_contact_name
    FROM public.contacts c
    WHERE c.id = NEW.contact_id;

    v_proc_date := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::date;

    -- Vencimento: expiry_months da aplicação quando existir, senão o tempo da
    -- abordagem 2 (Vencimento), com fallback nas demais
    IF v_sc.expiry_months IS NOT NULL AND v_sc.expiry_months > 0 THEN
        v_recurrence_date := v_proc_date + (v_sc.expiry_months || ' months')::interval;
    ELSE
        v_recurrence_date := v_proc_date + COALESCE(
            v_sn.time_recurrence_2, v_sn.time_recurrence_3, v_sn.time_recurrence_1
        );
    END IF;

    INSERT INTO public.recurrence_tracking (
        user_id, contact_id, appointment_id, service_client_id,
        contact_name, service_name, application_name,
        procedure_date, recurrence_date,
        approach_1_date, approach_2_date, approach_3_date
    ) VALUES (
        NEW.user_id,
        NEW.contact_id,
        NEW.id,
        NEW.service_id,
        COALESCE(v_contact_name, 'Cliente'),
        COALESCE(v_sn.name, 'Serviço'),
        COALESCE(NEW.service_name, v_sc.name, 'Aplicação'),
        v_proc_date,
        v_recurrence_date,
        CASE WHEN v_sn.time_recurrence_1 IS NOT NULL
             THEN v_proc_date + v_sn.time_recurrence_1 ELSE NULL END,
        CASE WHEN v_sn.time_recurrence_2 IS NOT NULL
             THEN v_proc_date + v_sn.time_recurrence_2 ELSE NULL END,
        CASE WHEN v_sn.time_recurrence_3 IS NOT NULL
             THEN v_proc_date + v_sn.time_recurrence_3 ELSE NULL END
    )
    ON CONFLICT (appointment_id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMIT;
