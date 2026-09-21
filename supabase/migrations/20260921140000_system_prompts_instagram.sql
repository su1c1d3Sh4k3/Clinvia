-- Quarto slot da pagina System Prompt: o fluxo do n8n que atende as conversas
-- vindas do Instagram Direct (contato sem telefone, link de agendamento com
-- identificacao) precisa de instrucoes proprias.

ALTER TABLE public.system_prompts
    ADD COLUMN IF NOT EXISTS instagram_prompt text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.system_prompts.instagram_prompt IS
    'Prompt do fluxo que atende as conversas de Instagram Direct. Lido pelo n8n em prompts.instagram (edge fn get-system-prompt).';
