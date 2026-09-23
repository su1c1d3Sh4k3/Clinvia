-- Rollback de 20260923340000_catalogo_componentes_completo.sql
--
-- CONSEQUENCIA DE RODAR ISTO: volta exatamente o defeito de 23/09/2026. Todo
-- alerta vindo de `openai_alerts` volta a nascer com o componente
-- 'openai-alerts', que nao tem linha no catalogo e nao casa com o prefixo
-- 'openai:' por causa do hifen. A natureza cai no default 'servico', o
-- cabecalho volta a dizer "O QUE FALHOU" numa deteccao e a IA volta a receber
-- o incidente como falha de servico — foi assim que ela recomendou implementar
-- teto de gasto, contrariando a regra do produto.
--
-- Os quatro componentes de servico (sync-openai-usage, openai-provision-worker,
-- automation-send-queue, api-public-booking) voltam a sair sem a linha
-- "O QUE ESSE SERVICO FAZ".
--
-- Nao existe motivo de desempenho para rodar isto: a parte A troca um literal
-- por uma concatenacao e a parte B sao quatro linhas numa tabela lida por chave
-- primaria. So faz sentido se a mudanca de nome tiver quebrado algum consumidor
-- externo que filtre incidentes por component = 'openai-alerts'. Nesse caso a
-- saida melhor e corrigir o consumidor, nao voltar o nome.
--
-- IRREVERSIVEL: os incidentes ja abertos sob 'openai:<kind>' mantem o nome e o
-- fingerprint deles. Voltar o emissor nao os funde de volta em 'openai-alerts'.

-- ── A. restaura o literal 'openai-alerts' no bloco 1 ────────────────────────
create or replace function public.incident_scan_db_sources(
    p_lookback interval default interval '7 days',
    p_max_per_source integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_desde    timestamptz := now() - coalesce(p_lookback, interval '7 days');
    v_limite   integer := greatest(1, coalesce(p_max_per_source, 200));
    v_res      jsonb;
    v_sev      text;
    v_reg      record;
    v_criados  jsonb := '{}'::jsonb;
    v_n        integer;
begin
    select coalesce(s.incident_db_scan_enabled, true) into v_ligado
      from public.llm_platform_settings s limit 1;
    if v_ligado is false then
        return jsonb_build_object('skipped', true, 'reason', 'incident_db_scan_enabled=false');
    end if;

    -- ── 1. openai_alerts ────────────────────────────────────────────────────
    v_n := 0;
    for v_reg in
        select a.id, a.kind, a.severity, a.message, a.profile_id, a.project_id, a.detail
          from public.openai_alerts a
         where a.created_at >= v_desde
         order by a.created_at
         limit v_limite
    loop
        v_sev := case lower(coalesce(v_reg.severity, ''))
                     when 'critical' then 'critica'
                     when 'warning'  then 'media'
                     else 'baixa'
                 end;
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'sync',
                'component', 'openai-alerts',
                'route', v_reg.kind,
                'error_message', v_reg.message,
                'request_id', 'openai_alerts:' || v_reg.id,
                'owner_id', v_reg.profile_id,
                'context', jsonb_build_object('project_id', v_reg.project_id, 'detail', v_reg.detail)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_n := v_n + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
        exception when others then
            raise warning '[incident_scan] openai_alerts %: %', v_reg.id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('openai_alerts', v_n);

    -- ── 2. openai_sync_runs ─────────────────────────────────────────────────
    v_n := 0;
    for v_reg in
        select r.id, r.status, r.error_code, r.error_message, r.started_at, r.trigger
          from public.openai_sync_runs r
         where r.started_at >= v_desde
           and r.status is distinct from 'ok'
         order by r.started_at
         limit v_limite
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'sync',
                'component', 'sync-openai-usage',
                'route', coalesce(v_reg.error_code, v_reg.status),
                'error_message', coalesce(v_reg.error_message, 'sync terminou com status ' || coalesce(v_reg.status, '(nulo)')),
                'request_id', 'openai_sync_runs:' || v_reg.id,
                'started_at', v_reg.started_at,
                'context', jsonb_build_object('trigger', v_reg.trigger, 'status', v_reg.status)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_n := v_n + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[incident_scan] openai_sync_runs %: %', v_reg.id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('openai_sync_runs', v_n);

    -- ── 3. fila de provisionamento ──────────────────────────────────────────
    v_n := 0;
    for v_reg in
        select p.id, p.company_name, p.openai_provision_error, p.openai_key_source
          from public.profiles p
         where p.openai_provision_error is not null
           and btrim(p.openai_provision_error) <> ''
         order by p.id
         limit v_limite
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'provisioning',
                'component', 'openai-provision-worker',
                'route', 'provision',
                'error_message', v_reg.openai_provision_error,
                'request_id', 'openai_provision:' || v_reg.id || ':' || md5(v_reg.openai_provision_error),
                'owner_id', v_reg.id,
                'context', jsonb_build_object('company_name', v_reg.company_name, 'key_source', v_reg.openai_key_source)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_n := v_n + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[incident_scan] provisionamento %: %', v_reg.id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('provisionamento', v_n);

    -- ── 4. conversation_summary_queue ───────────────────────────────────────
    v_n := 0;
    for v_reg in
        select q.conversation_id, q.user_id, q.attempts, q.last_error,
               coalesce(q.processed_at, q.created_at) as quando
          from public.conversation_summary_queue q
         where coalesce(q.processed_at, q.created_at) >= v_desde
           and q.status = 'failed'
         order by coalesce(q.processed_at, q.created_at)
         limit v_limite
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'conversation-summary-worker',
                'route', 'summary_job',
                'error_message', v_reg.last_error,
                'request_id', 'csq:' || v_reg.conversation_id || ':' || extract(epoch from v_reg.quando)::bigint,
                'started_at', v_reg.quando,
                'owner_id', v_reg.user_id,
                'context', jsonb_build_object('attempts', v_reg.attempts)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_n := v_n + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
            end if;
        exception when others then
            raise warning '[incident_scan] summary_queue %: %', v_reg.conversation_id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('resumos', v_n);

    -- ── 5. automation_send_queue ────────────────────────────────────────────
    v_n := 0;
    for v_reg in
        select q.id, q.user_id, q.flow_type, q.template_name, q.attempts, q.last_error, q.updated_at
          from public.automation_send_queue q
         where q.updated_at >= v_desde
           and q.status = 'failed'
         order by q.updated_at
         limit v_limite
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'automation-send-queue',
                'route', coalesce(v_reg.flow_type, 'send_job'),
                'error_message', v_reg.last_error,
                'request_id', 'asq:' || v_reg.id,
                'started_at', v_reg.updated_at,
                'owner_id', v_reg.user_id,
                'context', jsonb_build_object('template_name', v_reg.template_name, 'attempts', v_reg.attempts)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_n := v_n + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[incident_scan] automation_send_queue %: %', v_reg.id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('envios_automaticos', v_n);

    return jsonb_build_object('ok', true, 'desde', v_desde, 'eventos', v_criados);
end;
$$;

comment on function public.incident_scan_db_sources(interval, integer) is
  'Varre as fontes de falha que ja existem no banco (alertas OpenAI, sync de consumo, provisionamento, resumos, envios automaticos) e abre incidente. Idempotente por request_id.';

revoke all on function public.incident_scan_db_sources(interval, integer) from public, anon, authenticated;
grant execute on function public.incident_scan_db_sources(interval, integer) to service_role;

-- ── B. remove as quatro linhas ──────────────────────────────────────────────
delete from public.incident_component_catalog
 where component in ('sync-openai-usage', 'openai-provision-worker',
                     'automation-send-queue', 'api-public-booking');
