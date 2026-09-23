-- Origem declarada no caminho do n8n (item 2, segunda metade).
--
-- O QUE A CONFERENCIA DO `depois.sql` NAO PEGOU
-- =============================================
-- Aquele teste provou os 9 chamadores de `incident_record`. O n8n nao passa por
-- ele: erro de workflow entra por `incident_ingest`, que insere DIRETO em
-- `incidents`/`incident_events` — e nao escrevia `origem` nenhuma.
--
-- Medido em 23/09 injetando um evento `n8n_error` dentro da transacao do
-- endpoint de SQL (com limpeza antes do commit, entao o `alert-dispatch` nao
-- viu nada):
--
--     evento    -> origem 'nao_identificada', origem_inferida FALSE
--     incidente -> origem 'nao_identificada', origem_inferida FALSE
--
-- `false` e a parte grave. Nao e so que a origem estava errada: ela estava
-- errada CARIMBADA COMO DECLARADA. O indicador do item 2 (`origem_inferida`
-- abaixo de 10%) melhoraria justamente enquanto o dado piorava — um placar que
-- premia o defeito e pior do que nenhum placar.
--
-- Os 6 eventos de n8n que hoje aparecem como `ia_n8n` nao desmentem isso: eles
-- vieram do backfill da 20260923480000, nao da escrita. Escrita nova estava
-- caindo em `nao_identificada` desde entao.
--
-- POR QUE `false` E NAO `true`
-- ============================
-- `incident_ingest` levanta excecao na primeira linha do corpo se o `source`
-- nao for `n8n_error` ou `n8n_silent`. Chegar ao insert JA E a prova de quem
-- chamou — nao ha palpite a marcar.
--
-- A SEGUNDA CORRECAO: O DEFAULT VENCIA O TRIGGER
-- ==============================================
-- `incident_origem_normalizar` existe para impedir exatamente este caso, e nao
-- disparava: ele testava `new.origem is null`, mas a 20260923480000 pos DEFAULT
-- `'nao_identificada'` na coluna, e o default e aplicado ANTES do BEFORE
-- trigger. Quem omite a coluna nunca chega nulo no trigger. Hoje isso so nao
-- tinha vitima porque todo o resto passa por `incident_record`, que preenche os
-- dois campos — o proximo escritor direto seria a vitima.
--
-- Corpo de PRODUCAO (`pg_get_functiondef`), nao o do arquivo local.
-- Rodar: npx supabase db query --linked --file supabase/migrations/20260923570000_origem_declarada_n8n.sql

-- ── 1. incident_ingest declara `ia_n8n` nos dois inserts ────────────────────
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
        affected_tenants, ai_severity, ai_probable_cause, ai_fix_n8n,
        origem, origem_inferida
    )
    values (
        v_fingerprint, v_source, v_component, v_owner_id, 1, now(), now(),
        case when v_owner_id is null then '{}'::uuid[] else array[v_owner_id] end,
        v_cat.severidade_sugerida, v_cat.causa, v_cat.acao,
        'ia_n8n', false
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
        -- incidente que nasceu do backfill entra como palpite; basta um evento
        -- declarado chegar para ele deixar de ser. Mesma regra do
        -- `incident_record`. Nao ha merge de `origem` aqui de proposito: o
        -- `source` entra no fingerprint e aqui ele so pode ser n8n, entao
        -- conflito com outra origem nao existe.
        origem_inferida = public.incidents.origem_inferida and excluded.origem_inferida,
        updated_at = now()
    returning id, (event_count = 1) into v_incident_id, v_is_new;

    insert into public.incident_events (
        started_at, source, component, workflow_id, workflow_name, execution_id,
        execution_url, failed_node, failed_node_type, error_name, error_message,
        error_description, http_code, owner_id, context, incident_id,
        origem, origem_inferida
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
        v_owner_id, v_context, v_incident_id,
        -- NAO e palpite: a funcao levanta excecao logo no inicio se o `source`
        -- nao for `n8n_error`/`n8n_silent`. Chegar aqui ja prova quem chamou.
        'ia_n8n', false
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

-- ── 2. o default deixa de mentir ────────────────────────────────────────────
create or replace function public.incident_origem_normalizar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
    -- `nao_identificada` e sempre palpite, nunca declaracao: quem nao disse de
    -- onde veio nao pode constar como tendo dito. O teste do nulo sozinho nao
    -- bastava porque o DEFAULT da coluna (`'nao_identificada'`, posto pela
    -- 20260923480000) e aplicado ANTES do BEFORE trigger — para quem OMITE a
    -- coluna, `new.origem is null` nunca e verdade.
    if new.origem is null then
        new.origem := 'nao_identificada';
    end if;
    if new.origem = 'nao_identificada' then
        new.origem_inferida := true;
    end if;
    return new;
end;
$fn$;
