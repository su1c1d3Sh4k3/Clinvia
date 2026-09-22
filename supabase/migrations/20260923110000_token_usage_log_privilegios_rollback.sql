-- Rollback de 20260923110000_token_usage_log_privilegios.sql
-- Devolve o estado exato medido em 22/09/2026 19:51 SP:
--   anon           -> INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN (sem SELECT)
--   authenticated  -> o mesmo + SELECT nas 22 colunas nao sensiveis
--
-- ATENCAO: isto devolve TRUNCATE para anon, que NAO passa por RLS. Só rodar se o revoke
-- tiver quebrado algo em producao, e nesse caso investigar o que quebrou antes de deixar assim.

revoke all on table public.token_usage_log from anon;
revoke all on table public.token_usage_log from authenticated;

grant insert, update, delete, truncate, references, trigger, maintain
  on public.token_usage_log to anon;

grant insert, update, delete, truncate, references, trigger, maintain
  on public.token_usage_log to authenticated;

grant select (
  id,
  owner_id,
  team_member_id,
  source,
  model,
  function_name,
  workflow_id,
  execution_id,
  usage_key,
  calls,
  billable,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cached_prompt_tokens,
  cached_tokens_source,
  tokens_estimated,
  price_fallback,
  cost_usd,
  cost_brl,
  exchange_rate,
  created_at
) on public.token_usage_log to authenticated;
