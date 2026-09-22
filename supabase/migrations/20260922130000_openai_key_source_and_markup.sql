-- Etapa "projeto e chave OpenAI por conta", parte 1: colunas de vinculo com o
-- projeto OpenAI da conta, configuracao da plataforma e markup global 30%.
--
-- Hoje `profiles.openai_token` preenchido significa "cliente usa chave propria"
-- => billable = false, markup 0. A chave criada PELA PLATAFORMA vai morar no mesmo
-- campo e essas contas continuam billable (a fatura e nossa), logo a presenca do
-- token deixa de ser criterio: quem manda passa a ser `openai_key_source`.
--
-- NADA RETROATIVO: este arquivo nao provisiona projeto, nao chama a OpenAI e nao
-- toca em linha nenhuma de token_usage_log.
--
-- Dois pedacos sairam deste arquivo por decisao do user (22/09/2026):
--   * o `revoke select` das colunas secretas -> 20260922133000 (depende de deploy
--     do front primeiro, senao `select("*")` em profiles quebra);
--   * o `update ... openai_key_source = 'customer'` das 4 contas com token ->
--     20260922134000 (so depois que ele terminar a exclusao de clientes).

-- 1. Novas colunas de vinculo com o projeto OpenAI da conta -------------------
alter table public.profiles
  add column if not exists openai_key_source text,
  add column if not exists openai_project_id text,
  add column if not exists openai_service_account_id text,
  add column if not exists openai_api_key_id text,
  add column if not exists openai_spend_limit_usd numeric,
  add column if not exists openai_provisioned_at timestamptz,
  add column if not exists openai_provision_error text,
  add column if not exists openai_spend_alert_level numeric,
  add column if not exists openai_spend_alert_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_openai_key_source_chk'
  ) then
    alter table public.profiles
      add constraint profiles_openai_key_source_chk
      check (openai_key_source is null or openai_key_source in ('platform','customer'));
  end if;
end $$;

comment on column public.profiles.openai_key_source is
  'platform = chave criada pela Clinbia no projeto OpenAI da conta (billable, markup normal). customer = chave do proprio cliente (billable false, markup 0). null = conta na chave compartilhada da plataforma.';
comment on column public.profiles.openai_project_id is
  'id do projeto OpenAI da conta (proj_...). Chave de mapeamento com openai_project_usage_daily.';
comment on column public.profiles.openai_provision_error is
  'Ultima falha de provisionamento, para reprocessar pelo Super Admin.';
comment on column public.profiles.openai_spend_alert_level is
  'Ultimo patamar de alerta de gasto ja notificado (0.80, 1.00). Evita reenviar o mesmo aviso a cada sincronizacao; zerado na virada do mes.';

create unique index if not exists profiles_openai_project_id_uidx
  on public.profiles (openai_project_id)
  where openai_project_id is not null;

-- 2. Configuracao da plataforma (singleton) ----------------------------------
create table if not exists public.llm_platform_settings (
  id boolean primary key default true,
  default_markup numeric not null default 0.30,
  default_spend_limit_usd numeric not null default 200,
  provisioning_enabled boolean not null default false,
  spend_alert_threshold numeric not null default 0.80,
  spend_alert_email text,
  updated_at timestamptz not null default now(),
  constraint llm_platform_settings_singleton check (id)
);

alter table public.llm_platform_settings enable row level security;

comment on table public.llm_platform_settings is
  'Configuracao unica do custo de IA: markup padrao da plataforma, limite de gasto padrao do projeto OpenAI, patamar de alerta e chave geral que liga/desliga o provisionamento automatico. RLS sem policy = so service_role.';
comment on column public.llm_platform_settings.spend_alert_threshold is
  'Fracao do limite mensal do projeto que dispara o alerta (0.80 = 80%). Ao ATINGIR o limite a IA da clinica para de responder, por isso o aviso vem antes.';
comment on column public.llm_platform_settings.spend_alert_email is
  'Destinatario do alerta de gasto. NULL = cai no e-mail do super-admin.';

insert into public.llm_platform_settings (id) values (true)
on conflict (id) do nothing;

-- Conta ja existente com o singleton criado antes desta versao: garante os
-- valores decididos pelo user sem depender do default da coluna.
update public.llm_platform_settings
set default_markup = 0.30,
    default_spend_limit_usd = 200,
    spend_alert_threshold = 0.80,
    updated_at = now()
where id;

-- 3. Markup global 0.25 -> 0.30 ----------------------------------------------
-- profiles.markup (override por conta) fica como esta: null = usa o global.
update public.llm_model_prices set markup = 0.30, updated_at = now() where markup <> 0.30;
alter table public.llm_model_prices alter column markup set default 0.30;
