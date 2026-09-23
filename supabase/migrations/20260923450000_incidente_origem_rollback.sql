-- Rollback de 20260923450000 (origem do incidente).
--
-- Volta `incident_record` ao corpo de 20260923140000 e `clinvia_http_post` ao de
-- 20260923200000 (sem o header x-origin), e tira as restricoes, o indice, o
-- rotulo e as colunas.
--
-- RODAR DEPOIS de 20260923460000_incidente_origem_inferencia_rollback.sql: a
-- inferencia depende das colunas que este arquivo derruba.
--
-- Gerado por supabase/.temp/_gen_origem_rb.py a partir do texto das migrations.

-- 1. incident_record volta ao corpo anterior a origem
create or replace function public.incident_record(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_source      text := nullif(trim(coalesce(p_payload ->> 'source', '')), '');
    v_component   text := nullif(trim(coalesce(p_payload ->> 'component', '')), '');
    v_route       text := nullif(trim(coalesce(p_payload ->> 'route', '')), '');
    v_request_id  text := nullif(trim(coalesce(p_payload ->> 'request_id', '')), '');
    v_error_name  text := nullif(trim(coalesce(p_payload ->> 'error_name', '')), '');
    v_msg         text;
    v_desc        text;
    v_stack       text;
    v_context     jsonb;
    v_owner_id    uuid;
    v_http        integer;
    v_started_at  timestamptz;
    v_locator     text;
    v_fingerprint text;
    v_is_rls      boolean := false;
    v_sev         text;
    v_causa       text;
    v_acao        text;
    v_incident_id uuid;
    v_event_id    uuid;
    v_is_new      boolean := false;
begin
    -- Estas duas sao as unicas obrigatorias: sem component nao ha o que agrupar.
    if v_source not in ('edge_function', 'db_job', 'sync', 'frontend', 'provisioning', 'integration') then
        raise exception 'source invalido: %', coalesce(v_source, '(nulo)') using errcode = '22023';
    end if;
    if v_component is null then
        raise exception 'component obrigatorio' using errcode = '22023';
    end if;

    -- Idempotencia: a mesma linha de origem nunca vira dois eventos.
    if v_request_id is not null and exists (
        select 1 from public.incident_events e where e.request_id = v_request_id
    ) then
        return jsonb_build_object('skipped', true, 'reason', 'request_id_ja_registrado');
    end if;

    -- Sanitiza DE NOVO aqui: quem chama pode ser reescrito e esquecer.
    -- nullif porque sanitize_incident_text devolve '' para entrada nula, e ''
    -- num campo de texto de erro polui a tela tanto quanto lixo.
    v_msg   := nullif(public.sanitize_incident_text(p_payload ->> 'error_message'), '');
    v_desc  := nullif(public.sanitize_incident_text(p_payload ->> 'error_description'), '');
    v_stack := nullif(public.sanitize_incident_text(p_payload ->> 'error_stack'), '');

    -- context e NOT NULL default '{}' em incident_events: coalesce obrigatorio.
    v_context := coalesce(
        case
            when jsonb_typeof(p_payload -> 'context') = 'object'
            then public.sanitize_incident_text((p_payload -> 'context')::text)::jsonb
        end,
        '{}'::jsonb
    );

    begin
        v_owner_id := nullif(p_payload ->> 'owner_id', '')::uuid;
    exception when others then
        v_owner_id := null;  -- id podre nao derruba a ingestao
    end;

    begin
        v_started_at := (p_payload ->> 'started_at')::timestamptz;
    exception when others then
        v_started_at := null;
    end;

    v_http := case when jsonb_typeof(p_payload -> 'http_code') = 'number'
                   then (p_payload ->> 'http_code')::integer end;

    -- ── regra do 42501 (§3.4) ──────────────────────────────────────────────
    v_is_rls := coalesce(v_msg, '') ~ '42501'
             or coalesce(v_msg, '') ilike '%violates row-level security%'
             or coalesce(v_desc, '') ilike '%violates row-level security%';

    if v_is_rls then
        v_error_name := 'rls_violation';
        -- locator = tabela, extraida do `for table "x"` do Postgres. O texto da
        -- linha recusada fica FORA do fingerprint de proposito.
        v_locator := 'rls:' || coalesce(
            substring(coalesce(v_msg, '') || ' ' || coalesce(v_desc, '') from 'for table "([^"]+)"'),
            'tabela_desconhecida'
        );
        v_sev := 'alta';
    else
        -- Fora do RLS o que separa dois erros da mesma function e a rota/acao.
        v_locator := coalesce(v_route, '');
    end if;

    v_fingerprint := public.incident_fingerprint(
        v_source,
        v_component,
        v_locator,
        case when v_is_rls then '' else v_msg end
    );

    -- Catalogo: erro conhecido ja entra com severidade sugerida.
    -- Variaveis escalares, e nao um `record`: no caminho do RLS a severidade ja
    -- veio decidida e este select nao roda — um record nao atribuido explode com
    -- 55000 ao ser lido logo abaixo.
    if v_sev is null then
        select c.severidade_sugerida, c.causa, c.acao
          into v_sev, v_causa, v_acao
        from public.incident_catalog c
        where c.is_active
          and (c.source is null or c.source = v_source)
          and (
            (c.match_type = 'substring' and coalesce(v_msg, '') ilike '%' || c.pattern || '%')
            or (c.match_type = 'regex' and coalesce(v_msg, '') ~* c.pattern)
          )
        limit 1;
    end if;

    insert into public.incidents (
        fingerprint, source, component, owner_id, event_count, first_seen, last_seen,
        affected_tenants, ai_severity, ai_probable_cause, ai_fix_system
    )
    values (
        v_fingerprint, v_source, v_component, v_owner_id, 1, now(), now(),
        case when v_owner_id is null then '{}'::uuid[] else array[v_owner_id] end,
        v_sev, v_causa, v_acao
    )
    on conflict (fingerprint) where status <> 'resolved'
    do update set
        event_count = public.incidents.event_count + 1,
        last_seen   = now(),
        affected_tenants = case
            when excluded.owner_id is null
                or public.incidents.affected_tenants @> array[excluded.owner_id]
            then public.incidents.affected_tenants
            else public.incidents.affected_tenants || excluded.owner_id
        end,
        owner_id = coalesce(public.incidents.owner_id, excluded.owner_id),
        -- palpite inicial nunca sobrescreve a analise da IA
        ai_severity = coalesce(public.incidents.ai_severity, excluded.ai_severity),
        updated_at = now()
    returning id, (event_count = 1) into v_incident_id, v_is_new;

    insert into public.incident_events (
        started_at, source, component, failed_node, error_name, error_message,
        error_description, error_stack, http_code, request_id, owner_id, context,
        incident_id
    )
    values (
        v_started_at, v_source, v_component, nullif(v_route, ''), v_error_name, v_msg,
        v_desc, v_stack, v_http, v_request_id, v_owner_id, v_context,
        v_incident_id
    )
    returning id into v_event_id;

    return jsonb_build_object(
        'incident_id', v_incident_id,
        'event_id', v_event_id,
        'is_new', v_is_new,
        'skipped', false,
        'fingerprint', v_fingerprint,
        'severidade', v_sev
    );
end;
$$;

revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;

-- 2. clinvia_http_post para de declarar x-origin
create or replace function public.clinvia_http_post(
    p_alvo    text,
    p_origem  text,
    p_url     text,
    p_headers jsonb,
    p_body    jsonb default '{}'::jsonb,
    p_timeout integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_id bigint;
begin
    select net.http_post(
        url             := p_url,
        headers         := p_headers,
        body            := coalesce(p_body, '{}'::jsonb),
        timeout_milliseconds := p_timeout
    ) into v_id;

    begin
        insert into public.cron_http_calls (request_id, alvo, origem)
        values (v_id, p_alvo, p_origem)
        on conflict (request_id) do nothing;
    exception when others then
        raise warning '[clinvia_http_post] nao registrou % (%): %', v_id, p_alvo, sqlerrm;
    end;

    return v_id;
end;
$$;

revoke all on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer)
    from public, anon, authenticated;
grant execute on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer)
    to service_role;

-- 3. rotulo humano
drop function if exists public.incident_origem_rotulo(text, boolean);

-- 4. indice e restricoes
drop index if exists public.idx_incident_events_origem_recebido;
alter table public.incident_events drop constraint if exists incident_events_origem_chk;
alter table public.incidents      drop constraint if exists incidents_origem_chk;

-- 5. as colunas. Ficam por ultimo e de proposito: se o rollback for parcial, e
--    melhor sobrar coluna sem uso do que faltar coluna que alguem ainda escreve.
alter table public.incident_events
    drop column if exists origem,
    drop column if exists origem_inferida;
alter table public.incidents
    drop column if exists origem,
    drop column if exists origem_inferida;
