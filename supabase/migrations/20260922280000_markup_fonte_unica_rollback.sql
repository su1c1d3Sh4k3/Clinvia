-- Rollback de 20260922280000_markup_fonte_unica.sql
--
-- Recria `llm_model_prices.markup` com o valor que existia antes do drop (0.30
-- em todas as linhas, igual ao default da plataforma). Depois de rodar isto,
-- reverter TAMBEM o codigo das edge functions (api-token-usage e
-- api-token-usage-sandbox voltaram a nao selecionar a coluna) — a coluna sozinha
-- nao volta a ser usada.

alter table public.llm_model_prices add column if not exists markup numeric not null default 0.30;

update public.llm_model_prices set markup = 0.30 where markup is distinct from 0.30;
