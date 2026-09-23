-- Rollback de 20260923460000 (inferencia da origem).
--
-- Volta `incident_record` ao corpo de 20260923450000 (declara a origem, mas nao
-- infere nada) e desfaz o backfill. Depois disto a origem so existe para quem
-- mandar `x-origin` — ou seja, praticamente ninguem, e o painel volta a mostrar
-- ~86% de nao_identificada. Isso e o estado anterior, nao um defeito novo.
--
-- Gerado por supabase/.temp/_gen_origem_rb.py a partir do texto da propria
-- migration: rollback redigitado de memoria e rollback que falha no dia.

-- 1. desfaz o backfill (so o que era palpite; declaracao nunca foi tocada aqui)
update public.incident_events set origem = null, origem_inferida = false
 where origem_inferida;
update public.incidents set origem = null, origem_inferida = false
 where origem_inferida;

-- 2. incident_record volta ao corpo de 450000
create or replace function public.incident_record(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_source      text := nullif(trim(coalesce(p_payload ->> 'source', '')), '');
    v_component   text := nullif(trim(coalesce(p_payload ->> 'component', '')), '');
    v_route       text := nullif(trim(coalesce(p_payload ->> 'route', '')), '');
    v_request_id  text := nullif(trim(coalesce(p_payload ->> 'request_id', '')), '');
    v_error_name  text := nullif(trim(coalesce(p_payload ->> 'error_name', '')), '');
    v_origem      text;
    v_origem_inf  boolean;
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

    -- Origem: valor fora da lista vira `nao_identificada` em vez de derrubar a
    -- ingestao. Perder o incidente por causa do rotulo seria trocar o problema
    -- grande pelo pequeno.
    v_origem := nullif(trim(coalesce(p_payload ->> 'origem', '')), '');
    if v_origem is not null and v_origem not in (
        'ia_n8n','front','webhook_externo','cron','edge_interna',
        'integracao_externa','nao_identificada'
    ) then
        v_origem := 'nao_identificada';
    end if;
    v_origem_inf := coalesce((p_payload ->> 'origem_inferida')::boolean, false);
    -- `nao_identificada` e sempre palpite, por definicao.
    if v_origem = 'nao_identificada' then
        v_origem_inf := true;
    end if;

    -- Idempotencia: a mesma linha de origem nunca vira dois eventos.
    if v_request_id is not null and exists (
        select 1 from public.incident_events e where e.request_id = v_request_id
    ) then
        return jsonb_build_object('skipped', true, 'reason', 'request_id_ja_registrado');
    end if;

    -- Sanitiza DE NOVO aqui: quem chama pode ser reescrito e esquecer.
    v_msg   := nullif(public.sanitize_incident_text(p_payload ->> 'error_message'), '');
    v_desc  := nullif(public.sanitize_incident_text(p_payload ->> 'error_description'), '');
    v_stack := nullif(public.sanitize_incident_text(p_payload ->> 'error_stack'), '');

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
        v_locator := 'rls:' || coalesce(
            substring(coalesce(v_msg, '') || ' ' || coalesce(v_desc, '') from 'for table "([^"]+)"'),
            'tabela_desconhecida'
        );
        v_sev := 'alta';
    else
        v_locator := coalesce(v_route, '');
    end if;

    -- A origem NAO entra no fingerprint. Se entrasse, o mesmo defeito chamado
    -- pela IA e pelo front viraria dois incidentes e o placar de recorrencia se
    -- partiria em dois — que e o oposto do que este campo serve para mostrar.
    v_fingerprint := public.incident_fingerprint(
        v_source,
        v_component,
        v_locator,
        case when v_is_rls then '' else v_msg end
    );

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
        affected_tenants, ai_severity, ai_probable_cause, ai_fix_system,
        origem, origem_inferida
    )
    values (
        v_fingerprint, v_source, v_component, v_owner_id, 1, now(), now(),
        case when v_owner_id is null then '{}'::uuid[] else array[v_owner_id] end,
        v_sev, v_causa, v_acao,
        v_origem, v_origem_inf
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
        ai_severity = coalesce(public.incidents.ai_severity, excluded.ai_severity),
        -- origens que discordam viram `multiplas`: o mesmo defeito atingindo a IA
        -- E o front e um fato, nao um empate a ser desfeito no sorteio.
        origem = case
            when public.incidents.origem is null       then excluded.origem
            when excluded.origem is null               then public.incidents.origem
            when public.incidents.origem = excluded.origem then public.incidents.origem
            else 'multiplas'
        end,
        -- basta um evento declarado para o agregado deixar de ser palpite puro
        origem_inferida = public.incidents.origem_inferida and excluded.origem_inferida,
        updated_at = now()
    returning id, (event_count = 1) into v_incident_id, v_is_new;

    insert into public.incident_events (
        started_at, source, component, failed_node, error_name, error_message,
        error_description, error_stack, http_code, request_id, owner_id, context,
        incident_id, origem, origem_inferida
    )
    values (
        v_started_at, v_source, v_component, nullif(v_route, ''), v_error_name, v_msg,
        v_desc, v_stack, v_http, v_request_id, v_owner_id, v_context,
        v_incident_id, v_origem, v_origem_inf
    )
    returning id into v_event_id;

    return jsonb_build_object(
        'incident_id', v_incident_id,
        'event_id', v_event_id,
        'is_new', v_is_new,
        'skipped', false,
        'fingerprint', v_fingerprint,
        'severidade', v_sev,
        'origem', v_origem
    );
end;
$function$;

revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;

-- 3. a inferencia deixa de existir
drop function if exists public.incident_origem_inferir(text, text);
