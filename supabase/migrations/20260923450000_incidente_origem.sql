-- Origem da falha: quem estava do outro lado da chamada que quebrou.
--
-- Hoje o painel diz QUAL componente quebrou e nao diz QUEM o chamou. "api-scheduling
-- deu 500" pode ser a IA mandando rotulo humano onde se espera UUID, o front
-- mandando formulario incompleto, ou a Meta reenviando um webhook velho. Sao tres
-- problemas diferentes, com tres donos diferentes, e ate agora todos chegavam com
-- a mesma cara.
--
-- Lista FECHADA de valores. `nao_identificada` e um resultado valido e precisa ser
-- contado: se passar de 10% das falhas, vira item de trabalho, nao desculpa.
--
--   ia_n8n              fluxo do n8n (as tools da IA)
--   front               navegador do usuario da plataforma
--   webhook_externo     Meta / UAZAPI / Instagram empurrando evento pra ca
--   cron                pg_cron, via clinvia_http_post
--   edge_interna        uma edge function chamando outra
--   integracao_externa  nos chamando terceiro (OpenAI, Graph, UAZAPI, Google)
--   nao_identificada    nao deu para saber
--
-- DECLARADA x INFERIDA. `origem_inferida` existe porque as duas coisas nao valem o
-- mesmo. Declarada = o chamador se identificou no header `x-origin`. Inferida =
-- nos adivinhamos pelo que havia (tipo de chave apresentada, User-Agent, Origin,
-- presenca de workflow_id no corpo). Palpite nunca pode passar por declaracao: no
-- dia em que a inferencia estiver errada, e preciso saber que era palpite.
--
-- Nos fluxos do n8n o header NAO tem como ser posto por aqui: mexer neles e PUT no
-- workflow vivo da PELE pela API publica, que apaga `binaryMode`/`timeSavedMode`
-- (medido em 23/09). Ate ele colar o header na mao, `ia_n8n` sai sempre inferida.
--
-- Rollback: 20260923450000_incidente_origem_rollback.sql

alter table public.incident_events
    add column if not exists origem          text,
    add column if not exists origem_inferida boolean not null default false;

alter table public.incidents
    add column if not exists origem          text,
    add column if not exists origem_inferida boolean not null default false;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'incident_events_origem_chk') then
        alter table public.incident_events add constraint incident_events_origem_chk
            check (origem is null or origem in (
                'ia_n8n','front','webhook_externo','cron','edge_interna',
                'integracao_externa','nao_identificada'));
    end if;
    -- `multiplas` so existe no agregado: um incidente pode juntar eventos de
    -- origens diferentes, e apagar essa divergencia seria mentir no alerta.
    if not exists (select 1 from pg_constraint where conname = 'incidents_origem_chk') then
        alter table public.incidents add constraint incidents_origem_chk
            check (origem is null or origem in (
                'ia_n8n','front','webhook_externo','cron','edge_interna',
                'integracao_externa','nao_identificada','multiplas'));
    end if;
end $$;

comment on column public.incident_events.origem is
    'Quem chamou o componente que falhou. Lista fechada. nao_identificada e resultado valido e deve ser contado.';
comment on column public.incident_events.origem_inferida is
    'true = nos adivinhamos pelo que havia na requisicao. false = o chamador se declarou em x-origin. Palpite nunca passa por declaracao.';
comment on column public.incidents.origem is
    'Origem dos eventos deste incidente. `multiplas` quando eles discordam — o que por si so ja e informacao.';

create index if not exists idx_incident_events_origem_recebido
    on public.incident_events (origem, received_at desc);

-- ── incident_record: aceita e propaga a origem ──────────────────────────────
-- Nao da para usar `alter function`: o corpo muda. Reescrito inteiro, com
-- security definer, search_path e grants redeclarados no fim (create or replace
-- substitui TODOS os atributos).

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

comment on function public.incident_record(jsonb) is
    'Ingestao de incidente. Agrupa por fingerprint (source+component+rota+mensagem), sanitiza texto duas vezes, aplica a regra do 42501 e registra a ORIGEM do chamador — declarada (x-origin) ou inferida, distinguidas por origem_inferida. A origem NAO entra no fingerprint de proposito.';

revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;

-- ── rotulo humano da origem, para o texto do alerta ─────────────────────────
create or replace function public.incident_origem_rotulo(p_origem text, p_inferida boolean)
returns text
language sql
immutable
set search_path to 'public'
as $$
    select case p_origem
               when 'ia_n8n'             then 'IA (fluxo do n8n)'
               when 'front'              then 'Front (navegador do usuario)'
               when 'webhook_externo'    then 'Webhook de terceiro (Meta/UAZAPI/Instagram)'
               when 'cron'               then 'Tarefa agendada'
               when 'edge_interna'       then 'Outra function nossa'
               when 'integracao_externa' then 'Chamada nossa a terceiro'
               when 'multiplas'          then 'Mais de uma origem'
               when 'nao_identificada'   then 'Nao identificada'
               else 'Nao identificada'
           end
        || case when coalesce(p_inferida, true) and p_origem is not null
                     and p_origem <> 'nao_identificada'
                then ' (inferida)' else '' end;
$$;

comment on function public.incident_origem_rotulo(text, boolean) is
    'Texto da linha de origem no alerta. Marca "(inferida)" quando o valor e palpite nosso e nao declaracao do chamador.';

revoke all on function public.incident_origem_rotulo(text, boolean) from public, anon, authenticated;
grant execute on function public.incident_origem_rotulo(text, boolean) to service_role;

-- ── clinvia_http_post declara `cron` para todo mundo de uma vez ─────────────
-- Uma linha aqui cobre TODOS os invocadores de cron sem tocar em nenhum deles.
create or replace function public.clinvia_http_post(
    p_alvo text, p_origem text, p_url text, p_headers jsonb,
    p_body jsonb default '{}'::jsonb, p_timeout integer default 5000)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_id bigint;
begin
    select net.http_post(
        url             := p_url,
        -- x-origin: o alvo passa a saber que quem chamou foi uma tarefa agendada.
        -- Nao sobrescreve um x-origin que o chamador ja tenha posto de proposito.
        headers         := jsonb_build_object('x-origin', 'cron')
                           || coalesce(p_headers, '{}'::jsonb),
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
$function$;

comment on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) is
    'Unico jeito certo de uma tarefa agendada chamar HTTP: registra request_id -> alvo em cron_http_calls (net._http_response nao guarda URL e e podado em 30 min) e declara x-origin: cron para o alvo.';

revoke all on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) to service_role;
