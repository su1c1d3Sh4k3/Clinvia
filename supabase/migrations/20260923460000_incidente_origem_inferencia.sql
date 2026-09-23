-- Inferencia da origem: 86,5% dos eventos dos ultimos 7 dias cairam em
-- `nao_identificada` depois de 20260923450000 (192 de 222), muito acima dos 10%
-- que o proprio item definiu como limite aceitavel.
--
-- A causa nao era falta de informacao, era o lugar onde eu procurei. Eu inferia
-- pelo PREFIXO do componente, que e texto livre e so os detectores respeitam:
-- `conversation-summary-worker` sozinho eram 182 dos 192. Mas
-- `incident_events.source` ja e uma lista FECHADA de valores, obrigatoria em
-- toda ingestao, e mapeia quase 1:1 para a origem:
--
--   n8n_error / n8n_silent  -> ia_n8n              (o fluxo da IA quebrou)
--   frontend                -> front
--   db_job                  -> cron                (varredura/worker do banco)
--   provisioning            -> cron                (o worker e acordado por cron)
--   sync                    -> cron
--   integration             -> integracao_externa  (chamada nossa a terceiro)
--   edge_function           -> ambiguo, ver abaixo
--
-- `edge_function` e o unico ambiguo de verdade: uma function nossa pode ser
-- acordada pelo n8n, pelo front, por um webhook de terceiro ou por outra
-- function. Para ela o unico sinal honesto e o prefixo do nome (`webhook-*` so e
-- chamada por terceiro) e, daqui pra frente, o header `x-origin` que o proprio
-- chamador manda — que e DECLARACAO e nao passa por aqui.
--
-- TUDO que sai de `incident_origem_inferir` e palpite e viaja com
-- origem_inferida = true. Nunca passa por declaracao: era a condicao escrita.
--
-- O corpo de `incident_record` abaixo e o de 20260923450000 com UM bloco trocado
-- (gerado por supabase/.temp/_gen_origem_inf.py, cada substituicao guardada por
-- assert). Nao foi redigitado: reescrever de memoria uma funcao de 160 linhas ja
-- me fez perder a idempotencia por request_id uma vez nesta mesma sessao.
--
-- Rollback: 20260923460000_incidente_origem_inferencia_rollback.sql

create or replace function public.incident_origem_inferir(
    p_source text, p_component text)
returns text
language sql
immutable
set search_path to 'public'
as $$
    select case
        -- 1. O prefixo, quando ele e conclusivo por si so.
        when p_component like 'webhook-%'
          or p_component like 'meta-webhook%'
          or p_component like 'instagram-webhook%'         then 'webhook_externo'
        when p_component like 'n8n:%'                      then 'ia_n8n'
        when p_component like 'cron:%'
          or p_component like 'cron-http:%'                then 'cron'
        when p_component like 'openai:%'
          or p_component like 'meta:%'
          or p_component like 'uazapi:%'
          or p_component like 'instagram:%'                then 'integracao_externa'

        -- 2. O `source`, que e obrigatorio e de lista fechada.
        when p_source in ('n8n_error', 'n8n_silent')        then 'ia_n8n'
        when p_source = 'frontend'                          then 'front'
        when p_source in ('db_job', 'provisioning', 'sync') then 'cron'
        when p_source = 'integration'                       then 'integracao_externa'
        when p_source = 'edge_function'                     then 'edge_interna'

        else 'nao_identificada'
    end;
$$;

comment on function public.incident_origem_inferir(text, text) is
    'Palpite de origem quando o chamador nao declarou x-origin. Ancorado em incident_events.source (lista fechada), com o prefixo do componente como refinamento. TODO resultado daqui e inferido e precisa viajar com origem_inferida = true.';

revoke all on function public.incident_origem_inferir(text, text) from public, anon, authenticated;
grant execute on function public.incident_origem_inferir(text, text) to service_role;

-- == incident_record: liga a inferencia ======================================
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

    -- Ninguem declarou: inferimos pelo que ha, e o palpite viaja MARCADO como
    -- palpite. Sem esta linha 86,5% dos eventos ficavam em `nao_identificada`
    -- (medido em 23/09 sobre 222 eventos de 7 dias) — nao por falta de sinal,
    -- mas porque o sinal estava em `source` e eu olhava so para o prefixo.
    if v_origem is null then
        v_origem     := public.incident_origem_inferir(v_source, v_component);
        v_origem_inf := true;
    end if;

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
        'origem', v_origem,
        'origem_inferida', v_origem_inf
    );
end;
$function$;

comment on function public.incident_record(jsonb) is
    'Ingestao de incidente. Agrupa por fingerprint (source+component+rota+mensagem), sanitiza texto duas vezes, aplica a regra do 42501 e registra a ORIGEM do chamador — declarada (x-origin) ou inferida por incident_origem_inferir, distinguidas por origem_inferida. A origem NAO entra no fingerprint de proposito.';

revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;

-- == backfill: a coluna nasceu hoje, o historico nao tem culpa ===============
-- Sem isto o painel mostraria origem vazia em tudo que e anterior a esta
-- migration, e a distribuicao por origem so faria sentido daqui a 7 dias. Tudo
-- marcado como inferido, que e exatamente o que e. Reversivel pelo rollback.

update public.incident_events
   set origem = public.incident_origem_inferir(source, component),
       origem_inferida = true
 where origem is null;

update public.incidents
   set origem = public.incident_origem_inferir(source, component),
       origem_inferida = true
 where origem is null;
