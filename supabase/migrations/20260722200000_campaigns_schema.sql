-- =============================================================================
-- Campanhas — Schema + RPC + Crons
-- -----------------------------------------------------------------------------
-- Disparo em massa de templates Meta MARKETING com agendamento (>=48h),
-- validade, tag automática, prompt de IA por campanha e worker com
-- espaçamento de 15s entre envios (padrão delivery-automation).
-- =============================================================================

-- ── Tabela campaigns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,

    name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('csv','xml','crm','tag','appointments','sales')),
    source_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    scheduled_at TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,

    services JSONB NOT NULL DEFAULT '[]'::jsonb,      -- snapshot [{id, name, price}]
    discount_pct NUMERIC,
    initial_message TEXT NOT NULL,                     -- com <nome>/<serviço>/<data>
    variable_map JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ordem de aparição ex ["nome","servico","data"]
    objective TEXT NOT NULL,
    ai_prompt TEXT,
    ia_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
    template_id UUID,
    template_name TEXT,
    template_version INT NOT NULL DEFAULT 1,

    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled','awaiting_template','dispatching','dispatched','error','cancelled','expired')),
    error_message TEXT,
    expired_processed BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_ready
    ON public.campaigns (scheduled_at)
    WHERE status IN ('scheduled','awaiting_template','dispatching');
CREATE INDEX IF NOT EXISTS idx_campaigns_expiry
    ON public.campaigns (valid_until)
    WHERE expired_processed = FALSE;

-- ── Tabela campaign_contacts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    raw_data JSONB,                                    -- linha original quando inválida (csv/xml)

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','sent','failed','invalid','skipped')),
    error TEXT,
    sent_at TIMESTAMPTZ,
    picked_at TIMESTAMPTZ,
    message_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_contact
    ON public.campaign_contacts (campaign_id, contact_id)
    WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cc_pending
    ON public.campaign_contacts (campaign_id)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cc_contact_status
    ON public.campaign_contacts (contact_id, status);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaigns_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.campaigns_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_owner ON public.campaigns;
CREATE POLICY campaigns_owner ON public.campaigns
    FOR ALL
    USING (user_id = public.get_owner_id())
    WITH CHECK (user_id = public.get_owner_id());

DROP POLICY IF EXISTS campaign_contacts_owner ON public.campaign_contacts;
CREATE POLICY campaign_contacts_owner ON public.campaign_contacts
    FOR ALL
    USING (user_id = public.get_owner_id())
    WITH CHECK (user_id = public.get_owner_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_contacts TO service_role;

-- ── RPC: pick_campaign_contacts ──────────────────────────────────────────────
-- Recupera órfãos e faz claim atômico (FOR UPDATE SKIP LOCKED) de até p_limit
-- contatos pendentes de campanhas em 'dispatching'.
CREATE OR REPLACE FUNCTION public.pick_campaign_contacts(p_limit INT DEFAULT 4)
RETURNS SETOF public.campaign_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Recovery: linhas presas em 'sending' há mais de 5 minutos voltam a 'pending'
    UPDATE public.campaign_contacts
       SET status = 'pending', picked_at = NULL
     WHERE status = 'sending'
       AND picked_at < now() - INTERVAL '5 minutes';

    RETURN QUERY
    WITH candidate AS (
        SELECT cc.id
        FROM public.campaign_contacts cc
        JOIN public.campaigns c ON c.id = cc.campaign_id
        WHERE cc.status = 'pending'
          AND c.status = 'dispatching'
        ORDER BY cc.created_at ASC
        FOR UPDATE OF cc SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.campaign_contacts j
       SET status = 'sending',
           picked_at = now()
      FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_campaign_contacts(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_campaign_contacts(INT) TO service_role;

-- ── Expiração de campanhas (SQL puro, sem edge function) ─────────────────────
CREATE OR REPLACE FUNCTION public.expire_campaigns()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT id, tag_id, status
        FROM public.campaigns
        WHERE valid_until < now()
          AND expired_processed = FALSE
    LOOP
        IF c.tag_id IS NOT NULL THEN
            DELETE FROM public.contact_tags WHERE tag_id = c.tag_id;
        END IF;

        UPDATE public.campaigns
           SET expired_processed = TRUE,
               status = CASE WHEN status = 'dispatched' THEN 'expired' ELSE status END
         WHERE id = c.id;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_campaigns() TO service_role;

-- ── Invocador do worker (com guard barato) ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_campaign_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    -- Só invoca a edge function se houver trabalho a fazer
    IF NOT EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE status = 'dispatching'
           OR (status IN ('scheduled','awaiting_template') AND scheduled_at <= now())
    ) THEN
        RETURN;
    END IF;

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/campaign-dispatch',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'campaign-dispatch invoke error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_campaign_dispatch() TO service_role;

-- ── Agendamentos pg_cron ─────────────────────────────────────────────────────
DO $$ BEGIN PERFORM cron.unschedule('campaign-dispatch-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('campaign-dispatch-worker','* * * * *',
    $CRON$SELECT public.invoke_campaign_dispatch()$CRON$);

DO $$ BEGIN PERFORM cron.unschedule('campaign-expiry'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('campaign-expiry','0 * * * *',
    $CRON$SELECT public.expire_campaigns()$CRON$);
