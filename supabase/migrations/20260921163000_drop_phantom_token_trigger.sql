-- Remove o trigger fantasma de tokens em profiles.
--
-- trigger_log_token_updates (AFTER UPDATE OF tokens_monthly, approximate_cost_monthly)
-- chamava log_token_updates(), que INSERIA uma linha nova em token_usage_log com
-- function_name='external-n8n', model='gpt-4.1' e prompt/completion = delta/2.
-- Como todo caminho vivo (increment_profile_token_usage via api-token-usage e
-- track_token_usage via _shared/token-tracker.ts) JA grava a sua propria linha no log
-- antes de somar o acumulador, o trigger apenas duplicava o custo: somar cost_usd do
-- log dava 2x o real, com o modelo mentido como gpt-4.1.
--
-- Auditoria previa (21/09/2026): das 45.296 linhas 'external-n8n', so 574 (US$ 14,75,
-- 07/01 a 15/06/2026) nao tinham linha real correspondente - resquicio do fluxo legado
-- em que o n8n atualizava profiles direto. Nenhuma orfa depois de 15/06/2026.
-- Essas linhas sao preservadas em token_usage_log_phantom_archive (migration seguinte).
--
-- Efeito colateral que deixa de existir: UPDATE em massa em profiles nao gera mais
-- dezenas de milhares de linhas fantasma, entao o recalculo dos acumuladores pode rodar
-- sem 'alter table profiles disable trigger'.

drop trigger if exists trigger_log_token_updates on public.profiles;
drop function if exists public.log_token_updates() cascade;
