-- Monitoramento de Grupos — ajustes (2026-08-24):
-- 1) campaigns.reply_buttons: botões de escolha enviados junto da mensagem de
--    abordagem (UAZAPI /send/menu type button). jsonb array de strings.
-- 2) campaigns.ia_function: função da IA no monitoramento — 'agendamento' ou
--    'qualificacao' (vai no payload bd_data.campaign para o n8n).

SET lock_timeout = '5s';

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS reply_buttons jsonb,
    ADD COLUMN IF NOT EXISTS ia_function text;

ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_ia_function_check;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_ia_function_check
    CHECK (ia_function IS NULL OR ia_function IN ('agendamento', 'qualificacao'));
