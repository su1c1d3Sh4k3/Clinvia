-- Falha de envio da Meta: motivo gravado, reenvio do que e passageiro,
-- alerta so no que exige acao, e dois detectores que faltavam.
--
-- Contexto: 302 falhas em 7 dias com o painel verde (2026-09-24_mensagem_morre_depois_do_200.md).
-- O recibo assincrono da Meta chegava, virava `status='failed'` e o CODIGO era
-- jogado fora — ninguem sabia POR QUE a mensagem do paciente nao chegou.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Motivo da falha na propria mensagem
-- ---------------------------------------------------------------------------
alter table public.messages
    add column if not exists error_code  text,
    add column if not exists error_title text,
    add column if not exists retry_count integer not null default 0;

comment on column public.messages.error_code is
    'Codigo de erro do provedor (Meta) quando o envio falhou. Traduzido no inbox por src/lib/metaErrorCodes.ts.';
comment on column public.messages.retry_count is
    'Tentativas de reenvio automatico ja gastas (so codigos passageiros, teto 3).';

-- so as falhas interessam: indice parcial, nao pesa na tabela quente
create index if not exists idx_messages_error_code
    on public.messages (error_code, created_at desc)
    where error_code is not null;

-- ---------------------------------------------------------------------------
-- 2. Espelho do motivo no historico arquivado
--    Assinatura NOVA de 4 argumentos. A de 2 argumentos continua existindo
--    intacta (nenhuma remocao) — quem nao tem codigo segue chamando ela.
-- ---------------------------------------------------------------------------
create or replace function public.apply_archived_message_status(
    p_wamid       text,
    p_status      text,
    p_error_code  text,
    p_error_title text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_conversation_id uuid;
    v_new_rank integer;
    v_changed integer;
    v_extra jsonb;
begin
    if p_wamid is null or p_status is null then
        return false;
    end if;

    v_new_rank := public.message_status_rank(p_status);
    if v_new_rank = 0 then
        return false;
    end if;

    v_extra := jsonb_build_object('status', p_status);
    if p_error_code is not null then
        v_extra := v_extra || jsonb_build_object('error_code', p_error_code);
    end if;
    if p_error_title is not null then
        v_extra := v_extra || jsonb_build_object('error_title', p_error_title);
    end if;

    select c.id into v_conversation_id
    from public.conversations c
    where c.status = 'resolved'
      and c.resolved_at > now() - interval '15 minutes'
      and jsonb_typeof(c.messages_history) = 'array'
      and c.messages_history @> jsonb_build_array(jsonb_build_object('evolution_id', p_wamid))
    order by c.resolved_at desc
    limit 1;

    if v_conversation_id is null then
        return false;
    end if;

    update public.conversations c
    set messages_history = (
        select jsonb_agg(
            case
                when item->>'evolution_id' = p_wamid
                 and public.message_status_rank(item->>'status') < v_new_rank
                then item || v_extra
                else item
            end
            order by ord
        )
        from jsonb_array_elements(c.messages_history) with ordinality as t(item, ord)
    )
    where c.id = v_conversation_id
      -- recibo fora de ordem nao rebaixa o status nem reescreve o historico a toa
      and exists (
          select 1
          from jsonb_array_elements(c.messages_history) as item
          where item->>'evolution_id' = p_wamid
            and public.message_status_rank(item->>'status') < v_new_rank
      );

    get diagnostics v_changed = row_count;
    return v_changed > 0;
end;
$function$;

revoke all on function public.apply_archived_message_status(text, text, text, text)
    from public, anon, authenticated;
grant execute on function public.apply_archived_message_status(text, text, text, text)
    to service_role;

-- ---------------------------------------------------------------------------
-- 3. Fila de reenvio dos codigos passageiros (30s, 2min, 10min)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_send_retry (
    id               uuid primary key default gen_random_uuid(),
    message_id       uuid,
    wamid            text,
    conversation_id  uuid,
    owner_id         uuid,
    instance_id      uuid,
    error_code       text not null,
    payload          jsonb not null,
    attempt          integer not null default 0,
    status           text not null default 'pending'
                     check (status in ('pending', 'sending', 'done', 'exhausted', 'cancelled')),
    next_attempt_at  timestamptz not null default now(),
    last_error       text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.meta_send_retry is
    'Reenvio automatico de mensagem recusada pela Meta por motivo PASSAGEIRO. Bloqueio/regra nunca entra aqui.';

-- idempotencia: um wamid so entra na fila uma vez
create unique index if not exists uq_meta_send_retry_wamid
    on public.meta_send_retry (wamid)
    where wamid is not null;

create index if not exists idx_meta_send_retry_due
    on public.meta_send_retry (next_attempt_at)
    where status = 'pending';

alter table public.meta_send_retry enable row level security;
revoke all on table public.meta_send_retry from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Catalogo de componentes
--    Regra dele: alerta SO em defeito nosso e em conta inteira (+ pico diario).
--    Todo o resto fica no painel.
-- ---------------------------------------------------------------------------
update public.incident_component_catalog
   set somente_painel = true,
       descricao = 'Envio recusado pela Meta por regra, limite ou recusa do destinatario. Nao e defeito nosso: conta no resumo diario, nao acorda ninguem.',
       updated_at = now()
 where component in ('envio:bloqueado-', 'envio:rejeitado-');

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel, is_active)
values
    ('envio:defeito-', 'prefixo', 'servico',
     'A Meta recusou o envio por defeito NOSSO (payload, numero ou certificado). Precisa de conserto no codigo ou no cadastro.',
     'Abrir a mensagem pelo wamid do contexto, identificar o campo mal montado e corrigir na origem.',
     'alta', false, true),
    ('envio:conta-', 'prefixo', 'servico',
     'A conta de WhatsApp da clinica esta impedida de enviar (bloqueio ou pendencia de pagamento na Meta). Nenhuma mensagem sai.',
     'Entrar no Business Manager da conta, resolver a pendencia e conferir o envio de um teste.',
     'critica', false, true),
    ('envio:pico-diario', 'exato', 'detector',
     'O volume de falhas de envio do dia passou de 3x a media de 7 dias (piso de 10). Nao diz a causa: diz que algo mudou.',
     'Abrir os incidentes envio:* do dia e ver qual codigo cresceu.',
     'alta', false, true),
    ('recebimento:fila-parada', 'exato', 'detector',
     'Payload bruto de recebimento parado na webhook_queue ha mais de 10 minutos: o drenador nao esta dando conta ou parou.',
     'Conferir o cron webhook-queue-drain e a function webhook-queue-receiver; a mensagem do paciente esta represada.',
     'critica', false, true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();

-- ---------------------------------------------------------------------------
-- 5. Contagem do dia x media de 7 dias (linha do resumo diario)
--    Le messages E messages_history: ticket encerrado apaga de messages.
-- ---------------------------------------------------------------------------
create or replace function public.meta_send_failure_counts()
returns table (hoje bigint, media_7d numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
    with vivas as (
        select (m.created_at at time zone 'America/Sao_Paulo')::date as dia
          from public.messages m
         where m.status = 'failed'
           and m.created_at > now() - interval '8 days'
    ),
    arquivadas as (
        select ((item->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date as dia
          from public.conversations c
          cross join lateral jsonb_array_elements(c.messages_history) as item
         where c.resolved_at > now() - interval '8 days'
           and jsonb_typeof(c.messages_history) = 'array'
           and item->>'status' = 'failed'
           and (item->>'created_at') is not null
    ),
    todas as (select dia from vivas union all select dia from arquivadas),
    por_dia as (
        select dia, count(*) as qtd
          from todas
         where dia > (now() at time zone 'America/Sao_Paulo')::date - 8
         group by dia
    )
    select
        coalesce((select qtd from por_dia
                   where dia = (now() at time zone 'America/Sao_Paulo')::date), 0)::bigint,
        round(coalesce((select sum(qtd) from por_dia
                         where dia < (now() at time zone 'America/Sao_Paulo')::date), 0) / 7.0, 1)::numeric;
$function$;

revoke all on function public.meta_send_failure_counts() from public, anon, authenticated;
grant execute on function public.meta_send_failure_counts() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Detector de pico: volume do dia > 3x a media de 7 dias, piso de 10
-- ---------------------------------------------------------------------------
create or replace function public.meta_send_spike_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_hoje bigint;
    v_media numeric;
    v_res jsonb;
begin
    select hoje, media_7d into v_hoje, v_media from public.meta_send_failure_counts();

    -- piso de 10: abaixo disso nao ha pico que valha o telefone dele
    if v_hoje < 10 or v_media <= 0 or v_hoje < v_media * 3 then
        return jsonb_build_object('alerta', false, 'hoje', v_hoje, 'media_7d', v_media);
    end if;

    v_res := public.incident_record(jsonb_build_object(
        'source', 'db_job',
        'component', 'envio:pico-diario',
        'error_message', format(
            '%s mensagens falharam ao serem enviadas pela Meta hoje (media de 7 dias: %s). Volume acima de 3x o normal.',
            v_hoje, v_media),
        -- um unico incidente por dia, nao um por varredura
        'request_id', 'envio-pico:' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMMDD'),
        'context', jsonb_build_object('hoje', v_hoje, 'media_7d', v_media)
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
    end if;

    return jsonb_build_object('alerta', true, 'hoje', v_hoje, 'media_7d', v_media);
end;
$function$;

revoke all on function public.meta_send_spike_scan() from public, anon, authenticated;
grant execute on function public.meta_send_spike_scan() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Detector de payload bruto represado (> 10 min pendente = critico)
-- ---------------------------------------------------------------------------
create or replace function public.webhook_queue_stuck_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_qtd bigint;
    v_mais_antigo timestamptz;
    v_min integer;
    v_res jsonb;
begin
    select count(*), min(created_at)
      into v_qtd, v_mais_antigo
      from public.webhook_queue
     where status = 'pending'
       and created_at < now() - interval '10 minutes';

    if v_qtd = 0 then
        return jsonb_build_object('alerta', false, 'represados', 0);
    end if;

    v_min := greatest(1, (extract(epoch from (now() - v_mais_antigo)) / 60)::int);

    v_res := public.incident_record(jsonb_build_object(
        'source', 'db_job',
        'component', 'recebimento:fila-parada',
        'error_message', format(
            '%s payload(s) bruto(s) de recebimento parado(s) na fila; o mais antigo ha %s minuto(s). Mensagem de paciente represada na entrada.',
            v_qtd, v_min),
        -- reabre de hora em hora enquanto durar, em vez de um por varredura
        'request_id', 'fila-parada:' || to_char(now(), 'YYYYMMDDHH24'),
        'context', jsonb_build_object('represados', v_qtd, 'minutos_do_mais_antigo', v_min)
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'critica');
    end if;

    return jsonb_build_object('alerta', true, 'represados', v_qtd, 'minutos_do_mais_antigo', v_min);
end;
$function$;

revoke all on function public.webhook_queue_stuck_scan() from public, anon, authenticated;
grant execute on function public.webhook_queue_stuck_scan() to service_role;

-- ---------------------------------------------------------------------------
-- 8. billable vem da chave REALMENTE usada, nao do perfil
--    Reemissao conferida contra pg_get_functiondef da versao viva:
--    nada foi removido — so entrou o parametro novo com default.
-- ---------------------------------------------------------------------------
create or replace function public.track_token_usage(
    p_owner_id uuid,
    p_team_member_id uuid,
    p_function_name text,
    p_model text,
    p_prompt_tokens integer,
    p_completion_tokens integer,
    p_cost_usd numeric,
    p_billable boolean default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_total_tokens INT;
BEGIN
    v_total_tokens := p_prompt_tokens + p_completion_tokens;

    INSERT INTO token_usage_log (
        owner_id, team_member_id, function_name, model,
        prompt_tokens, completion_tokens, total_tokens, cost_usd, billable
    )
    VALUES (
        p_owner_id, p_team_member_id, p_function_name, p_model,
        p_prompt_tokens, p_completion_tokens, v_total_tokens, p_cost_usd,
        COALESCE(p_billable, true)
    );

    UPDATE profiles
       SET tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
           tokens_monthly = COALESCE(tokens_monthly, 0) + v_total_tokens,
           approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd,
           approximate_cost_monthly = COALESCE(approximate_cost_monthly, 0) + p_cost_usd
     WHERE id = p_owner_id;

    IF p_team_member_id IS NOT NULL THEN
        UPDATE team_members
           SET tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
               approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd
         WHERE id = p_team_member_id;
    END IF;
END;
$function$;

revoke all on function public.track_token_usage(uuid, uuid, text, text, integer, integer, numeric, boolean)
    from public, anon, authenticated;
grant execute on function public.track_token_usage(uuid, uuid, text, text, integer, integer, numeric, boolean)
    to service_role;

-- a assinatura antiga de 7 argumentos some: o default cobre todos os chamadores
-- (nenhum passava billable, e o default `true` mantem o comportamento de hoje)
drop function if exists public.track_token_usage(uuid, uuid, text, text, integer, integer, numeric);

-- ---------------------------------------------------------------------------
-- 9. Crons
-- ---------------------------------------------------------------------------
select cron.unschedule('meta-send-spike-scan')
 where exists (select 1 from cron.job where jobname = 'meta-send-spike-scan');
select cron.schedule('meta-send-spike-scan', '17 * * * *',
    $$select public.meta_send_spike_scan();$$);

select cron.unschedule('webhook-queue-stuck-scan')
 where exists (select 1 from cron.job where jobname = 'webhook-queue-stuck-scan');
select cron.schedule('webhook-queue-stuck-scan', '*/5 * * * *',
    $$select public.webhook_queue_stuck_scan();$$);

-- acorda o worker de reenvio so quando ha algo vencido na fila
create or replace function public.invoke_meta_send_retry_worker()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    if not exists (
        select 1 from public.meta_send_retry
        where status = 'pending' and next_attempt_at <= now()
        limit 1
    ) then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'meta-send-retry-worker',
        p_origem  := 'cron:meta-send-retry-worker',
        p_url     := v_url || '/functions/v1/meta-send-retry-worker',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb,
        p_timeout := 30000
    );
exception when others then
    raise warning 'invoke_meta_send_retry_worker: %', sqlerrm;
end;
$function$;

revoke all on function public.invoke_meta_send_retry_worker() from public, anon, authenticated;

select cron.unschedule('meta-send-retry-worker')
 where exists (select 1 from cron.job where jobname = 'meta-send-retry-worker');
select cron.schedule('meta-send-retry-worker', '* * * * *',
    $$select public.invoke_meta_send_retry_worker();$$);
