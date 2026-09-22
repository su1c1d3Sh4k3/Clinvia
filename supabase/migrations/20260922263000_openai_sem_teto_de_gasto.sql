-- Conta de cliente SEM teto de gasto na OpenAI.
--
-- Decisao do user em 22/09/2026, revertendo o teto de US$ 200 do plano: o gasto
-- de cada cliente nao e previsivel e o atendimento nao pode parar. O controle
-- deixa de ser corte e passa a ser alerta (consumo do dia contra a media de 7
-- dias da propria conta, mes contra a media dos 3 meses anteriores, projecao de
-- fechamento e queda de padrao), mais um alerta de saldo da organizacao.
--
-- Efeitos:
--   1. `llm_platform_settings.default_spend_limit_usd` deixa de ser NOT NULL,
--      perde o default 200 e passa a nulo => conta nova nasce sem teto;
--   2. as contas ja provisionadas ficam com `openai_spend_limit_usd` nulo.
--
-- IMPORTANTE: isto zera o teto no BANCO. A remocao do teto no PROJETO da OpenAI
-- e feita pela acao `clear_spend_limit` da edge function
-- provision-openai-project, projeto por projeto, com conferencia da resposta.
--
-- Rollback: 20260922263000_openai_sem_teto_de_gasto_rollback.sql

alter table public.llm_platform_settings
    alter column default_spend_limit_usd drop not null,
    alter column default_spend_limit_usd drop default;

update public.llm_platform_settings
set default_spend_limit_usd = null,
    updated_at = now()
where id;

-- Zera tambem o nivel de alerta ja gravado: o alerta antigo era fracao do teto
-- e sem teto ele nao tem mais significado.
update public.profiles
set openai_spend_limit_usd = null,
    openai_spend_alert_level = null,
    openai_spend_alert_sent_at = null,
    updated_at = now()
where openai_spend_limit_usd is not null
   or openai_spend_alert_level is not null;

comment on column public.llm_platform_settings.default_spend_limit_usd is
    'Teto de gasto mensal (US$) aplicado ao projeto de conta nova. NULO desde 22/09/2026 = sem teto; o controle e por alerta, nao por corte.';

comment on column public.profiles.openai_spend_limit_usd is
    'Teto de gasto mensal (US$) do projeto da conta na OpenAI. NULO = sem teto (padrao desde 22/09/2026). Preencher aqui volta a aplicar corte naquela conta.';
