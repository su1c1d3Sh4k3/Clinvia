-- Etapa 3 — permissao negada em producao: dizer QUAL operacao e QUAL politica.
--
-- A regra do 42501 ja existia em `incident_record`: mensagem com
-- `row-level security` vira `error_name = 'rls_violation'`, severidade `alta`,
-- e o fingerprint agrupa por tabela. Faltavam as duas coisas que tornam o
-- alerta acionavel:
--
--   1. A OPERACAO. Hoje uma negativa de INSERT e uma de UPDATE na mesma tabela
--      caem no mesmo incidente. Sao defeitos diferentes: `with check` e `using`
--      sao clausulas distintas, escritas em lugares distintos, e quase sempre
--      quebradas em momentos distintos. Juntar as duas obriga quem le a abrir
--      o evento para descobrir qual e — que e exatamente o trabalho que o
--      alerta deveria ter poupado.
--
--   2. O NOME DA POLITICA. "negado em crm_client" nao diz onde mexer. O banco
--      sabe quais politicas existem naquela tabela para aquele comando; nao
--      perguntar a ele e deixar quem recebeu o alerta refazer na mao uma
--      consulta que leva 3 ms.
--
-- O que este diagnostico NAO faz: apontar a migration. O arquivo nao esta no
-- banco, e "provavelmente a migration X" seria palpite com cara de fato. Ele
-- entrega o NOME da politica, que e uma chave exata para procurar em
-- `supabase/migrations` — e diz isso na propria mensagem.
--
-- Nota de calibragem (medida em 23/09 sobre 7 dias reais de gateway): o volume
-- verdadeiro de negativa de permissao em producao e de 40 respostas 401/403 na
-- SEMANA, e a maioria e sessao expirada (`GET /auth/v1/user`), nao politica
-- errada. Negativa de RLS em SELECT nao aparece aqui de proposito: ela nao
-- levanta erro nenhum — devolve 200 com zero linha. Esse e o caso silencioso,
-- e nenhum detector de erro pode pega-lo; quem pega e o teste de acesso.

-- ---------------------------------------------------------------------------
-- 1. Que operacao foi negada, lida do texto do erro.
-- ---------------------------------------------------------------------------
create or replace function public.incident_rls_operacao(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
    select case
        -- O Postgres so cita a USING expression quando a linha JA EXISTIA,
        -- ou seja: UPDATE (ou DELETE) barrado na leitura da linha antiga.
        when coalesce(p_texto, '') ilike '%USING expression%'            then 'update'
        when coalesce(p_texto, '') ilike '%new row violates row-level%'  then 'insert_ou_update'
        when coalesce(p_texto, '') ilike '%permission denied for table%' then 'grant_de_tabela'
        when coalesce(p_texto, '') ilike '%permission denied for function%' then 'grant_de_funcao'
        when coalesce(p_texto, '') ilike '%permission denied for%'       then 'grant'
        else 'desconhecida'
    end;
$$;

-- ---------------------------------------------------------------------------
-- 2. O diagnostico que viaja junto do incidente.
--
-- Curto de proposito: isto entra num alerta, nao num relatorio. Corta em 6
-- politicas porque tabela com mais de 6 ja tem um problema anterior a este.
-- ---------------------------------------------------------------------------
create or replace function public.incident_rls_diagnostico(
    p_tabela text,
    p_operacao text default 'desconhecida'
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tabela   text := split_part(coalesce(p_tabela, ''), '.', greatest(1, array_length(string_to_array(coalesce(p_tabela,''), '.'), 1)));
    v_existe   boolean;
    v_rls      boolean;
    v_forcada  boolean;
    v_pols     text;
    v_qtd      integer;
    v_grants   text;
begin
    if v_tabela is null or v_tabela = '' or v_tabela = 'tabela_desconhecida' then
        return 'Tabela nao identificada na mensagem do Postgres — abra o evento e leia o texto cru.';
    end if;

    select true, c.relrowsecurity, c.relforcerowsecurity
      into v_existe, v_rls, v_forcada
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tabela
     limit 1;

    if not coalesce(v_existe, false) then
        return format('A tabela "%s" nao existe em public — o nome veio do texto do erro e pode estar truncado.', v_tabela);
    end if;

    -- Politicas que valem para a operacao negada. `ALL` sempre conta.
    select string_agg(
               format('%s [%s/%s/%s]', p.policyname, p.cmd,
                      case when p.permissive = 'PERMISSIVE' then 'perm' else 'restr' end,
                      array_to_string(p.roles, '+')),
               '; ' order by p.policyname),
           count(*)
      into v_pols, v_qtd
      from (
            select * from pg_policies
             where schemaname = 'public' and tablename = v_tabela
               and (p_operacao = 'desconhecida'
                    or cmd = 'ALL'
                    or (p_operacao = 'update' and cmd in ('UPDATE','DELETE'))
                    or (p_operacao = 'insert_ou_update' and cmd in ('INSERT','UPDATE'))
                    or p_operacao like 'grant%')
             order by policyname
             limit 6
      ) p;

    if p_operacao like 'grant%' then
        select string_agg(distinct format('%s:%s', grantee, privilege_type), ', ')
          into v_grants
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = v_tabela
           and grantee in ('anon', 'authenticated');
        -- Silencio aqui seria o pior resultado possivel: numa negativa de
        -- GRANT, "nao existe grant nenhum" e a resposta, nao a ausencia dela.
        v_grants := coalesce(v_grants, 'NENHUM para anon/authenticated');
    end if;

    return format(
        'Tabela %s (RLS %s%s). %s%s Procure o nome da politica em supabase/migrations para achar quem a escreveu.',
        v_tabela,
        case when coalesce(v_rls, false) then 'ligada' else 'DESLIGADA' end,
        case when coalesce(v_forcada, false) then ', forcada' else '' end,
        case
            when coalesce(v_qtd, 0) = 0 and coalesce(v_rls, false)
                then 'NENHUMA politica cobre esta operacao — com RLS ligada, isso nega tudo por definicao.'
            when coalesce(v_qtd, 0) = 0
                then 'Nenhuma politica cadastrada.'
            else 'Politicas: ' || v_pols || '.'
        end,
        case when v_grants is not null then ' Grants de tabela: ' || v_grants || '.' else '' end
    );
end;
$$;

revoke all on function public.incident_rls_operacao(text) from public, anon, authenticated;
revoke all on function public.incident_rls_diagnostico(text, text) from public, anon, authenticated;
grant execute on function public.incident_rls_operacao(text) to service_role;
grant execute on function public.incident_rls_diagnostico(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Encaixe na ingestao: operacao entra no fingerprint, diagnostico entra no
--    contexto do evento.
-- ---------------------------------------------------------------------------
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

revoke all on function public.incident_record(jsonb) from public, anon, authenticated;
grant execute on function public.incident_record(jsonb) to service_role;
