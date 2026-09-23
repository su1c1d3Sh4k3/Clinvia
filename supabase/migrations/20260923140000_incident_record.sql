-- public.incident_record — porta de entrada dos incidentes DA PLATAFORMA.
--
-- Irma da incident_ingest (que atende so o n8n). Mesma tecnica de agrupamento:
-- um `insert ... on conflict do update` numa transacao so, porque incidents tem
-- indice UNICO PARCIAL por fingerprint e erro de plataforma vem em rajada
-- (uma function quebrada erra em toda requisicao, nao uma vez).
--
-- TRES COISAS QUE ESTA FUNCAO FAZ E A incident_ingest NAO:
--
-- 1. IDEMPOTENCIA POR request_id. O watcher do banco (§3.3) le linha de
--    openai_alerts/openai_sync_runs a cada passada; sem isso a MESMA linha
--    viraria evento novo a cada 5 minutos e o event_count mentiria. Quando
--    p_request_id ja existe em incident_events, a funcao devolve
--    {skipped: true} e NAO grava nada.
--
-- 2. REGRA DO 42501 (§3.4 do plano). Violacao de RLS e quase sempre regressao
--    de correcao de seguranca, entao: error_name viedeterminado para
--    'rls_violation', severidade minima 'alta' e o fingerprint passa a ignorar
--    o TEXTO da mensagem, agrupando por component + tabela. Sem isso, cada
--    linha recusada abriria um incidente proprio e o painel viraria lixo.
--
-- 3. SEVERIDADE SEM SOBRESCREVER A IA. ai_severity so e preenchida quando
--    ainda esta nula: o catalogo (ou esta regra) da o palpite inicial, e a
--    analise por IA, que roda depois, tem a palavra final.
--
-- CONTRATO: recebe UM jsonb, devolve {incident_id, event_id, is_new, skipped}.
-- Chave desconhecida no payload e ignorada em silencio.

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

comment on function public.incident_record(jsonb) is
  'Porta de entrada dos incidentes da plataforma (edge function, cron, sync, front, provisionamento, integracao). Idempotente por request_id; aplica a regra do 42501. Chamada so por service_role.';

-- `create function` concede EXECUTE a PUBLIC e `revoke from anon` nao tira esse
-- grant — os dois comandos, nesta ordem, sao obrigatorios.
revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;
