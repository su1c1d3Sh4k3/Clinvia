-- 20260922280000_markup_fonte_unica.sql
-- Rollback: 20260922280000_markup_fonte_unica_rollback.sql
--
-- DECISAO DO USER (22/09/2026): a precedencia da margem e
--   profiles.markup (por conta, quando preenchido)
--   -> llm_platform_settings.default_markup (0.30)
-- e `llm_model_prices.markup` e APAGADO para nao haver duas fontes da mesma
-- regra. Hoje as 8 linhas de preco tinham markup 0.30 (identico ao default da
-- plataforma), e so `Bruno Admin` tem markup por conta (0) -> nenhum valor de
-- cobranca muda com o drop.
--
-- Por que nao dava para deixar as duas: a margem por MODELO respondia uma
-- pergunta que o negocio nao faz ("quanto se cobra a mais no gpt-4o?") e
-- divergia em silencio do default da plataforma editado no painel. Quem lia
-- `llm_model_prices.markup` era so a edge fn api-token-usage(-sandbox).
--
-- DEPENDENCIAS CONFERIDAS (medido, nao presumido):
--   - nenhuma view usa a coluna (information_schema.view_column_usage vazio);
--   - nenhuma funcao do banco le `llm_model_prices.markup`. A unica funcao que
--     menciona a tabela e `admin_get_openai_account_usage`, e so num COMENTARIO
--     dizendo que ela nao entra mais na conta — o calculo dela ja usa
--     `coalesce(profiles.markup, llm_platform_settings.default_markup)`;
--   - front: zero referencias a `llm_model_prices` em src/ (types.ts e vazio,
--     nao ha painel de precos na UI).
--
-- Deploy obrigatorio junto: api-token-usage e api-token-usage-sandbox (leem a
-- coluna no `select`; com o drop aplicado antes do deploy a chamada do n8n
-- passa a falhar em `llm_model_prices_read_failed`).

alter table public.llm_model_prices drop column if exists markup;

comment on column public.llm_platform_settings.default_markup is
  'Margem padrao da plataforma sobre o custo do provedor. Fonte UNICA junto com profiles.markup (por conta). Precedencia: profiles.markup ?? default_markup. Nunca por modelo.';
