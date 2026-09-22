-- Rollback de 20260922263000_openai_sem_teto_de_gasto.sql
--
-- Devolve o teto de US$ 200 por conta e o default NOT NULL da plataforma.
-- ATENCAO: isto so mexe no BANCO. Para voltar o teto no PROJETO da OpenAI use a
-- acao `set_spend_limit` de admin-openai-account (ou o botao do Super Admin) em
-- cada conta — o banco sozinho nao reaplica nada na OpenAI.

update public.llm_platform_settings
set default_spend_limit_usd = 200,
    updated_at = now()
where id;

alter table public.llm_platform_settings
    alter column default_spend_limit_usd set default 200,
    alter column default_spend_limit_usd set not null;

update public.profiles
set openai_spend_limit_usd = 200,
    updated_at = now()
where openai_project_id is not null
  and openai_spend_limit_usd is null;
