-- Origem DECLARADA nos 7 chamadores SQL do `incident_record` (item 2).
--
-- O PROBLEMA MEDIDO (23/09/2026, `item_chave_por_origem/antes.sql`):
-- 228 de 230 eventos com `origem_inferida = true` — 99,1%. A causa NAO era a
-- chave compartilhada: `incident_record` so marca `origem_inferida = false`
-- quando o payload TRAZ `origem`. Destes 7 chamadores nenhum trazia, entao
-- todo evento nascido no banco (212 de 230) passava por
-- `incident_origem_inferir` e era carimbado como palpite — mesmo quando nao ha
-- palpite nenhum a dar: uma funcao acordada por pg_cron E cron, isso e fato do
-- caminho de execucao, nao deducao pelo formato do JWT ou pelo Referer.
--
-- A MUDANCA: uma linha `'origem', '<valor>'` em cada chamada. Nada mais muda —
-- mesmo corpo, mesmo fingerprint (origem NAO entra nele), mesma severidade.
-- Os corpos abaixo sao os de PRODUCAO (`pg_get_functiondef`), nao os dos
-- arquivos locais, para nao reverter sem querer algum ajuste feito direto no
-- banco.
--
-- ORIGEM = QUEM DISPAROU, NAO O ASSUNTO. `openai_saldo_scan` fala de um
-- terceiro, mas quem chamou foi o cron; por isso `cron` e nao
-- `integracao_externa`. `admin_simulate_incident` e um clique no painel: `front`.
--
-- Rodar: npx supabase db query --linked --file supabase/migrations/20260923560000_origem_declarada_sql.sql

-- ── admin_simulate_incident: 1 chamada(s), origem 'front' ──
CREATE OR REPLACE FUNCTION public.admin_simulate_incident(p_severity text DEFAULT 'critica'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_sev text := coalesce(nullif(trim(p_severity), ''), 'critica');
    v_res jsonb;
    v_id  uuid;
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para simular incidentes' using errcode = '42501';
    end if;
    if v_sev not in ('critica', 'alta', 'media', 'baixa') then
        raise exception 'Severidade inválida: %', v_sev using errcode = '22023';
    end if;

    v_res := public.incident_record(jsonb_build_object(
        'origem', 'front',
        'source',    'db_job',
        'component', 'simulacao-de-alerta',
        -- carimbo no locator: cada simulacao e um incidente novo, e nao mais um
        -- evento colado no anterior.
        'route',     'simulacao/' || to_char(now(), 'YYYYMMDD"T"HH24MISS'),
        'error_name', 'simulacao_manual',
        'error_message',
            'Incidente de teste disparado pelo painel em '
            || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
            || '. Se esta mensagem chegou no WhatsApp, a corrente inteira está de pé: '
            || 'gravação do incidente, fila de aviso, despachante e Meta.',
        'context',   jsonb_build_object('simulacao', true, 'por', auth.uid())
    ));

    v_id := (v_res ->> 'incident_id')::uuid;
    perform public.incident_set_severidade_inicial(v_id, v_sev);

    -- a causa/acao existiriam so depois da analise; aqui elas sao escritas na mao
    -- para que a mensagem de teste tenha a MESMA forma de um alerta de verdade.
    update public.incidents
       set ai_probable_cause = 'nenhuma — incidente criado à mão pelo painel de alertas',
           ai_fix_system     = 'nada a fazer: se esta mensagem chegou, o canal está funcionando',
           notes             = coalesce(notes, 'simulação')
     where id = v_id;

    return jsonb_build_object(
        'incident_id', v_id,
        'severidade', v_sev,
        'aviso', 'O despachante roda a cada minuto. O resultado do envio aparece neste incidente.'
    );
end;
$function$;

-- ── canal_alertas_scan: 1 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.canal_alertas_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_ligado    boolean;
    v_atraso    integer;
    v_horas     integer;
    v_cooldown  integer;
    v_recusas   integer := 0;
    v_recusa    text;
    v_ok_recente integer := 0;
    v_presas    integer := 0;
    v_preso     text;
    v_min       integer;
    v_tentou    integer := 0;
    v_saiu      integer := 0;
    v_motivo    text := null;
    v_detalhe   text := null;
    v_rec       record;
    v_res       jsonb;
    v_incidente uuid;
    v_pendente  boolean;
begin
    select coalesce(s.canal_mudo_enabled, true),
           greatest(5,  coalesce(s.canal_mudo_atraso_min, 30)),
           greatest(1,  coalesce(s.canal_mudo_horas, 6)),
           greatest(10, coalesce(s.canal_mudo_cooldown_min, 60))
      into v_ligado, v_atraso, v_horas, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return jsonb_build_object('mudo', false, 'motivo', 'detector_desligado');
    end if;

    -- (a) a Meta recusou E nada saiu na mesma janela.
    -- As duas contas saem da MESMA varredura para nao correrem o risco de olhar
    -- janelas diferentes.
    select count(*) filter (where n.status = 'failed'),
           max(coalesce(n.error_message, n.error_code))
               filter (where n.status = 'failed'),
           count(*) filter (where n.status = 'sent')
      into v_recusas, v_recusa, v_ok_recente
      from public.incident_notifications n
     where n.via = 'whatsapp'
       and n.status in ('sent', 'failed')
       and n.sent_at >= now() - make_interval(mins => v_cooldown);

    -- (b) critica/alta presa na fila.
    -- O proprio canal fica de fora: senao o alerta do canal mudo vira prova de
    -- que o canal esta mudo e o detector se alimenta do proprio eco.
    select count(*),
           min(i.component),
           max((extract(epoch from (now() - i.first_seen)) / 60)::int)
      into v_presas, v_preso, v_min
      from public.incidents i
     where i.status <> 'resolved'
       and i.notified_count = 0
       and i.component <> 'canal:whatsapp-alertas'
       and i.first_seen <= now() - make_interval(mins => v_atraso)
       and public.incident_severidade_efetiva(i.component, i.ai_severity) in ('critica', 'alta')
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false);

    -- (c) tentou e nunca saiu
    select count(*) filter (where n.via = 'whatsapp'),
           count(*) filter (where n.via = 'whatsapp' and n.status = 'sent')
      into v_tentou, v_saiu
      from public.incident_notifications n
     where n.sent_at >= now() - make_interval(hours => v_horas)
       and n.status in ('sent', 'failed');

    if v_recusas > 0 and v_ok_recente = 0 then
        v_motivo  := 'meta_recusou';
        v_detalhe := v_recusas || ' envio(s) recusado(s) pela Meta nos ultimos '
                  || v_cooldown || ' min e nenhum entregue no mesmo periodo. '
                  || 'Ultimo erro: ' || coalesce(v_recusa, 'sem detalhe');
    elsif v_presas > 0 then
        v_motivo  := 'fila_parada';
        v_detalhe := v_presas || ' alerta(s) critico/alto sem sair. O mais antigo e '
                  || coalesce(v_preso, 'desconhecido') || ', parado ha '
                  || coalesce(v_min, 0) || ' min (limite: ' || v_atraso || ' min).';
    elsif v_tentou > 0 and v_saiu = 0 then
        v_motivo  := 'sem_saida';
        v_detalhe := v_tentou || ' tentativa(s) de envio nas ultimas ' || v_horas
                  || 'h e nenhuma chegou ao destino.';
    end if;

    if v_motivo is null then
        return jsonb_build_object('mudo', false, 'motivo', 'canal_respondendo');
    end if;

    -- Registra o incidente. O dedupe por fingerprint do incident_record garante
    -- que 15 em 15 min isto some no MESMO incidente em vez de criar um por
    -- varredura; a severidade vem do catalogo (critica).
    v_res := public.incident_record(jsonb_build_object(
        'origem', 'cron',
        'source',            'db_job',
        'component',         'canal:whatsapp-alertas',
        'route',             'canal_alertas_scan',
        'error_name',        v_motivo,
        'error_message',     'canal de alertas mudo: ' || v_detalhe,
        'error_description', 'Nenhum alerta consegue sair pelo WhatsApp. Enquanto '
                          || 'isto durar, TODO incidente critico da plataforma esta '
                          || 'invisivel no telefone — a unica via e este e-mail e o painel.',
        'context',           jsonb_build_object(
                                'motivo', v_motivo,
                                'recusas', v_recusas,
                                'entregues_janela_curta', v_ok_recente,
                                'presos', v_presas,
                                'tentativas_janela', v_tentou,
                                'sucessos_janela', v_saiu)
    ));
    v_incidente := nullif(v_res ->> 'incident_id', '')::uuid;

    -- Reserva o incidente para o vigia. Sem isto o despacho de minuto em minuto
    -- tentaria manda-lo pelo WhatsApp — que e justamente o que nao funciona — e
    -- o destinatario receberia o mesmo aviso duas vezes quando o canal voltasse.
    if v_incidente is not null then
        update public.incidents
           set notify_claimed_at = now(), updated_at = now()
         where id = v_incidente;
    end if;

    -- Um aviso por cooldown. O canal mudo dura horas; nao se avisa de 15 em 15 min.
    select not exists (
        select 1 from public.incident_notifications n
         where n.kind = 'canal' and n.via = 'email' and n.status = 'sent'
           and n.sent_at >= now() - make_interval(mins => v_cooldown)
    ) into v_pendente;

    -- Destinatario: o de maior severidade coberta que TENHA e-mail.
    select r.id, r.nome, r.email into v_rec
      from public.alert_recipients r
     where r.is_active and nullif(trim(r.email), '') is not null
     order by case r.min_severity when 'baixa' then 0 when 'media' then 1
                                  when 'alta' then 2 else 3 end
     limit 1;

    return jsonb_build_object(
        'mudo',          true,
        'motivo',        v_motivo,
        'detalhe',       v_detalhe,
        'incident_id',   v_incidente,
        'recipient_id',  v_rec.id,
        'nome',          v_rec.nome,
        'email',         v_rec.email,
        'email_pendente', coalesce(v_pendente, true) and v_rec.email is not null,
        'cooldown_min',  v_cooldown
    );
end;
$function$;

-- ── incident_scan_db_sources: 5 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.incident_scan_db_sources(p_lookback interval DEFAULT '7 days'::interval, p_max_per_source integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                'origem', 'cron',
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
                'origem', 'cron',
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
                'origem', 'cron',
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
                'origem', 'cron',
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
                'origem', 'cron',
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
$function$;

-- ── instagram_refresh_tokens_run: 1 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.instagram_refresh_tokens_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_url       text;
    v_jwt       text;
    v_edge      text;
    v_reg       record;
    v_res       jsonb;
    v_enviados  integer := 0;
    v_expirados integer := 0;
    v_mentindo  integer := 0;
    v_saudaveis integer := 0;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    if v_url is null then
        raise exception 'SUPABASE_URL ausente no vault — nao da para chamar a edge function';
    end if;

    -- ── 1. quem ainda da para salvar ─────────────────────────────────────────
    -- Sem filtro por status: o que decide e o token, nao o rotulo da linha.
    for v_reg in
        select i.id, i.account_name, i.token_expires_at
          from public.instagram_instances i
         where i.access_token is not null
           and i.token_expires_at is not null
           and i.token_expires_at > now()
           and i.token_expires_at < now() + interval '15 days'
         order by i.token_expires_at
    loop
        perform public.clinvia_http_post(
            p_alvo    := 'instagram-refresh-token',
            p_origem  := 'cron:instagram-refresh-tokens',
            p_url     := v_url || '/functions/v1/instagram-refresh-token',
            p_headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
                'x-service-key', coalesce(v_edge, v_jwt)
            ),
            p_body    := jsonb_build_object('instance_id', v_reg.id)
        );
        v_enviados := v_enviados + 1;
    end loop;

    -- ── 2. quem ja passou do ponto ───────────────────────────────────────────
    -- Renovar e impossivel; o que da para fazer e parar de mentir na tela.
    for v_reg in
        select i.id, i.account_name, i.status, i.token_expires_at
          from public.instagram_instances i
         where i.token_expires_at is not null
           and i.token_expires_at < now()
    loop
        v_expirados := v_expirados + 1;

        if v_reg.status is distinct from 'expired' then
            v_mentindo := v_mentindo + 1;
            update public.instagram_instances
               set status = 'expired', updated_at = now()
             where id = v_reg.id;
        end if;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'instagram:token-vencido',
                'route', v_reg.account_name,
                'error_message', 'Token do Instagram da conta @' || coalesce(v_reg.account_name, '(sem nome)')
                              || ' venceu e nao pode mais ser renovado. So reconectando por OAuth.',
                'error_description', 'Venceu em ' || to_char(v_reg.token_expires_at at time zone 'America/Sao_Paulo',
                                                             'DD/MM/YYYY HH24:MI') || ' (horario de Brasilia). '
                                  || 'A API do Instagram so renova token que ainda vale.',
                'context', jsonb_build_object('instance_id', v_reg.id,
                                              'status_antes', v_reg.status,
                                              'expirou_em', v_reg.token_expires_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                -- Ver "REGRA DE RUIDO" no cabecalho.
                if v_reg.status is distinct from 'expired' then
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
                    perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'alta');
                else
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
                end if;
            end if;
        exception when others then
            raise warning '[ig-refresh] incidente da conta %: %', v_reg.account_name, sqlerrm;
        end;
    end loop;

    select count(*) into v_saudaveis
      from public.instagram_instances i
     where i.token_expires_at is not null
       and i.token_expires_at >= now() + interval '15 days';

    return jsonb_build_object(
        'enviados_para_renovar', v_enviados,
        'ja_vencidos', v_expirados,
        'estavam_mentindo_connected', v_mentindo,
        'fora_da_janela_ok', v_saudaveis,
        'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    );
end;
$function$;

-- ── openai_alert_to_incident: 1 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.openai_alert_to_incident()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_res jsonb;
    v_sev text := case new.severity when 'critical' then 'critica'
                                    when 'warning'  then 'alta'
                                    else 'media' end;
begin
    v_res := public.incident_record(jsonb_build_object(
        'origem', 'cron',
        'source',        'db_job',
        'component',     'openai:' || new.kind,
        -- dedupe_key ja e o agrupador natural do varredor; reusa-lo como locator
        -- faz o fingerprint do incidente seguir exatamente a mesma regra.
        'route',         new.dedupe_key,
        'request_id',    'openai_alert:' || new.id::text,
        'error_name',    new.kind,
        'error_message', new.message,
        'owner_id',      new.profile_id,
        'context',       coalesce(new.detail, '{}'::jsonb)
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
    end if;

    return null;
exception when others then
    -- alerta de conta nunca pode derrubar o varredor que o gerou
    raise warning 'openai_alert_to_incident falhou para %: %', new.id, sqlerrm;
    return null;
end;
$function$;

-- ── openai_saldo_scan: 2 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.openai_saldo_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_ligado boolean;
    v_est    jsonb;
    v_saldo  numeric;
    v_auto   boolean;
    v_warn   numeric;
    v_crit   numeric;
    v_sev    text;
    v_res    jsonb;
begin
    select coalesce(openai_balance_alert_enabled, true) into v_ligado
      from public.llm_platform_settings limit 1;
    if v_ligado is false then
        return jsonb_build_object('skipped', 'openai_balance_alert_enabled=false');
    end if;

    v_est := public.openai_saldo_estimado();

    if coalesce((v_est ->> 'tem_ancora')::boolean, false) is false then
        return jsonb_build_object('skipped', 'sem_ancora');
    end if;

    if coalesce((v_est ->> 'ancora_vencida')::boolean, false) then
        v_res := public.incident_record(jsonb_build_object(
            'origem', 'cron',
            'source', 'db_job',
            'component', 'openai:ancora_de_saldo_vencida',
            'route', 'saldo/ancora',
            'request_id', 'saldo_ancora:' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
            'error_name', 'ancora_vencida',
            'error_message',
                'O saldo da OpenAI foi informado há ' || (v_est ->> 'dias_desde_ancora')
                || ' dias e o limite é ' || (v_est ->> 'limite_dias_ancora')
                || '. Enquanto não for atualizado, não há como estimar quanto resta.',
            'context', v_est
        ));
        if coalesce((v_res ->> 'skipped')::boolean, false) is false then
            perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
        end if;
        return jsonb_build_object('ancora_vencida', true);
    end if;

    v_saldo := (v_est ->> 'saldo_estimado_usd')::numeric;
    v_auto  := (v_est ->> 'recarga_automatica')::boolean;
    v_warn  := (v_est ->> 'limite_aviso_usd')::numeric;
    v_crit  := (v_est ->> 'limite_critico_usd')::numeric;

    if v_saldo >= v_warn then
        return jsonb_build_object('saldo_ok', true, 'saldo_estimado_usd', v_saldo);
    end if;

    -- recarga automatica desligada nao deixa espaco para "aviso": acabou, parou.
    v_sev := case when v_saldo < v_crit or v_auto is not true then 'critica' else 'alta' end;

    v_res := public.incident_record(jsonb_build_object(
        'origem', 'cron',
        'source', 'db_job',
        'component', 'openai:saldo_baixo',
        'route', 'saldo/' || v_sev,
        -- um incidente por dia por severidade: o saldo cai devagar, avisar de
        -- hora em hora so treinaria ele a ignorar o alerta.
        'request_id', 'saldo:' || v_sev || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'error_name', 'saldo_baixo',
        'error_message',
            'Saldo estimado da OpenAI: US$ ' || round(v_saldo, 2)::text
            || ' (queima de US$ ' || (v_est ->> 'queima_dia_usd') || '/dia, '
            || coalesce((v_est ->> 'dias_restantes'), '?') || ' dias restantes). '
            || case when v_auto is true
                    then 'A recarga automática está ligada.'
                    else 'A RECARGA AUTOMÁTICA ESTÁ DESLIGADA — quando acabar, a IA para.' end,
        'context', v_est
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
        update public.incidents
           set ai_probable_cause = 'consumo normal contra um saldo que não foi recarregado',
               ai_fix_system = case when v_auto is true
                    then 'confirme na OpenAI se a recarga automática tem cartão válido e teto suficiente'
                    else 'recarregue a conta OpenAI e atualize o saldo no painel de alertas' end
         where id = (v_res ->> 'incident_id')::uuid;
    end if;

    return jsonb_build_object('severidade', v_sev, 'saldo_estimado_usd', v_saldo, 'incidente', v_res);
end;
$function$;

-- ── provisionamento_scan: 3 chamada(s), origem 'cron' ──
CREATE OR REPLACE FUNCTION public.provisionamento_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_ligado      boolean;
    v_carencia    integer;
    v_max_tent    integer;
    v_reg         record;
    v_res         jsonb;
    v_erros       integer := 0;
    v_travados    integer := 0;
    v_sem_chave   integer := 0;
    -- Janela de deduplicacao. `incident_record` ignora request_id repetido, e a
    -- varredura roda a cada 15 min sobre a MESMA condicao persistente: sem esta
    -- chave horaria, uma conta quebrada geraria 4 eventos por hora para sempre.
    v_hora        text := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
begin
    select coalesce(provisionamento_alert_enabled, true),
           greatest(coalesce(provisionamento_carencia_min, 30), 5),
           greatest(coalesce(provisionamento_max_tentativas, 3), 1)
      into v_ligado, v_carencia, v_max_tent
      from public.llm_platform_settings
     limit 1;

    if not coalesce(v_ligado, true) then
        return jsonb_build_object('ok', true, 'desligado', true);
    end if;

    -- ── A. o worker falhou e disse por que ───────────────────────────────────
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.openai_provision_error as erro,
               (select q.attempts from public.openai_provision_queue q
                 where q.profile_id = p.id order by q.created_at desc limit 1) as tentativas
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_provision_error is not null
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:erro',
                'route', 'criar_projeto_openai',
                'owner_id', v_reg.id,
                'error_name', 'openai_provision_error',
                'error_message', 'Provisionamento da conta "' || v_reg.empresa || '" falhou: '
                                 || left(v_reg.erro, 400),
                'error_description', 'Enquanto este erro nao for limpo, a conta fica sem projeto e sem chave propria na OpenAI — ou seja, sem IA.',
                'request_id', 'prov-erro:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'tentativas', v_reg.tentativas)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_erros := v_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] erro %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── B. job vivo demais, ou tentado demais ────────────────────────────────
    for v_reg in
        select q.id, q.profile_id, q.status, q.attempts, q.created_at, q.updated_at,
               coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               left(coalesce(q.last_error, '(sem erro registrado)'), 300) as erro
          from public.openai_provision_queue q
          left join public.profiles p on p.id = q.profile_id
         where q.status in ('pending', 'processing')
           and (q.created_at < now() - make_interval(mins => v_carencia)
                or q.attempts >= v_max_tent)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:fila-travada',
                'route', 'openai_provision_queue',
                'owner_id', v_reg.profile_id,
                'error_name', 'provision_queue_stuck',
                'error_message', 'Job de provisionamento da conta "' || v_reg.empresa || '" preso em "'
                                 || v_reg.status || '" ha ' || round(extract(epoch from now() - v_reg.created_at) / 60)
                                 || ' min apos ' || v_reg.attempts || ' tentativa(s). Ultimo erro: ' || v_reg.erro,
                'error_description', 'O worker roda a cada 5 minutos. Job vivo muito alem disso significa worker parado, quebrado, ou retentando algo que nunca vai passar.',
                'request_id', 'prov-fila:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'job_id', v_reg.id,
                    'profile_id', v_reg.profile_id,
                    'status', v_reg.status,
                    'tentativas', v_reg.attempts,
                    'criado_em', v_reg.created_at,
                    'atualizado_em', v_reg.updated_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_travados := v_travados + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] fila %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── C. o sintoma: conta de cliente ativa e sem IA ────────────────────────
    -- Os filtros repetem, um a um, os do trigger de enfileiramento. Se um dia
    -- as duas listas divergirem, este detector passa a acusar conta que o
    -- sistema nunca teve intencao de prover.
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.created_at,
               exists (select 1 from public.openai_provision_queue q
                        where q.profile_id = p.id and q.status in ('pending', 'processing')) as tem_job
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_project_id is null
           and p.openai_token is null
           and coalesce(p.openai_key_source, '') <> 'customer'
           and p.created_at < now() - make_interval(mins => v_carencia)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:conta-sem-chave',
                'route', 'conta_ativa_sem_chave',
                'owner_id', v_reg.id,
                'error_name', 'conta_sem_chave_openai',
                'error_message', 'A conta "' || v_reg.empresa || '" esta ativa desde '
                                 || to_char(v_reg.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                                 || ' e continua sem projeto e sem chave da OpenAI. A IA dessa conta nao funciona.',
                'error_description', case
                    when v_reg.tem_job then 'Existe job na fila — o defeito esta no worker, nao no enfileiramento.'
                    else 'NAO existe job na fila: o enfileiramento nao aconteceu. Reenfileirar inserindo em openai_provision_queue.'
                end,
                'request_id', 'prov-sem-chave:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'ativa_desde', v_reg.created_at,
                    'tem_job_na_fila', v_reg.tem_job)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_sem_chave := v_sem_chave + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] sem chave %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'carencia_min', v_carencia,
        'incidentes', jsonb_build_object(
            'erro', v_erros,
            'fila_travada', v_travados,
            'conta_sem_chave', v_sem_chave)
    );
end;
$function$;

-- ── cron_health_scan: 5 chamada(s), origem 'cron' ──
-- Nao estava na lista dos 7: o levantamento contou o `'origem'` que aparece
-- DENTRO do `context` (`'origem', v_reg.origem`, o campo da resposta HTTP) como
-- se fosse declaracao de origem do incidente. Sao coisas diferentes e o
-- contador confundiu — os 5 pontos de chamada nao declaravam nada.
CREATE OR REPLACE FUNCTION public.cron_health_scan(p_max integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_ligado      boolean;
    v_marca       bigint;
    v_ratio       numeric;
    v_rajada_min  integer;
    v_limite      integer := greatest(1, coalesce(p_max, 300));
    v_nova_marca  bigint;
    v_reg         record;
    v_res         jsonb;
    v_sev         text;
    v_http_erros  integer := 0;
    v_timeouts    integer := 0;
    v_total       integer := 0;
    v_cron_erros  integer := 0;
    v_parados     integer := 0;
    v_rajadas     integer := 0;
    v_rajadas_jan integer := 0;
    v_alvo        text;
    v_dur_ms      integer;
    v_placar      text;
    v_orfao_morto boolean;
    v_orfaos      integer := 0;
    v_http_sev    text;
    v_http_placar text;
begin
    select coalesce(s.cron_health_enabled, true),
           coalesce(s.cron_health_last_response_id, 0),
           coalesce(s.cron_health_timeout_ratio, 0.30),
           greatest(2, coalesce(s.cron_health_rajada_jobs, 3))
      into v_ligado, v_marca, v_ratio, v_rajada_min
      from public.llm_platform_settings s
     limit 1;

    if v_ligado is false then
        return jsonb_build_object('skipped', true, 'reason', 'cron_health_enabled=false');
    end if;

    -- ── A. respostas HTTP com erro, que o cron reportou como sucesso ─────────
    select count(*),
           count(*) filter (where r.status_code is null and r.error_msg is not null),
           max(r.id)
      into v_total, v_timeouts, v_nova_marca
      from net._http_response r
     where r.id > v_marca;

    -- net._http_response e podada em 30 min. Sem carimbar o desfecho em
    -- cron_http_calls nao ha placar possivel: cada passada veria uma unica
    -- resposta solta e nao saberia dizer se aquele alvo respondeu ok 40 vezes
    -- antes. -1 = expirou (status_code nulo com erro de transporte).
    update public.cron_http_calls c
       set status_code = coalesce(r.status_code, -1),
           checked_at  = now()
      from net._http_response r
     where r.id = c.request_id
       and c.checked_at is null;

    for v_reg in
        select r.id, r.status_code, r.content, r.error_msg, r.created,
               c.alvo, c.origem,
               -- placar do MESMO alvo, lido de cron_http_calls (que guarda 26h)
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '2 hours'
                   and (x.status_code >= 400 or x.status_code = -1)) as falhas_2h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '2 hours'
                   and x.status_code between 200 and 399) as ok_2h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '24 hours'
                   and (x.status_code >= 400 or x.status_code = -1)) as falhas_24h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '24 hours'
                   and x.status_code between 200 and 399) as ok_24h,
               -- ordena por request_id, nao por created_at: `created_at` e o
               -- now() da TRANSACAO, entao duas chamadas do mesmo bloco empatam
               -- e o desempate vira arbitrario — foi assim que o teste inverso
               -- leu "ultima resposta: 404" depois de duas respostas ok. O id de
               -- net._http_response vem de sequence e e monotonico de verdade.
               (select x.status_code from public.cron_http_calls x
                 where x.alvo = c.alvo and x.status_code is not null
                 order by x.request_id desc limit 1) as ultimo_code
          from net._http_response r
          left join public.cron_http_calls c on c.request_id = r.id
         where r.id > v_marca
           and r.status_code is not null
           and r.status_code >= 400
         order by r.id
         limit v_limite
    loop
        -- 401/403 = a classe de defeito que ficou semanas invisivel: falha
        -- silenciosa, deterministica e total. Nunca entra abaixo de critica, e
        -- placar nenhum a rebaixa: chave errada nao melhora sozinha.
        --
        -- O RESTO passou a ser decidido pelo placar do alvo, nao pelo codigo
        -- HTTP. Motivo medido: 23/09 15:45, UM unico 502 de gateway em
        -- delivery-automation-worker virou 'alta' e foi ao telefone, enquanto o
        -- mesmo alvo tinha 119 chamadas ok na mesma janela. 502 isolado e
        -- tropeco de gateway; 502 sem nenhum sucesso em 24h e pane.
        v_http_sev := case
                          when v_reg.status_code in (401, 403)              then 'critica'
                          when v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3   then 'alta'
                          when v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0
                               and v_reg.ultimo_code between 200 and 399    then 'baixa'
                          else 'media'
                      end;
        v_sev := v_http_sev;

        v_http_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                         || ' resposta(s) ok nas ultimas 2h; em 24h, '
                         || v_reg.falhas_24h || ' falha(s) e ' || v_reg.ok_24h
                         || ' ok; ultima resposta: ' || coalesce(v_reg.ultimo_code::text, 'desconhecida')
                         || case
                                when v_reg.status_code in (401, 403)
                                    then '. Autenticacao recusada: nao e tropeco e nao melhora sozinho.'
                                when v_http_sev = 'alta'  then '. Nada respondeu ok em 24h: isto e pane.'
                                when v_http_sev = 'baixa' then '. Falha isolada com o alvo respondendo ok: tropeco de gateway.'
                                else '. Falhando de forma intermitente.'
                            end;

        v_alvo := coalesce(v_reg.alvo, 'http-desconhecido');

        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'cron-http:' || v_alvo,
                'route', 'HTTP ' || v_reg.status_code,
                'error_message', 'Chamada HTTP de job respondeu ' || v_reg.status_code
                                 || ': ' || left(coalesce(v_reg.content, v_reg.error_msg, '(sem corpo)'), 300),
                'error_description', case
                    when v_reg.alvo is null then
                        'Alvo desconhecido: net._http_response nao guarda a URL e esta requisicao nao passou por clinvia_http_post.'
                    else 'Disparado por ' || v_reg.origem || '. ' || v_http_placar
                end,
                'request_id', 'nethttp:' || v_reg.id,
                'http_code', v_reg.status_code,
                'started_at', v_reg.created,
                'context', jsonb_build_object(
                    'response_id', v_reg.id, 'origem', v_reg.origem,
                    'falhas_2h', v_reg.falhas_2h, 'ok_2h', v_reg.ok_2h,
                    'falhas_24h', v_reg.falhas_24h, 'ok_24h', v_reg.ok_24h,
                    'ultima_resposta', v_reg.ultimo_code,
                    'severidade_pelo_placar', v_http_sev)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_http_erros := v_http_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
            -- tropeco que virou pane: o incidente ja existe, so o piso sobe
            perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
        exception when others then
            raise warning '[cron_health] resposta %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- Piso de 20 respostas para nao alarmar com amostra minuscula.
    if v_total >= 20 and v_timeouts::numeric / v_total >= v_ratio then
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'cron-http:timeouts',
                'route', 'timeout_em_massa',
                'error_message', v_timeouts || ' de ' || v_total || ' chamadas HTTP de jobs expiraram nesta passada ('
                                 || round(100.0 * v_timeouts / v_total) || '%).',
                'error_description', 'Timeout isolado e normal no padrao fire-and-forget de 5s. Em massa significa edge function fora do ar ou banco travado.',
                'request_id', 'nethttp-timeout:' || v_nova_marca,
                'context', jsonb_build_object('timeouts', v_timeouts, 'total', v_total)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[cron_health] timeouts: %', sqlerrm;
        end;
    end if;

    -- ── B1. rajada: muitos jobs distintos caindo no mesmo minuto ─────────────
    -- Quantos minutos de rajada existem na janela. Um so = tropeco; varios =
    -- degradacao. E a unica coisa que separa 23/09 12:00 de 22/09 18:00-18:30.
    select count(*) into v_rajadas_jan
      from (
        select date_trunc('minute', d.start_time) as minuto
          from cron.job_run_details d
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         group by 1
        having count(distinct d.jobid) >= v_rajada_min
      ) s;

    for v_reg in
        select date_trunc('minute', d.start_time)                      as minuto,
               count(distinct d.jobid)                                 as jobs,
               count(*)                                                as runs,
               mode() within group (order by left(coalesce(d.return_message, 'sem mensagem'), 80)) as msg,
               string_agg(distinct coalesce(j.jobname, 'jobid ' || d.jobid), ', ' order by coalesce(j.jobname, 'jobid ' || d.jobid)) as nomes
          from cron.job_run_details d
          left join cron.job j on j.jobid = d.jobid
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         group by 1
        having count(distinct d.jobid) >= v_rajada_min
         order by 1
    loop
        v_sev := case when v_rajadas_jan >= 2 then 'alta' else 'media' end;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'cron-infra:rajada',
                -- a mensagem entra na rota: rajada de conexao e rajada de
                -- permissao sao panes diferentes, com donos diferentes.
                'route', left(v_reg.msg, 60),
                'error_message', v_reg.jobs || ' tarefas agendadas falharam no mesmo minuto ('
                                 || to_char(v_reg.minuto at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
                                 || ') com "' || left(v_reg.msg, 80) || '". Nao e defeito de nenhuma delas: '
                                 || left(v_reg.nomes, 240),
                'error_description', case
                    when v_rajadas_jan >= 2 then
                        v_rajadas_jan || ' minutos de rajada nas ultimas 2h: e degradacao, nao tropeco.'
                    else
                        'Minuto isolado nas ultimas 2h: tropeco de conexao que se curou sozinho.'
                end,
                -- uma abertura por minuto de rajada; reincidencia soma evento
                'request_id', 'cronburst:' || to_char(v_reg.minuto, 'YYYYMMDDHH24MI'),
                'started_at', v_reg.minuto,
                'context', jsonb_build_object(
                    'minuto', v_reg.minuto,
                    'jobs_distintos', v_reg.jobs,
                    'execucoes', v_reg.runs,
                    'minutos_de_rajada_na_janela', v_rajadas_jan,
                    'jobs', v_reg.nomes
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_rajadas := v_rajadas + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
            -- reincidencia escala: o incidente ja existe, o piso e que sobe
            perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
        exception when others then
            raise warning '[cron_health] rajada %: %', v_reg.minuto, sqlerrm;
        end;
    end loop;

    -- ── B2. o proprio cron falhou, fora de rajada ────────────────────────────
    -- Idempotente por runid, entao reler 2h a cada passada nao infla nada.
    for v_reg in
        with falhas as (
            select d.runid, d.jobid, d.status, d.return_message, d.start_time, d.end_time,
                   d.command, d.username, d.database,
                   date_trunc('minute', d.start_time) as minuto
              from cron.job_run_details d
             where d.start_time >= now() - interval '2 hours'
               and d.status is distinct from 'succeeded'
               and d.status is distinct from 'running'
        ),
        minutos as (
            select minuto, count(distinct jobid) as jobs_no_minuto
              from falhas group by minuto
        )
        select f.runid, f.jobid,
               -- sem cadastro o incidente ainda precisa de um nome estavel, senao
               -- cada passada abriria um componente novo
               coalesce(j.jobname, 'jobid-' || f.jobid) as jobname,
               (j.jobid is null)                        as sem_cadastro,
               j.schedule,
               -- `cron.job` some junto com o job, mas a EXECUCAO guarda comando,
               -- usuario e banco. Sem este coalesce o incidente que o left join
               -- resgata chegaria com '(sem comando)' — resgatado e mudo.
               coalesce(j.command,  f.command)  as command,
               coalesce(j.username, f.username) as username,
               coalesce(j.database, f.database) as database,
               f.status, f.return_message, f.start_time, f.end_time,
               -- placar do job na mesma janela que o varredor le
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_2h,
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status = 'succeeded') as ok_2h,
               -- 24h e o que separa tropeco de pane: job horario quebrado tem
               -- no maximo 2 falhas em 2h e pareceria inofensivo.
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '24 hours'
                   and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_24h,
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '24 hours'
                   and x.status = 'succeeded') as ok_24h,
               (select x.status from cron.job_run_details x
                 where x.jobid = f.jobid and x.status is distinct from 'running'
                 order by x.start_time desc limit 1) as status_mais_recente
          from falhas f
          join minutos m on m.minuto = f.minuto
          -- left: `cron.job` perde a linha quando o job e removido, e o join
          -- interno apagava junto todo o historico de falha dele.
          left join cron.job j on j.jobid = f.jobid
         where m.jobs_no_minuto < v_rajada_min   -- rajada ja virou um incidente so
         order by f.start_time
         limit v_limite
    loop
        -- duracao em ms: "connection failed" em 2ms e pool esgotado, em 30s e
        -- banco inacessivel. A mensagem do Postgres e a mesma nos dois casos.
        v_dur_ms := case
                        when v_reg.end_time is null then null
                        else greatest(0, round(extract(epoch from (v_reg.end_time - v_reg.start_time)) * 1000))::integer
                    end;

        -- Job sem cadastro cuja falha e de mais de 30 min atras ja foi embora:
        -- relatar e util (fica o rastro), acordar alguem nao.
        v_orfao_morto := v_reg.sem_cadastro
                         and v_reg.start_time < now() - interval '30 minutes';

        -- O placar deixou de ser enfeite: e ele que decide a severidade.
        v_sev := case
                     when v_orfao_morto                              then 'baixa'
                     when v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3 then 'alta'
                     when v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0
                          and v_reg.status_mais_recente = 'succeeded'  then 'baixa'
                     else 'media'
                 end;

        v_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                    || ' execucao(oes) ok nas ultimas 2h; em 24h, '
                    || v_reg.falhas_24h || ' falha(s) e ' || v_reg.ok_24h || ' ok; ultima execucao: '
                    || coalesce(v_reg.status_mais_recente, 'desconhecida')
                    || case
                           when v_orfao_morto   then '. Este job NAO existe mais em cron.job e a falha e de mais de 30 min atras: relato historico, sem acao.'
                           when v_sev = 'alta'  then '. Nada funcionou em 24h: isto e pane.'
                           when v_sev = 'baixa' then '. Falha isolada e o job voltou a rodar: tropeco.'
                           else '. Falhando de forma intermitente.'
                       end
                    || case
                           when v_reg.sem_cadastro and not v_orfao_morto
                               then ' ATENCAO: executou agora ha pouco mas NAO aparece em cron.job — ou foi removido no meio da pane, ou pertence a outro dono e o RLS o esconde.'
                           else ''
                       end;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'cron:' || v_reg.jobname,
                -- status + inicio da mensagem: 'connection failed' e
                -- 'permission denied' do mesmo job sao incidentes diferentes.
                'route', v_reg.status || ':' || left(coalesce(v_reg.return_message, 'sem mensagem'), 60),
                'error_message', left(coalesce(v_reg.return_message, 'job terminou com status ' || v_reg.status), 400)
                                 || case when v_dur_ms is null then '' else ' (tentativa durou ' || v_dur_ms || 'ms)' end
                                 || '. Comando: ' || left(coalesce(v_reg.command, '(sem comando)'), 240),
                'error_description', v_placar,
                'request_id', 'cronrun:' || v_reg.runid,
                'started_at', v_reg.start_time,
                'context', jsonb_build_object(
                    'jobid', v_reg.jobid,
                    'schedule', v_reg.schedule,
                    'duracao_ms', v_dur_ms,
                    'falhas_2h', v_reg.falhas_2h,
                    'ok_2h', v_reg.ok_2h,
                    'falhas_24h', v_reg.falhas_24h,
                    'ok_24h', v_reg.ok_24h,
                    'ultima_execucao', v_reg.status_mais_recente,
                    'severidade_pelo_placar', v_sev,
                    'sem_cadastro_em_cron_job', v_reg.sem_cadastro,
                    'orfao_ja_morto', v_orfao_morto,
                    'db_user', v_reg.username,
                    'db_name', v_reg.database
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_cron_erros := v_cron_erros + 1;
                if v_reg.sem_cadastro then
                    v_orfaos := v_orfaos + 1;
                end if;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
                -- tropeco que virou pane: o incidente ja existe, so o piso sobe
                perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
        exception when others then
            raise warning '[cron_health] run %: %', v_reg.runid, sqlerrm;
        end;
    end loop;

    -- ── C. job de minuto que parou de rodar ──────────────────────────────────
    -- Sem execucao nao ha linha em lugar nenhum: este e o unico sinal possivel.
    -- So jobs sub-horarios (`*` ou `*/n` no campo de minuto) entram, senao um
    -- job diario acusaria parada 23 horas por dia.
    insert into public.cron_health_seen (jobid, jobname)
    select j.jobid, j.jobname from cron.job j
    on conflict (jobid) do nothing;

    delete from public.cron_health_seen s
     where not exists (select 1 from cron.job j where j.jobid = s.jobid);

    for v_reg in
        select j.jobid, j.jobname, j.schedule,
               (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima,
               s.first_seen
          from cron.job j
          join public.cron_health_seen s on s.jobid = j.jobid
         where j.active
           and j.schedule ~ '^\*(/[0-9]+)? '
           -- carencia: job recem-criado ainda nao teve chance de rodar
           and s.first_seen < now() - interval '2 hours'
    loop
        if v_reg.ultima is null or v_reg.ultima < now() - interval '2 hours' then
            begin
                v_res := public.incident_record(jsonb_build_object(
                    'origem', 'cron',
                    'source', 'db_job',
                    'component', 'cron:' || v_reg.jobname,
                    'route', 'parado',
                    'error_message', 'Job ativo de schedule "' || v_reg.schedule
                                     || '" nao executa desde ' || coalesce(v_reg.ultima::text, 'nunca') || '.',
                    -- uma abertura por hora por job, senao repete a cada 5 min
                    'request_id', 'cronstop:' || v_reg.jobid || ':' || to_char(now(), 'YYYYMMDDHH24'),
                    'context', jsonb_build_object('jobid', v_reg.jobid, 'schedule', v_reg.schedule)
                ));
                if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                    v_parados := v_parados + 1;
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'critica');
                end if;
            exception when others then
                raise warning '[cron_health] parado %: %', v_reg.jobname, sqlerrm;
            end;
        end if;
    end loop;

    -- ── D. avanca a marca e poda o registro de chamadas ──────────────────────
    -- A marca avanca mesmo quando o `limit` cortou linhas: o corte so acontece
    -- acima de 300 erros numa janela de 5 min, cenario em que perder as ultimas
    -- e irrelevante — o incidente ja abriu e o event_count ja esta gritando.
    update public.llm_platform_settings
       set cron_health_last_response_id = greatest(coalesce(cron_health_last_response_id, 0), coalesce(v_nova_marca, 0)),
           cron_health_last_run_at = now();

    -- 26h, nao 2h: o placar de 24h do bloco A le desta tabela.
    delete from public.cron_http_calls where created_at < now() - interval '26 hours';

    return jsonb_build_object(
        'ok', true,
        'respostas_lidas', v_total,
        'marca', greatest(v_marca, coalesce(v_nova_marca, 0)),
        'incidentes', jsonb_build_object(
            'http_erro', v_http_erros,
            'timeouts_na_passada', v_timeouts,
            'cron_falhou', v_cron_erros,
            'cron_sem_cadastro', v_orfaos,
            'cron_rajada', v_rajadas,
            'minutos_de_rajada_na_janela', v_rajadas_jan,
            'cron_parado', v_parados
        )
    );
end;
$function$;
