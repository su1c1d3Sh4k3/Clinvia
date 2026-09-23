-- Item 3, metade SQL: as 3 funcoes que engoliam erro passam a registrar.
--
-- A INSTRUCAO ERA "MANTENHA O FALLBACK, MAS FACA REGISTRAR"
-- =========================================================
-- Nenhum fallback muda de comportamento aqui. Data podre continua virando nulo,
-- id podre continua virando nulo, tabela que resiste continua esperando a
-- passada seguinte. O que muda e que os tres param de apagar a prova.
--
-- A medicao do dia 23/09 achou 3 pontos silenciosos em SQL (contra 137 no TS).
-- O SQL estava limpo justamente porque sao poucos — e sao estes:
--
--   incident_record          2x  `exception when others then v_<x> := null`
--   incident_ingest          1x  idem
--   admin_delete_tenant_data 3x  `when foreign_key_violation`/`when others` -> null
--
-- ONDE CADA UM PASSA A REGISTRAR, E POR QUE ALI
-- =============================================
-- Nos dois de ingestao, o registro vai para o `context` do proprio evento. E o
-- unico lugar que o painel ja le e que sobrevive a chamada: criar tabela de log
-- para isto seria construir um segundo lugar para ninguem olhar. O texto passa
-- por `sanitize_incident_text` e e cortado em 120 caracteres — o valor recusado
-- veio de fora e nao pode virar vetor de vazamento dentro do proprio incidente.
--
-- A diferenca que isso faz: hoje `owner_id` nulo num incidente pode significar
-- "erro de plataforma, sem tenant" (normal) ou "quem chamou mandou um id
-- ilegivel" (defeito). Sao a mesma coluna nula e nada os separava.
--
-- Em `admin_delete_tenant_data` o registro vai para o RETORNO da funcao e para a
-- mensagem da excecao. O caso concreto: quando a exclusao trava, a excecao diz
-- `exclusao travada apos 30 passadas: services_category=1` e nunca diz por que —
-- o `sqlerrm` que nomeava a guarda (`protect_avaliacao_category`, lifecycle do
-- CRM, uma FK especifica) tinha sido descartado passadas antes. Agora a ultima
-- falha de cada tabela fica guardada em `_del_falha` e viaja nas duas pontas.
-- Retentativa tambem aparece no relatorio de SUCESSO: exclusao que so terminou
-- porque um trigger foi desligado nao e exclusao limpa.
--
-- CORPOS DE PRODUCAO (`pg_get_functiondef`), com uma excecao deliberada:
-- `incident_ingest` parte do corpo da 20260923570000, aplicada minutos antes —
-- usar o dump anterior reverteria a origem declarada do n8n sem querer.
--
-- `create or replace` PRESERVA os grants, entao nao ha revoke/grant aqui.
--
-- Rodar: npx supabase db query --linked --file supabase/migrations/20260923580000_silencio_sql_registra.sql

-- ── incident_record ──
CREATE OR REPLACE FUNCTION public.incident_record(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_rls_tabela  text;
    v_rls_op      text;
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
        -- ...mas deixa rastro. Um incidente sem tenant e muito diferente de um
        -- incidente CUJO tenant veio ilegivel: o primeiro e normal (erro de
        -- plataforma), o segundo e defeito de quem chamou, e sem este aviso os
        -- dois sao a mesma coluna nula.
        v_context := v_context || jsonb_build_object(
            'aviso_owner_id', 'valor recusado (' || sqlstate || '): '
                || left(public.sanitize_incident_text(
                        coalesce(p_payload ->> 'owner_id', '(nulo)')), 120));
    end;

    begin
        v_started_at := (p_payload ->> 'started_at')::timestamptz;
    exception when others then
        v_started_at := null;
        v_context := v_context || jsonb_build_object(
            'aviso_started_at', 'valor recusado (' || sqlstate || '): '
                || left(public.sanitize_incident_text(
                        coalesce(p_payload ->> 'started_at', '(nulo)')), 120));
    end;

    v_http := case when jsonb_typeof(p_payload -> 'http_code') = 'number'
                   then (p_payload ->> 'http_code')::integer end;

    -- ── regra do 42501 (§3.4) ──────────────────────────────────────────────
    v_is_rls := coalesce(v_msg, '') ~ '42501'
             or coalesce(v_msg, '') ilike '%violates row-level security%'
             or coalesce(v_desc, '') ilike '%violates row-level security%'
             or coalesce(v_msg, '') ilike '%permission denied for %';

    if v_is_rls then
        v_error_name := 'rls_violation';
        v_rls_tabela := coalesce(
            substring(coalesce(v_msg, '') || ' ' || coalesce(v_desc, '') from 'for table "([^"]+)"'),
            substring(coalesce(v_msg, '') || ' ' || coalesce(v_desc, '') from 'permission denied for table ([a-zA-Z0-9_]+)'),
            'tabela_desconhecida'
        );
        v_rls_op := public.incident_rls_operacao(coalesce(v_msg, '') || ' ' || coalesce(v_desc, ''));

        -- A operacao entra no agrupamento: `with check` quebrado e `using`
        -- quebrado sao dois defeitos, nao um.
        v_locator := 'rls:' || v_rls_tabela || ':' || v_rls_op;
        v_sev := 'alta';

        -- O diagnostico viaja no evento. Falha aqui nao pode derrubar a
        -- ingestao: perder o incidente para nao perder o comentario seria
        -- exatamente a troca errada.
        begin
            v_context := v_context || jsonb_build_object(
                'rls_tabela', v_rls_tabela,
                'rls_operacao', v_rls_op,
                'rls_diagnostico', public.incident_rls_diagnostico(v_rls_tabela, v_rls_op)
            );
        exception when others then
            v_context := v_context || jsonb_build_object(
                'rls_tabela', v_rls_tabela,
                'rls_operacao', v_rls_op,
                'rls_diagnostico', 'diagnostico indisponivel: ' || sqlerrm
            );
        end;
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
        v_sev,
        coalesce(v_causa, case when v_is_rls then v_context ->> 'rls_diagnostico' end),
        v_acao,
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
        ai_probable_cause = coalesce(public.incidents.ai_probable_cause, excluded.ai_probable_cause),
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

-- ── incident_ingest ──
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
        -- ...mas deixa rastro. Sem isto o evento chega com `started_at` nulo e
        -- nada distingue "o n8n nao mandou" de "o n8n mandou lixo".
        v_context := v_context || jsonb_build_object(
            'aviso_started_at', 'valor recusado (' || sqlstate || '): '
                || left(public.sanitize_incident_text(
                        coalesce(p_payload ->> 'started_at', '(nulo)')), 120));
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

-- ── admin_delete_tenant_data ──
CREATE OR REPLACE FUNCTION public.admin_delete_tenant_data(p_user_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS TABLE(objeto text, linhas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
 SET lock_timeout TO '30s'
AS $function$
declare
    v_claims  text;
    v_ids     uuid[];
    v_rec     record;
    v_n       bigint;
    v_pass    int := 0;
    v_moveu   boolean;
    v_bypass  boolean := false;
    v_resta   text;
    v_motivo  text;
begin
    -- Quem pode chamar: a plataforma (service_role) ou um super admin. Conexao
    -- direta ao banco (sem claims de JWT) passa -- quem tem credencial do banco
    -- ja tem acesso total.
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null
       and coalesce(v_claims::jsonb ->> 'role', '') <> 'service_role'
       and not public.is_super_admin() then
        raise exception 'apenas a plataforma pode excluir os dados de uma conta'
            using errcode = '42501';
    end if;

    if p_user_id is null then
        raise exception 'p_user_id e obrigatorio' using errcode = '22004';
    end if;

    v_ids := public.admin_tenant_principal_ids(p_user_id);

    -- `if not exists` + truncate: dry run e execucao real podem acontecer na
    -- mesma sessao, e temp table sobrevive ao fim da chamada.
    create temp table if not exists _del_alvo(
        tbl       text primary key,
        col       text not null,
        restantes bigint not null default 0,
        apagadas  bigint not null default 0
    ) on commit drop;
    truncate _del_alvo;

    -- Alvos vindos do catalogo: tabela nova com user_id/owner_id entra sozinha.
    insert into _del_alvo(tbl, col)
    select distinct on (c.relname) c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attname in ('user_id','owner_id')
      and a.atttypid = 'uuid'::regtype
    order by c.relname, a.attname;

    -- ---- Chaves de tenant que nao se chamam user_id -----------------------
    -- Estas precisam sair ANTES da varredura: a ligacao com a conta se perde
    -- quando instances/appointments/sales/profiles forem apagados.
    create temp table if not exists _del_extra(tbl text, apagadas bigint) on commit drop;
    truncate _del_extra;

    -- Por que uma terceira temp table: os tres `when others` abaixo existem para
    -- a exclusao nao parar por causa de UMA tabela, e isso esta certo. O que
    -- estava errado era o preco: quando a exclusao travava, a excecao final
    -- dizia QUAIS tabelas sobraram e nunca POR QUE — o sqlerrm que explicava
    -- tinha sido descartado passadas antes. Aqui ele fica guardado, e a ultima
    -- falha de cada tabela viaja no relatorio de retorno e na mensagem do erro.
    create temp table if not exists _del_falha(
        tbl        text primary key,
        estado     text not null,
        msg        text not null,
        tentativas int  not null default 0
    ) on commit drop;
    truncate _del_falha;

    if not p_dry_run then
        delete from public.webhook_queue
        where instance_name in (
            select i.instance_name from public.instances i where i.user_id = any(v_ids)
        );
        get diagnostics v_n = row_count;
        insert into _del_extra values ('webhook_queue (instance_name)', v_n);

        delete from public._reminder_log
        where item_id in (
            select a.id from public.appointments a where a.user_id = any(v_ids)
            union all
            select s.id from public.sales s where s.user_id = any(v_ids)
        );
        get diagnostics v_n = row_count;
        insert into _del_extra values ('_reminder_log (item_id)', v_n);

        delete from public.pending_signups
        where email in (select p.email from public.profiles p where p.id = any(v_ids));
        get diagnostics v_n = row_count;
        insert into _del_extra values ('pending_signups (email)', v_n);

        delete from public.active_sessions where auth_user_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('active_sessions (auth_user_id)', v_n);

        delete from public.bia_chat_history where auth_user_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('bia_chat_history (auth_user_id)', v_n);

        delete from public."cache_ permanent_memory"
        where user_id = any(array(select x::text from unnest(v_ids) x));
        get diagnostics v_n = row_count;
        insert into _del_extra values ('cache_ permanent_memory (user_id text)', v_n);

        delete from public.token_monthly_history where profile_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('token_monthly_history (profile_id)', v_n);
    else
        insert into _del_extra
        select 'webhook_queue (instance_name)', count(*) from public.webhook_queue
        where instance_name in (select i.instance_name from public.instances i where i.user_id = any(v_ids));
        insert into _del_extra
        select '_reminder_log (item_id)', count(*) from public._reminder_log
        where item_id in (
            select a.id from public.appointments a where a.user_id = any(v_ids)
            union all select s.id from public.sales s where s.user_id = any(v_ids));
        insert into _del_extra
        select 'pending_signups (email)', count(*) from public.pending_signups
        where email in (select p.email from public.profiles p where p.id = any(v_ids));
        insert into _del_extra
        select 'active_sessions (auth_user_id)', count(*) from public.active_sessions
        where auth_user_id = any(v_ids);
        insert into _del_extra
        select 'bia_chat_history (auth_user_id)', count(*) from public.bia_chat_history
        where auth_user_id = any(v_ids);
        insert into _del_extra
        select 'cache_ permanent_memory (user_id text)', count(*) from public."cache_ permanent_memory"
        where user_id = any(array(select x::text from unnest(v_ids) x));
        insert into _del_extra
        select 'token_monthly_history (profile_id)', count(*) from public.token_monthly_history
        where profile_id = any(v_ids);
    end if;

    -- ---- Contagem inicial -------------------------------------------------
    for v_rec in select tbl, col from _del_alvo loop
        execute format('select count(*) from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
            into v_n using v_ids;
        update _del_alvo set restantes = v_n where tbl = v_rec.tbl;
    end loop;

    if p_dry_run then
        return query
            select a.tbl, a.restantes from _del_alvo a where a.restantes > 0
            union all
            select e.tbl, e.apagadas from _del_extra e where e.apagadas > 0
            union all
            select '(storage) ' || s.bucket, count(*)
            from public.admin_tenant_storage_paths(p_user_id) s
            group by s.bucket
            order by 2 desc;
        return;
    end if;

    -- ---- Passadas ate convergir ------------------------------------------
    -- Sem ordem fixa: quando uma FK bloqueia (NO ACTION/RESTRICT), a tabela
    -- espera a passada seguinte, quando o filho ja tera saido.
    loop
        v_pass := v_pass + 1;
        v_moveu := false;

        for v_rec in select tbl, col from _del_alvo where restantes > 0 loop
            begin
                execute format('delete from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                    using v_ids;
                get diagnostics v_n = row_count;
                if v_n > 0 then
                    v_moveu := true;
                    update _del_alvo set apagadas = apagadas + v_n where tbl = v_rec.tbl;
                end if;
            exception
                when foreign_key_violation then
                    -- Esperado: o filho ainda nao saiu. Tenta de novo na proxima
                    -- passada, mas fica anotado — se a exclusao travar, e este
                    -- texto que diz qual FK segurou.
                    insert into _del_falha(tbl, estado, msg, tentativas)
                    values (v_rec.tbl, sqlstate, left(sqlerrm, 300), 1)
                    on conflict (tbl) do update
                       set estado = excluded.estado, msg = excluded.msg,
                           tentativas = _del_falha.tentativas + 1;
                when others then
                    insert into _del_falha(tbl, estado, msg, tentativas)
                    values (v_rec.tbl, sqlstate, left(sqlerrm, 300), 1)
                    on conflict (tbl) do update
                       set estado = excluded.estado, msg = excluded.msg,
                           tentativas = _del_falha.tentativas + 1;
                    -- Guarda de regra de negocio (ex.: protect_avaliacao_category,
                    -- lifecycle do CRM) impedindo o delete. Elas existem para o uso
                    -- normal do app; numa exclusao de conta nao ha regra a
                    -- preservar. `disable trigger user` NAO desliga os triggers
                    -- internos de FK, entao cascata e integridade continuam valendo.
                    --
                    -- Mas `alter table` pega ACCESS EXCLUSIVE e o segura ate o fim
                    -- da transacao, travando a tabela para TODOS os tenants. Por
                    -- isso este caminho so abre depois que a via normal esgotou:
                    -- assim o lock dura o minimo possivel, no fim da limpeza.
                    if v_bypass then
                        begin
                            execute format('alter table public.%I disable trigger user', v_rec.tbl);
                            execute format('delete from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                                using v_ids;
                            get diagnostics v_n = row_count;
                            execute format('alter table public.%I enable trigger user', v_rec.tbl);
                            if v_n > 0 then
                                v_moveu := true;
                                update _del_alvo set apagadas = apagadas + v_n where tbl = v_rec.tbl;
                                insert into _del_extra values ('(trigger desligado) ' || v_rec.tbl, v_n);
                            end if;
                        exception
                            when others then
                                -- a subtransacao volta atras, inclusive o disable;
                                -- fica para a proxima passada
                                insert into _del_falha(tbl, estado, msg, tentativas)
                                values (v_rec.tbl, sqlstate,
                                        '(com trigger desligado) ' || left(sqlerrm, 260), 1)
                                on conflict (tbl) do update
                                   set estado = excluded.estado, msg = excluded.msg,
                                       tentativas = _del_falha.tentativas + 1;
                        end;
                    end if;
            end;
        end loop;

        -- Recontagem em vez de subtracao: apagar um pai pode levar filhos de
        -- outras tabelas-alvo junto (as FKs que sao CASCADE).
        for v_rec in select tbl, col from _del_alvo where restantes > 0 loop
            execute format('select count(*) from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                into v_n using v_ids;
            update _del_alvo set restantes = v_n where tbl = v_rec.tbl;
        end loop;

        exit when not exists (select 1 from _del_alvo where restantes > 0);

        if not v_moveu then
            if not v_bypass then
                -- A via normal esgotou e ainda sobra dado: o que resta esta
                -- barrado por guarda de negocio, nao por FK. Libera o bypass
                -- (com o lock exclusivo) para a passada seguinte.
                v_bypass := true;
            else
                select string_agg(tbl || '=' || restantes::text, ', ' order by tbl)
                  into v_resta from _del_alvo where restantes > 0;
                select string_agg(f.tbl || ': ' || f.estado || ' ' || f.msg, ' | ' order by f.tbl)
                  into v_motivo from _del_falha f
                  join _del_alvo a on a.tbl = f.tbl and a.restantes > 0;
                raise exception 'exclusao travada apos % passadas: % -- motivo: %',
                    v_pass, v_resta, coalesce(v_motivo, '(nenhuma falha registrada)')
                    using errcode = '23503';
            end if;
        end if;

        if v_pass >= 30 then
            select string_agg(tbl || '=' || restantes::text, ', ' order by tbl)
              into v_resta from _del_alvo where restantes > 0;
            select string_agg(f.tbl || ': ' || f.estado || ' ' || f.msg, ' | ' order by f.tbl)
              into v_motivo from _del_falha f
              join _del_alvo a on a.tbl = f.tbl and a.restantes > 0;
            raise exception 'exclusao nao convergiu em 30 passadas: % -- motivo: %',
                v_resta, coalesce(v_motivo, '(nenhuma falha registrada)')
                using errcode = '23503';
        end if;
    end loop;

    -- Sucesso com retentativa nao e sucesso limpo: a tabela que resistiu N
    -- passadas aparece no relatorio. Sem isto, a unica pista de que uma guarda
    -- de negocio precisou ser contornada era a linha `(trigger desligado)`.
    return query
        select a.tbl, a.apagadas from _del_alvo a where a.apagadas > 0
        union all
        select e.tbl, e.apagadas from _del_extra e where e.apagadas > 0
        union all
        select '(retentativas) ' || f.tbl || ' -- ' || f.estado || ' ' || f.msg,
               f.tentativas::bigint
          from _del_falha f
        union all
        select '(passadas)', v_pass::bigint
        order by 2 desc;
end;
$function$;
