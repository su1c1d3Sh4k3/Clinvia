-- Ambiente Sandbox da IA
--
-- Espelho isolado do mundo real: o cliente conversa com a IA, agenda, lanca venda
-- e move o CRM sem tocar em NENHUMA tabela de producao e sem enviar nada por WhatsApp.
-- Tudo pendura em sandbox_sessions (1 por conta) e morre junto no reset.
--
-- Regras:
--  - escopo por conta: user_id = (SELECT get_owner_id()) em toda policy
--  - catalogo (profissionais, servicos, convenios) continua sendo o REAL, so leitura
--  - numero do paciente ficticio comeca com 5500 (DDD 00 nao existe no Brasil)

-- ── Sessao ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    -- 'real' = agenda do sandbox respeita os agendamentos reais das salas;
    -- 'livre' = so enxerga os agendamentos do proprio sandbox
    agenda_mode text NOT NULL DEFAULT 'real' CHECK (agenda_mode IN ('real', 'livre')),
    -- copia de trabalho do tom de voz: mexer aqui NAO afeta a IA de producao
    tone_settings jsonb,
    tone_inject text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Paciente ficticio ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    push_name text NOT NULL DEFAULT 'Paciente de Teste',
    number text NOT NULL,
    email text,
    cpf text,
    company text,
    instagram text,
    patient boolean NOT NULL DEFAULT true,
    client_stage text NOT NULL DEFAULT 'contato',
    -- convenios REAIS que esse paciente ficticio possui
    convenio_ids uuid[] NOT NULL DEFAULT '{}',
    ia_context_reset_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_contacts_session ON public.sandbox_contacts(session_id);

-- ── Conversa e mensagens ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL REFERENCES public.sandbox_contacts(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    last_summary text,
    last_message_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_conversations_session ON public.sandbox_conversations(session_id);

CREATE TABLE IF NOT EXISTS public.sandbox_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    conversation_id uuid NOT NULL REFERENCES public.sandbox_conversations(id) ON DELETE CASCADE,
    -- 'user' = paciente ficticio, 'assistant' = IA, 'system' = pilula (template, campanha...)
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content text NOT NULL DEFAULT '',
    message_type text NOT NULL DEFAULT 'text',
    media_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_messages_conversation ON public.sandbox_messages(conversation_id, created_at);

-- ── Agendamentos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL REFERENCES public.sandbox_contacts(id) ON DELETE CASCADE,
    -- sala REAL (public.professionals) e servico REAL (public.services_client)
    professional_id uuid,
    service_id uuid,
    title text,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_appointments_session ON public.sandbox_appointments(session_id, start_time);

-- ── Vendas (alimentam unscheduled_purchases no payload) ───────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL REFERENCES public.sandbox_contacts(id) ON DELETE CASCADE,
    service_client_id uuid,
    appointment_id uuid REFERENCES public.sandbox_appointments(id) ON DELETE SET NULL,
    service_name text,
    value numeric NOT NULL DEFAULT 0,
    sale_date date NOT NULL DEFAULT CURRENT_DATE,
    payment_type text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_sales_session ON public.sandbox_sales(session_id);

-- ── CRM ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_crm (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL REFERENCES public.sandbox_contacts(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.sandbox_conversations(id) ON DELETE CASCADE,
    stage text NOT NULL DEFAULT 'Novo Lead',
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_crm_session ON public.sandbox_crm(session_id);

CREATE TABLE IF NOT EXISTS public.sandbox_crm_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_id uuid NOT NULL REFERENCES public.sandbox_crm(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    service_client_id uuid,
    service_name text,
    price numeric,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sandbox_crm_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_id uuid NOT NULL REFERENCES public.sandbox_crm(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    from_stage text,
    to_stage text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Campanhas simuladas (campanha comum e recorrencia) ───────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    name text NOT NULL DEFAULT 'Campanha de teste',
    campaign_tag text,
    objective text,
    ai_prompt text,
    initial_message text,
    services text[] NOT NULL DEFAULT '{}',
    professionals text[] NOT NULL DEFAULT '{}',
    service_description text,
    discount_pct numeric,
    ia_enabled boolean NOT NULL DEFAULT true,
    ia_function text,
    -- 'manual' = campanha comum; 'recurrence' = recorrencia (1, 2 ou 3)
    source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'recurrence')),
    recurrence_msg_number integer CHECK (recurrence_msg_number IN (1, 2, 3)),
    valid_until timestamptz,
    scheduled_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_campaigns_session ON public.sandbox_campaigns(session_id);

-- ── Notas da IA (api-add-note-sandbox) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    contact_id uuid REFERENCES public.sandbox_contacts(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Log das chamadas de API (container "o que a IA fez") ──────────────────────
CREATE TABLE IF NOT EXISTS public.sandbox_api_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    function_name text NOT NULL,
    -- frase em portugues ja pronta para a tela ("Consultou horarios do dia 20/09")
    label text NOT NULL,
    ok boolean NOT NULL DEFAULT true,
    status_code integer,
    request jsonb,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_api_logs_session ON public.sandbox_api_logs(session_id, created_at DESC);

-- ── Consumo de tokens do sandbox (nunca entra em token_usage_log) ─────────────
CREATE TABLE IF NOT EXISTS public.sandbox_token_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sandbox_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    model text,
    prompt_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    total_tokens integer NOT NULL DEFAULT 0,
    cost_usd numeric NOT NULL DEFAULT 0,
    cost_brl numeric NOT NULL DEFAULT 0,
    exchange_rate numeric,
    workflow_id text,
    execution_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_token_usage_session ON public.sandbox_token_usage(session_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Tabelas com user_id proprio: escopo direto pela conta.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sandbox_sessions', 'sandbox_contacts', 'sandbox_conversations', 'sandbox_messages',
        'sandbox_appointments', 'sandbox_sales', 'sandbox_crm', 'sandbox_crm_services',
        'sandbox_crm_history', 'sandbox_campaigns', 'sandbox_notes', 'sandbox_api_logs',
        'sandbox_token_usage'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
        -- (SELECT get_owner_id()) e obrigatorio: sem o SELECT o Postgres roda por LINHA
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
            || 'USING (user_id = (SELECT public.get_owner_id())) '
            || 'WITH CHECK (user_id = (SELECT public.get_owner_id()))',
            t || '_owner_all', t
        );
    END LOOP;
END $$;

-- ── Sessao sob demanda ────────────────────────────────────────────────────────
-- Cria (ou devolve) a sessao da conta ja com o paciente ficticio e a conversa.
CREATE OR REPLACE FUNCTION public.sandbox_ensure_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner uuid := public.get_owner_id();
    v_session uuid;
    v_contact uuid;
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Sem conta resolvida: o usuario logado nao pertence a nenhum time.';
    END IF;

    SELECT id INTO v_session FROM sandbox_sessions WHERE user_id = v_owner;
    IF v_session IS NULL THEN
        INSERT INTO sandbox_sessions (user_id) VALUES (v_owner) RETURNING id INTO v_session;
    END IF;

    SELECT id INTO v_contact FROM sandbox_contacts WHERE session_id = v_session LIMIT 1;
    IF v_contact IS NULL THEN
        -- DDD 00 nao existe: o numero jamais colide com um contato real
        INSERT INTO sandbox_contacts (session_id, user_id, number)
        VALUES (v_session, v_owner, '5500' || lpad((floor(random() * 1e10))::bigint::text, 10, '0'))
        RETURNING id INTO v_contact;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sandbox_conversations WHERE session_id = v_session) THEN
        INSERT INTO sandbox_conversations (session_id, user_id, contact_id)
        VALUES (v_session, v_owner, v_contact);
    END IF;

    RETURN v_session;
END;
$$;

-- Zera o ambiente: apaga tudo em cascata e devolve uma sessao nova e limpa.
-- O paciente ficticio volta ao padrao (o cliente confirma antes de chamar).
CREATE OR REPLACE FUNCTION public.sandbox_reset()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner uuid := public.get_owner_id();
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Sem conta resolvida: o usuario logado nao pertence a nenhum time.';
    END IF;

    DELETE FROM sandbox_sessions WHERE user_id = v_owner;
    RETURN public.sandbox_ensure_session();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sandbox_ensure_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sandbox_reset() TO authenticated;
