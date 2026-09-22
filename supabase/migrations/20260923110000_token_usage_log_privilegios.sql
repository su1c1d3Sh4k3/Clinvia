-- token_usage_log: tira de anon/authenticated tudo que nao seja leitura das colunas nao sensiveis.
--
-- ESTADO MEDIDO ANTES (22/09/2026 19:51 SP, supabase/.temp/_tul_grants.sql):
--   - SELECT das 5 colunas sensiveis JA estava fechado pela migration 20260922270000:
--     has_column_privilege('authenticated', ..., 'SELECT') = false em provider_cost_usd,
--     markup_applied, cost_usd_original, cost_brl_original, cache_ratio_applied.
--     `authenticated` le 22 das 27 colunas; `anon` nao le nenhuma.
--   - O QUE AINDA ESTAVA ABERTO: anon e authenticated tinham INSERT, UPDATE, DELETE,
--     TRUNCATE, REFERENCES, TRIGGER e MAINTAIN na TABELA, e UPDATE nas 27 colunas —
--     inclusive nas 5 sensiveis (has_column_privilege(..., 'UPDATE') = true).
--
-- POR QUE IMPORTA, mesmo com RLS ligada:
--   - INSERT sem policy levanta 42501, e UPDATE/DELETE sem policy afetam 0 linhas.
--     Ou seja, a exposicao pratica por PostgREST era ~zero. Ate aqui, so grant errado.
--   - TRUNCATE, porem, NAO passa por RLS. A policy nao filtra nada: quem tem o privilegio
--     esvazia a tabela inteira. Nao ha verbo TRUNCATE no PostgREST, mas qualquer funcao
--     SECURITY INVOKER chamavel por anon/authenticated que rode TRUNCATE herda o privilegio.
--     Em uma tabela de faturamento, isso e perda de dado sem volta.
--
-- IMPACTO EM PRODUCAO: nenhum esperado.
--   - O front NUNCA le nem escreve a tabela direto (zero `.from("token_usage_log")` em src/);
--     tudo passa por 16 RPCs, todas SECURITY DEFINER com owner postgres, que ignoram grant
--     de tabela do chamador.
--   - As edge functions escrevem com service_role, que mantem todos os privilegios.
--   - O SELECT das 22 colunas para `authenticated` e PRESERVADO, entao nada que hoje leia
--     por PostgREST deixa de funcionar.
--
-- Rollback: 20260923110000_token_usage_log_privilegios_rollback.sql

-- 1. Zera. Precisa vir antes do grant: revoke de COLUNA e inerte enquanto o grant de
--    TABELA existe (o privilegio de tabela cobre todas as colunas).
revoke all on table public.token_usage_log from anon;
revoke all on table public.token_usage_log from authenticated;

-- 2. Devolve so a leitura, coluna a coluna, sem as 5 sensiveis.
--    Fora da lista de proposito: provider_cost_usd, markup_applied, cost_usd_original,
--    cost_brl_original, cache_ratio_applied — custo real do provedor e a margem.
--    Regra do user: o cliente ve custo x (1 + markup) e NUNCA o custo real nem a margem.
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

-- `anon` nao recebe nada: log de consumo nao tem leitor deslogado.

comment on table public.token_usage_log is
  'Log de consumo de IA. anon: sem privilegio nenhum. authenticated: SELECT apenas nas 22 colunas nao sensiveis (a RLS ainda restringe as linhas a owner_id = auth.uid() ou super admin). Custo real do provedor e margem (provider_cost_usd, markup_applied, cost_usd_original, cost_brl_original, cache_ratio_applied) so por RPC de super admin. Escrita so por service_role e pelas RPCs SECURITY DEFINER.';
