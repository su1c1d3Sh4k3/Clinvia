-- Fecha o buraco do catalogo que produziu o alerta errado de 23/09/2026.
--
-- O QUE ACONTECEU, na ordem exata:
-- o alerta de gasto anomalo chegou dizendo "O QUE FALHOU" e a IA respondeu
-- "revisar a funcao daily_anomaly ... e implementar limites de gasto". Duas
-- inversoes: o detector nao falhou (ele detectou), e a regra do produto e NAO
-- ter teto de gasto. A causa nao estava na IA nem no texto do alerta.
--
-- A causa era um desencontro de nome. `incident_scan_db_sources` grava todo
-- alerta vindo da tabela `openai_alerts` sob o componente literal
-- 'openai-alerts', com o tipo do alerta no `route`. O catalogo, escrito depois,
-- cadastrou os detectores um a um como 'openai:daily_anomaly',
-- 'openai:zero_usage', 'openai:sync_failure'. Nenhum dos dois lados estava
-- errado sozinho; juntos, nao casavam. Resultado em cadeia:
--   componente sem linha -> natureza cai no default 'servico'
--   -> cabecalho sai "O QUE FALHOU" numa deteccao
--   -> a IA recebe o incidente como falha de servico e inverte a conclusao.
--
-- Note que o prefixo 'openai:' NAO salvava este caso: 'openai-alerts' nao
-- comeca com 'openai:'. O hifen custou a analise inteira.
--
-- DUAS CORRECOES AQUI:
-- A. o varredor passa a emitir 'openai:' || kind, que e a convencao que o
--    detector de saldo ja usava ('openai:saldo_baixo',
--    'openai:ancora_de_saldo_vencida' sao literais dele). Um nome so para a
--    familia inteira.
-- B. as quatro linhas que faltavam no catalogo, para os componentes que o banco
--    JA emite hoje e nao tinham descricao.
--
-- CONSEQUENCIA ACEITA (o user aprovou em 23/09): trocar o componente troca o
-- fingerprint. O incidente aberto de gasto anomalo (component 'openai-alerts')
-- nao se funde com os novos; ele envelhece com o texto pobre e a proxima
-- deteccao nasce catalogada. Reabertura em rajada nao acontece porque o
-- request_id continua sendo 'openai_alerts:<id>' e ja esta gasto.

-- ── A. o varredor passa a nomear cada detector da OpenAI ────────────────────
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
    -- Ja nascem classificados pelo proprio alertador; so traduzimos o
    -- vocabulario dele para o do painel.
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
                -- O `kind` entra no NOME do componente, nao so no route: e ele
                -- que decide a natureza no catalogo, e natureza errada inverte
                -- a analise da IA. Kind novo sem linha exata cai no prefixo
                -- 'openai:', que ja e detector — o default nunca mais mente.
                'component', 'openai:' || coalesce(v_reg.kind, 'desconhecido'),
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
            -- Uma linha podre nao pode parar a varredura das outras quatro fontes.
            raise warning '[incident_scan] openai_alerts %: %', v_reg.id, sqlerrm;
        end;
    end loop;
    v_criados := v_criados || jsonb_build_object('openai_alerts', v_n);

    -- ── 2. openai_sync_runs ─────────────────────────────────────────────────
    -- Sync de consumo parado significa fatura andando as cegas.
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
    -- Nao tem data de falha: o request_id carrega o hash do texto do erro, para
    -- que um erro NOVO na mesma conta volte a aparecer, e o mesmo erro nao.
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
    -- Resumo que falha nao reclama: a conversa so fica sem resumo para sempre.
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
    -- Aqui a falha e visivel para o paciente: a confirmacao de consulta dele
    -- nunca chegou.
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
  'Varre as fontes de falha que ja existem no banco (alertas OpenAI, sync de consumo, provisionamento, resumos, envios automaticos) e abre incidente. Idempotente por request_id. O alerta de OpenAI entra como openai:<kind> para casar com o catalogo de componentes.';

revoke all on function public.incident_scan_db_sources(interval, integer) from public, anon, authenticated;
grant execute on function public.incident_scan_db_sources(interval, integer) to service_role;

-- ── B. as quatro linhas que faltavam ────────────────────────────────────────
-- Todos os quatro sao SERVICO: existem para executar algo, e o incidente
-- significa que a execucao falhou. Nenhum deles vigia nada.
insert into public.incident_component_catalog (component, match_tipo, natureza, descricao, acao_padrao) values

('sync-openai-usage', 'exato', 'servico',
 'Baixa de hora em hora o uso e o custo REAIS da OpenAI, por projeto e por dia. E a base de todo numero de custo do painel. Nao confundir com openai:sync_failure, que e o detector que vigia este servico: aqui e o servico em si falhando.',
 'Veja a ultima linha de openai_sync_runs com status, error_code e error_message. Trate este antes de qualquer outro alerta de custo: com o sync parado, os numeros de gasto do painel estao velhos e os alertas de anomalia passam a comparar dado congelado.'),

('openai-provision-worker', 'exato', 'servico',
 'Cria projeto e chave proprios da OpenAI para cada conta e grava o motivo em profiles.openai_provision_error quando nao consegue. Conta sem chave propria continua atendendo pela chave da plataforma, entao a falha nao aparece no atendimento: aparece na fatura e na atribuicao de custo.',
 'Veja openai_provision_error e openai_key_source da conta citada. Erro que repete em varias contas aponta a Admin Key da organizacao (permissao ou cota de projetos); erro em uma so costuma ser nome de projeto duplicado.'),

('automation-send-queue', 'exato', 'servico',
 'Fila dos envios automaticos pela Meta: confirmacao de consulta, lembrete e pesquisa de satisfacao. A falha aqui e visivel para o paciente — a mensagem dele simplesmente nao chegou.',
 'Veja last_error e attempts na linha de automation_send_queue. 131047 e janela de 24h fechada sem template aprovado; 132000 e parametro de template com quebra de linha. Na terceira tentativa o envio vira Rejeitada e nao volta sozinho: reenvio e manual.'),

('api-public-booking', 'exato', 'servico',
 'API do link publico de agendamento — a unica da plataforma que um PACIENTE le direto na tela. Erro aqui vira texto na cara de quem esta tentando marcar consulta.',
 'O motivo tecnico fica em details do evento, nao na mensagem que o paciente viu. Horario que foi oferecido e depois recusado costuma ser erro de leitura de ocupacao engolido no caminho, nao conflito real de agenda.')

on conflict (component) do update
   set match_tipo  = excluded.match_tipo,
       natureza    = excluded.natureza,
       descricao   = excluded.descricao,
       acao_padrao = excluded.acao_padrao,
       is_active   = true,
       updated_at  = now();
