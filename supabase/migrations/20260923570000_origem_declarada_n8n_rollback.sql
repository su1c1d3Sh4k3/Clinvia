-- Rollback da origem declarada no caminho do n8n (20260923570000).
--
-- Volta `incident_ingest` a omitir `origem` nos dois inserts e o trigger a
-- testar so o nulo. Evento ja gravado NAO muda: `origem` e decidida na escrita.
-- Efeito de voltar: incidente novo de n8n volta a nascer `nao_identificada` com
-- `origem_inferida = false`, que e o defeito medido — reverter isto so faz
-- sentido junto com a reversao do resto do item 2.
--
-- `create or replace` PRESERVA os grants existentes, entao nao ha revoke/grant
-- aqui nem na ida.
--
-- Rodar: npx supabase db query --linked --file supabase/migrations/20260923570000_origem_declarada_n8n_rollback.sql

-- ── 1. incident_ingest sem declaracao de origem (estado anterior) ───────────
CREATE OR REPLACE FUNCTION public.incident_ingest(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_source        text := p_payload ->> 'source';
    v_workflow_id   text := nullif(trim(coalesce(p_payload ->> 'workflow_id', '')), '');
    v_workflow_name text := nullif(trim(coalesce(p_payload ->> 'workflow_name', '')), '');
    v_component     text;
    v_locator       text;
    v_owner_id      uuid;
    v_fingerprint   text;
    v_msg           text;
    v_desc          text;
    v_context       jsonb;
    v_started_at    timestamptz;
    v_incident_id   uuid;
    v_event_id      uuid;
    v_is_new        boolean := false;
    v_cat           record;
begin
    if v_source not in ('n8n_error', 'n8n_silent') then
        raise exception 'source invalido: %', coalesce(v_source, '(nulo)') using errcode = '22023';
    end if;
    if v_workflow_id is null then
        raise exception 'workflow_id obrigatorio' using errcode = '22023';
    end if;

    -- Tenant: mesma cadeia do api-token-usage. Nao achar NAO descarta o
    -- incidente — um erro de conta desconhecida ainda e um erro.
    select i.user_id into v_owner_id
    from public.instances i
    where i.workflow_code = v_workflow_id
    limit 1;

    if v_owner_id is null then
        select i.user_id into v_owner_id
        from public.instances i
        where i.workflow_id = v_workflow_id
        limit 1;
    end if;

    if v_owner_id is null then
        select c.user_id into v_owner_id
        from public.ia_config c
        where c.workflow_id = v_workflow_id
        limit 1;
    end if;

    -- component identifica o workflow, nao a execucao: e o que agrupa na tela.
    v_component := 'n8n:' || coalesce(v_workflow_name, v_workflow_id);

    -- locator = no que quebrou. Sem ele, dois erros diferentes do mesmo
    -- workflow viram um incidente so.
    v_locator := coalesce(nullif(trim(coalesce(p_payload ->> 'failed_node', '')), ''), '');

    v_msg  := public.sanitize_incident_text(p_payload ->> 'error_message');
    v_desc := public.sanitize_incident_text(p_payload ->> 'error_description');

    -- allowlist: so estes dois campos do payload nao tem coluna propria.
    -- Qualquer outra chave que o n8n mandar fica de fora de proposito.
    v_context := jsonb_strip_nulls(jsonb_build_object(
        'mode', p_payload ->> 'mode',
        'nodes_executed', p_payload -> 'nodes_executed'
    ));
    -- o context inteiro tambem e sanitizado: nome de no pode carregar URL com token
    v_context := public.sanitize_incident_text(v_context::text)::jsonb;

    begin
        v_started_at := (p_payload ->> 'started_at')::timestamptz;
    exception when others then
        v_started_at := null;  -- data podre do n8n nao derruba a ingestao
    end;

    v_fingerprint := public.incident_fingerprint(v_source, v_component, v_locator, v_msg);

    -- Catalogo: erro conhecido ja entra com severidade sugerida, sem esperar a IA.
    select * into v_cat
    from public.incident_catalog c
    where c.is_active
      and (c.source is null or c.source = v_source)
      and (
        (c.match_type = 'substring' and coalesce(v_msg, '') ilike '%' || c.pattern || '%')
        or (c.match_type = 'regex' and coalesce(v_msg, '') ~* c.pattern)
      )
    limit 1;

    insert into public.incidents (
        fingerprint, source, component, owner_id, event_count, first_seen, last_seen,
        affected_tenants, ai_severity, ai_probable_cause, ai_fix_n8n
    )
    values (
        v_fingerprint, v_source, v_component, v_owner_id, 1, now(), now(),
        case when v_owner_id is null then '{}'::uuid[] else array[v_owner_id] end,
        v_cat.severidade_sugerida, v_cat.causa, v_cat.acao
    )
    on conflict (fingerprint) where status <> 'resolved'
    do update set
        event_count = public.incidents.event_count + 1,
        last_seen   = now(),
        -- o mesmo fingerprint pode bater em mais de uma conta (erro de codigo,
        -- nao de dado): acumula em vez de sobrescrever.
        affected_tenants = case
            when excluded.owner_id is null
                or public.incidents.affected_tenants @> array[excluded.owner_id]
            then public.incidents.affected_tenants
            else public.incidents.affected_tenants || excluded.owner_id
        end,
        owner_id   = coalesce(public.incidents.owner_id, excluded.owner_id),
        updated_at = now()
    returning id, (event_count = 1) into v_incident_id, v_is_new;

    insert into public.incident_events (
        started_at, source, component, workflow_id, workflow_name, execution_id,
        execution_url, failed_node, failed_node_type, error_name, error_message,
        error_description, http_code, owner_id, context, incident_id
    )
    values (
        v_started_at, v_source, v_component, v_workflow_id, v_workflow_name,
        nullif(trim(coalesce(p_payload ->> 'execution_id', '')), ''),
        nullif(trim(coalesce(p_payload ->> 'execution_url', '')), ''),
        nullif(v_locator, ''),
        nullif(trim(coalesce(p_payload ->> 'failed_node_type', '')), ''),
        nullif(trim(coalesce(p_payload ->> 'error_name', '')), ''),
        v_msg, v_desc,
        case when jsonb_typeof(p_payload -> 'http_code') = 'number'
             then (p_payload ->> 'http_code')::integer end,
        v_owner_id, v_context, v_incident_id
    )
    returning id into v_event_id;

    return jsonb_build_object(
        'incident_id', v_incident_id,
        'event_id', v_event_id,
        'is_new', v_is_new,
        'owner_id', v_owner_id,
        'component', v_component,
        'fingerprint', v_fingerprint,
        'severidade_catalogo', v_cat.severidade_sugerida
    );
end;
$function$;

-- ── 2. trigger testando so o nulo (estado anterior) ────────────────────────
create or replace function public.incident_origem_normalizar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
    -- `nao_identificada` e sempre palpite, nunca declaracao: quem nao disse de
    -- onde veio nao pode constar como tendo dito.
    if new.origem is null then
        new.origem          := 'nao_identificada';
        new.origem_inferida := true;
    end if;
    return new;
end;
$fn$;
