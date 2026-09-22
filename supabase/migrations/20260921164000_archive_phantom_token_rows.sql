-- Arquiva e remove as linhas fantasma de token_usage_log (function_name = 'external-n8n').
--
-- Ver 20260921163000_drop_phantom_token_trigger.sql: essas linhas foram criadas pelo
-- trigger trigger_log_token_updates, que espelhava cada incremento de profiles como uma
-- linha nova de consumo (custo em dobro, modelo mentido como gpt-4.1). O trigger ja foi
-- dropado; aqui o historico sai da tabela viva mas NAO e destruido - vai para
-- token_usage_log_phantom_archive, que preserva as 574 linhas (US$ 14,75, 07/01 a
-- 15/06/2026) cujo consumo existia SOMENTE no fantasma, do tempo em que o n8n atualizava
-- profiles direto.
--
-- O movimento e uma unica instrucao (DELETE ... RETURNING alimentando o INSERT), logo e
-- atomico: nao existe janela em que a linha esteja fora das duas tabelas.
-- Sem policy de RLS = apenas service_role/postgres leem, igual llm_cache_calibration.

create table if not exists public.token_usage_log_phantom_archive
  (like public.token_usage_log including defaults);

alter table public.token_usage_log_phantom_archive
  add column if not exists archived_at timestamptz not null default now();

alter table public.token_usage_log_phantom_archive enable row level security;

comment on table public.token_usage_log_phantom_archive is
  'Linhas function_name=''external-n8n'' criadas pelo trigger fantasma trigger_log_token_updates (dropado em 20260921163000). Mantidas apenas como historico - NUNCA agregar junto com token_usage_log.';

create index if not exists token_usage_log_phantom_archive_owner_created_idx
  on public.token_usage_log_phantom_archive (owner_id, created_at desc);

with moved as (
  delete from public.token_usage_log
  where function_name = 'external-n8n'
  returning *
)
insert into public.token_usage_log_phantom_archive
select m.*, now() from moved m;
