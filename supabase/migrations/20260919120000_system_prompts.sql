-- System Prompts da plataforma: os textos que os fluxos do n8n usam.
-- Linha unica (singleton) porque os prompts sao da PLATAFORMA, nao de um tenant:
-- editar aqui no painel admin muda todos os fluxos de uma vez.

CREATE TABLE IF NOT EXISTS public.system_prompts (
    id boolean PRIMARY KEY DEFAULT true,
    base_prompt text NOT NULL DEFAULT '',
    qualificacao_prompt text NOT NULL DEFAULT '',
    agendamento_prompt text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    CONSTRAINT system_prompts_singleton CHECK (id)
);

INSERT INTO public.system_prompts (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

-- Leitura no painel: quem tem a pagina liberada. O n8n NAO le por aqui — le pela
-- edge fn get-system-prompt, que usa service role e valida x-api-key.
DROP POLICY IF EXISTS "system_prompts_read_admin" ON public.system_prompts;
CREATE POLICY "system_prompts_read_admin" ON public.system_prompts
    FOR SELECT TO authenticated
    USING (public.admin_can('system-prompt', 'view'));

DROP POLICY IF EXISTS "system_prompts_update_admin" ON public.system_prompts;
CREATE POLICY "system_prompts_update_admin" ON public.system_prompts
    FOR UPDATE TO authenticated
    USING (public.admin_can('system-prompt', 'edit'))
    WITH CHECK (public.admin_can('system-prompt', 'edit'));
