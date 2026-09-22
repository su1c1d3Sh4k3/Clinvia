-- Monitoramento de incidentes (n8n + plataforma) — modelo de dados.
-- Plano: docs/security/PLANO_MONITORAMENTO_INCIDENTES.md
-- NAO APLICAR sem o OK do user. Rollback: 20260923100000_incidentes_monitoramento_rollback.sql
--
-- Escopo desta migration: tabelas, fingerprint, sanitizacao, catalogo semeado e destinatario
-- semeado. As RPCs de leitura do painel ficam em migration separada (dependem do nome da aba).

-- ============================================================
-- 1. Sanitizacao (gemea de supabase/functions/_shared/sanitize-incident.ts)
-- ============================================================

create or replace function public.sanitize_incident_text(p_text text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v text := coalesce(p_text, '');
begin
  if v = '' then
    return v;
  end if;

  -- segredos primeiro (antes de qualquer normalizacao que possa quebrar o padrao)
  -- Limiar baixo (8) de proposito: a chave real tem ~150 chars, mas exigir 16 deixava
  -- passar recorte/truncamento de chave, que ja e vazamento. Mascarar demais nao custa.
  v := regexp_replace(v, 'sk-[A-Za-z0-9_-]{8,}', '<openai_key>', 'gi');
  v := regexp_replace(v, 'sbp_[A-Za-z0-9]{8,}', '<supabase_token>', 'gi');
  v := regexp_replace(v, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+', '<jwt>', 'g');
  v := regexp_replace(v, 'EAA[A-Za-z0-9]{20,}', '<meta_token>', 'g');
  v := regexp_replace(v, '(bearer)\s+\S+', '\1 <token>', 'gi');
  v := regexp_replace(
         v,
         '("?(?:api[_-]?key|apikey|token|password|senha|secret|authorization|x-api-key)"?\s*[:=]\s*"?)[^",;\s}]+',
         '\1<redacted>',
         'gi');

  -- dados pessoais
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g');
  -- O lookaround exclui hex e '-' de proposito: sem isso o ultimo bloco de um UUID
  -- (12 digitos) era mascarado como telefone e o id ficava ilegivel no painel.
  v := regexp_replace(v, '(?<![0-9a-fA-F-])[0-9]{10,15}(?![0-9a-fA-F-])', '<phone>', 'g');

  return left(v, 1000);
end;
$$;

comment on function public.sanitize_incident_text(text) is
  'Mascara segredos e dados pessoais em texto de incidente. Gemea de _shared/sanitize-incident.ts.';

revoke all on function public.sanitize_incident_text(text) from public, anon, authenticated;
grant execute on function public.sanitize_incident_text(text) to service_role;

-- ============================================================
-- 2. Normalizacao para o fingerprint
-- ============================================================

create or replace function public.incident_normalize_message(p_text text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v text := coalesce(p_text, '');
begin
  v := regexp_replace(v, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<uuid>', 'gi');
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g');
  v := regexp_replace(v, '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})?', '<date>', 'gi');
  v := regexp_replace(v, '[0-9]{4}-[0-9]{2}-[0-9]{2}', '<date>', 'g');
  v := regexp_replace(v, '[0-9]{2}/[0-9]{2}/[0-9]{4}', '<date>', 'g');
  v := regexp_replace(v, '(/[A-Za-z0-9_.-]+){2,}', '<path>', 'g');
  v := regexp_replace(v, '(?<![0-9a-z])[0-9a-f]{8,}(?![0-9a-z])', '<hex>', 'gi');
  v := regexp_replace(v, '[0-9]+', '<n>', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  return lower(btrim(left(v, 500)));
end;
$$;

comment on function public.incident_normalize_message(text) is
  'Troca uuid/email/data/caminho/hex/numero por placeholder para que o mesmo erro com dados diferentes gere um fingerprint unico.';

revoke all on function public.incident_normalize_message(text) from public, anon, authenticated;
grant execute on function public.incident_normalize_message(text) to service_role;

create or replace function public.incident_fingerprint(
  p_source text,
  p_component text,
  p_locator text,
  p_message text
)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select md5(
    coalesce(p_source, '') || '|' ||
    coalesce(p_component, '') || '|' ||
    coalesce(p_locator, '') || '|' ||
    -- sanitiza antes de normalizar: garante que nenhum segredo entra no calculo
    -- mesmo se o chamador esquecer de sanitizar na entrada.
    public.incident_normalize_message(public.sanitize_incident_text(p_message))
  );
$$;

comment on function public.incident_fingerprint(text, text, text, text) is
  'source + component + no/rota + mensagem sanitizada e normalizada. p_locator = failed_node no n8n, rota na plataforma.';

revoke all on function public.incident_fingerprint(text, text, text, text) from public, anon, authenticated;
grant execute on function public.incident_fingerprint(text, text, text, text) to service_role;

-- ============================================================
-- 3. incidents — o agrupamento
-- ============================================================

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  source text not null check (source in (
    'n8n_error','n8n_silent','edge_function','db_job','sync','frontend','provisioning','integration'
  )),
  component text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  event_count integer not null default 0,
  affected_tenants uuid[] not null default '{}',
  owner_id uuid references public.profiles(id) on delete set null,

  ai_summary text,
  ai_probable_cause text,
  ai_origin text,
  ai_severity text check (ai_severity in ('critica','alta','media','baixa')),
  ai_impact text,
  ai_fix_n8n text,
  ai_fix_system text,
  ai_confidence numeric(3,2) check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  ai_model text,
  analyzed_at timestamptz,

  last_notified_at timestamptz,
  notified_count integer not null default 0,
  notified_at_event_count integer not null default 0,

  resolved_at timestamptz,
  resolved_by uuid,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.incidents is
  'Um incidente = um fingerprint aberto. Reabrir um resolvido cria linha nova (mede recaida).';
comment on column public.incidents.notified_at_event_count is
  'event_count no momento do ultimo aviso. Base da regra "ou a cada 20 ocorrencias".';

-- unicidade so enquanto aberto (mesma tecnica do card ativo unico de crm_client)
create unique index if not exists incidents_fingerprint_aberto_uniq
  on public.incidents (fingerprint)
  where status <> 'resolved';

create index if not exists incidents_status_severity_idx
  on public.incidents (status, ai_severity, last_seen desc);
create index if not exists incidents_component_idx on public.incidents (component, last_seen desc);
create index if not exists incidents_owner_idx on public.incidents (owner_id) where owner_id is not null;
create index if not exists incidents_pendente_analise_idx
  on public.incidents (created_at) where analyzed_at is null;

alter table public.incidents enable row level security;

drop policy if exists "incidents service_role" on public.incidents;
create policy "incidents service_role" on public.incidents
  for all to service_role using (true) with check (true);
-- sem policy para anon/authenticated: leitura do painel so via RPC SECURITY DEFINER.

-- ============================================================
-- 4. incident_events — o evento cru, ja sanitizado
-- ============================================================

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  started_at timestamptz,
  source text not null check (source in (
    'n8n_error','n8n_silent','edge_function','db_job','sync','frontend','provisioning','integration'
  )),
  component text not null,
  environment text not null default 'production',

  workflow_id text,
  workflow_name text,
  execution_id text,
  execution_url text,
  failed_node text,
  failed_node_type text,

  error_name text,
  error_message text,
  error_description text,
  error_stack text,
  http_code integer,
  request_id text,

  owner_id uuid references public.profiles(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  incident_id uuid references public.incidents(id) on delete cascade
);

comment on table public.incident_events is
  'Evento cru. Todo texto entra por sanitize_incident_text; context passa por allowlist de chaves no servidor.';

create index if not exists incident_events_incident_idx
  on public.incident_events (incident_id, received_at desc);
create index if not exists incident_events_received_idx on public.incident_events (received_at desc);
create index if not exists incident_events_workflow_idx
  on public.incident_events (workflow_id) where workflow_id is not null;

alter table public.incident_events enable row level security;

drop policy if exists "incident_events service_role" on public.incident_events;
create policy "incident_events service_role" on public.incident_events
  for all to service_role using (true) with check (true);

-- ============================================================
-- 5. incident_catalog — erros conhecidos (o user estende)
-- ============================================================

create table if not exists public.incident_catalog (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  match_type text not null default 'substring' check (match_type in ('substring','regex')),
  source text check (source in (
    'n8n_error','n8n_silent','edge_function','db_job','sync','frontend','provisioning','integration'
  )),
  component text,
  causa text not null,
  acao text not null,
  severidade_sugerida text not null check (severidade_sugerida in ('critica','alta','media','baixa')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.incident_catalog is
  'Catalogo de erros conhecidos. A severidade daqui VENCE a da IA quando ha match.';

create index if not exists incident_catalog_ativo_idx on public.incident_catalog (is_active, source);
-- Sem este unico o `on conflict do nothing` do seed abaixo nao tem em que se ancorar:
-- rodar a migration duas vezes duplicaria as 14 linhas.
create unique index if not exists incident_catalog_pattern_uniq
  on public.incident_catalog (pattern);

alter table public.incident_catalog enable row level security;

drop policy if exists "incident_catalog service_role" on public.incident_catalog;
create policy "incident_catalog service_role" on public.incident_catalog
  for all to service_role using (true) with check (true);

insert into public.incident_catalog (pattern, match_type, source, causa, acao, severidade_sugerida)
values
  ('insufficient_quota', 'substring', null,
   'Projeto/organizacao OpenAI sem credito.',
   'Conferir saldo da organizacao no painel da OpenAI. A IA da conta afetada para de responder.',
   'critica'),
  ('rate_limit_exceeded', 'substring', null,
   'Limite de requisicoes do provedor estourado (429).',
   'Conferir tier do projeto e concorrencia. Normalmente passa sozinho; se repetir, subir o limite.',
   'alta'),
  ('invalid_api_key', 'substring', null,
   'Chave do provedor invalida ou revogada (401).',
   'Recolar a chave no card de OpenAI do super admin e conferir a credencial no n8n.',
   'critica'),
  ('openai_admin_key_rejected', 'substring', null,
   'Admin key da OpenAI rejeitada — provisionamento e sync de uso param.',
   'Trocar a admin key nos secrets do Supabase e redeployar sync-openai-usage.',
   'critica'),
  ('openai_rate_limited', 'substring', null,
   'API administrativa da OpenAI limitando (429).',
   'Reduzir a frequencia do sync. Alerta informativo, nao corta nada.',
   'media'),
  ('instance_disconnected', 'substring', null,
   'Instancia de WhatsApp desconectada — cliente sem atendimento.',
   'Reconectar em /whatsapp-connection. Se for Meta, conferir validade do token.',
   'critica'),
  ('ECONNREFUSED', 'substring', null,
   'Falha de conexao com servico interno (Redis/Postgres/pg_net).',
   'Conferir saude do projeto Supabase e do host do n8n.',
   'alta'),
  ('timeout', 'substring', null,
   'Tempo esgotado chamando servico externo.',
   'Se isolado, ignorar. Se repetitivo no mesmo componente, investigar a integracao.',
   'media'),
  ('Cannot read properties of undefined', 'substring', 'n8n_error',
   'Expressao do n8n lendo campo que nao veio no payload do no anterior.',
   'Abrir a execucao no link do incidente e conferir a saida do no anterior ao que falhou.',
   'alta'),
  ('Unexpected token', 'substring', null,
   'JSON invalido — corpo malformado ou resposta HTML onde se esperava JSON.',
   'Conferir o corpo enviado e o content-type da resposta do endpoint chamado.',
   'alta'),
  ('violates row-level security', 'substring', null,
   'RLS bloqueando escrita em producao. Quase sempre regressao de correcao de seguranca.',
   'Identificar a migration de seguranca mais recente que tocou a tabela e usar o _rollback.sql.',
   'alta'),
  ('42501', 'substring', null,
   'Permissao insuficiente no Postgres (grant ou policy).',
   'Conferir grant de tabela/coluna e policy do papel usado. Revoke de coluna e inerte com grant de tabela vivo.',
   'alta'),
  ('decrypt', 'substring', null,
   'Falha ao decifrar token armazenado.',
   'Conferir a chave de criptografia nos secrets; token precisa ser regravado.',
   'critica'),
  ('template', 'substring', 'integration',
   'Template da Meta nao aprovado ou rejeitado — confirmacao de agenda e campanha param em silencio.',
   'Conferir status em /whatsapp-connection > Templates e reenviar para aprovacao.',
   'alta')
on conflict (pattern) do nothing;

-- ============================================================
-- 6. alert_recipients — nenhum numero no codigo
-- ============================================================

create table if not exists public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  instance_id uuid not null references public.instances(id) on delete restrict,
  min_severity text not null default 'baixa' check (min_severity in ('critica','alta','media','baixa')),
  is_active boolean not null default true,
  window_start time not null default '00:00',
  window_end time not null default '23:59',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_recipients_telefone_uniq unique (telefone, instance_id)
);

comment on table public.alert_recipients is
  'Destinatarios do alerta. instance_id = instancia Meta REMETENTE (fala direto com o Graph, sem criar contato/conversa).';
comment on column public.alert_recipients.min_severity is
  'Gravidade minima que este destinatario recebe. baixa = recebe tudo.';

alter table public.alert_recipients enable row level security;

drop policy if exists "alert_recipients service_role" on public.alert_recipients;
create policy "alert_recipients service_role" on public.alert_recipients
  for all to service_role using (true) with check (true);

-- semente: Bruno, pela WABA 497613820103663 (instancia meta-488512407686498)
insert into public.alert_recipients (nome, telefone, instance_id, min_severity)
select 'Bruno', '5537920001025', i.id, 'baixa'
from public.instances i
where i.meta_waba_id = '497613820103663'
  and i.provider = 'meta'
limit 1
on conflict (telefone, instance_id) do nothing;

-- ============================================================
-- 7. incident_notifications — prova de entrega e base do rate limit
-- ============================================================

create table if not exists public.incident_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  recipient_id uuid not null references public.alert_recipients(id) on delete cascade,
  kind text not null check (kind in ('individual','resumo','recorrencia')),
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent','failed','skipped_window','skipped_ratelimit')),
  template_name text,
  wamid text,
  error_code text,
  error_message text
);

comment on table public.incident_notifications is
  'Um registro por tentativa de envio. status=sent na ultima hora e o que alimenta o rate limit.';

create index if not exists incident_notifications_rate_idx
  on public.incident_notifications (recipient_id, sent_at desc) where status = 'sent';
create index if not exists incident_notifications_incident_idx
  on public.incident_notifications (incident_id, sent_at desc);

alter table public.incident_notifications enable row level security;

drop policy if exists "incident_notifications service_role" on public.incident_notifications;
create policy "incident_notifications service_role" on public.incident_notifications
  for all to service_role using (true) with check (true);

-- ============================================================
-- 8. Chaves de desligar (mesma tabela dos alertas de custo)
-- ============================================================

-- llm_platform_settings e tabela SINGLETON com colunas (nao key/value).
alter table public.llm_platform_settings
    add column if not exists alert_notify_enabled boolean not null default true,
    add column if not exists alert_summary_enabled boolean not null default true,
    add column if not exists alert_max_per_hour integer not null default 10,
    add column if not exists alert_analyze_enabled boolean not null default true,
    add column if not exists alert_analyze_model text not null default 'gpt-4.1-mini';

comment on column public.llm_platform_settings.alert_notify_enabled is
    'Liga o envio de alerta por WhatsApp. Desligar NUNCA desliga a gravacao do incidente nem o painel.';
comment on column public.llm_platform_settings.alert_summary_enabled is
    'Liga o resumo agrupado de media/baixa a cada 2h. Sem incidente na janela, nada e enviado.';
comment on column public.llm_platform_settings.alert_max_per_hour is
    'Teto de mensagens enviadas por hora por destinatario. Excedente vira skipped_ratelimit + uma mensagem de resumo.';
comment on column public.llm_platform_settings.alert_analyze_model is
    'Modelo da analise de incidente. Custo vai para token_usage_log como consumo interno da plataforma, nunca rateado para cliente.';

-- ============================================================
-- 9. Privilegios: tabela nova NAO entra no GRANT ALL padrao
-- ============================================================
--
-- Medido em 22/09/2026: 134 das 139 tabelas do schema public concedem TRUNCATE a
-- anon e a authenticated — e o default do Supabase, nao um erro pontual. TRUNCATE
-- NAO passa por RLS, entao "RLS on sem policy" nao protege contra ele. Estas cinco
-- tabelas nascem sem privilegio nenhum para os dois papeis: o painel do Super Admin
-- le por RPC SECURITY DEFINER e a escrita e toda por service_role.
revoke all on table public.incidents from anon, authenticated;
revoke all on table public.incident_events from anon, authenticated;
revoke all on table public.incident_catalog from anon, authenticated;
revoke all on table public.alert_recipients from anon, authenticated;
revoke all on table public.incident_notifications from anon, authenticated;
