-- Caminho alternativo por e-mail + detector do canal mudo.
--
-- O PROBLEMA: todo alerta desta plataforma sai por UM canal — o WhatsApp da
-- conta Bruno Admin, pela Graph API. Se esse canal cai, o incidente que avisa
-- que ele caiu tambem sai por ele. Circular. Hoje, com o canal mudo, ninguem
-- descobre nada: os incidentes se acumulam no painel e o telefone fica em
-- silencio, que e indistinguivel de "esta tudo bem".
--
-- O QUE ESTA MIGRATION FAZ:
--   1. da um ENDERECO DE E-MAIL ao destinatario de alerta (a tabela nao tinha);
--   2. registra o MEIO de cada notificacao (`via` = whatsapp | email), senao o
--      painel nao distingue "saiu pelo WhatsApp" de "saiu pelo e-mail porque o
--      WhatsApp recusou";
--   3. cria o DETECTOR do canal mudo (`canal_alertas_scan`), que roda a cada
--      15 min e nao depende do WhatsApp para nada;
--   4. agenda o vigia `alert-channel-watch`, que le o detector e entrega por
--      e-mail — caminho que NAO passa pela Meta.
--
-- DE PROPOSITO NAO FAZ: nao desliga o WhatsApp nem muda a ordem de tentativa.
-- E-mail e SEGUNDA via, nunca a primeira: o WhatsApp acorda de madrugada e o
-- e-mail nao.

-- ── 1. endereco de e-mail do destinatario ────────────────────────────────────

alter table public.alert_recipients
    add column if not exists email text;

comment on column public.alert_recipients.email is
    'Segunda via do alerta. Usada SO quando o envio pelo WhatsApp falha e quando '
    'o detector do canal mudo dispara. Nulo = esta pessoa nao tem caminho '
    'alternativo, e o alerta dela morre junto com o canal.';

-- O unico destinatario cadastrado hoje. Guardado pelo telefone para nao pintar
-- um e-mail em cima de alguem que entre depois.
update public.alert_recipients
   set email = 'bruhdias09@gmail.com', updated_at = now()
 where telefone = '5537920001025'
   and email is null;

-- ── 2. a notificacao passa a dizer por onde saiu ─────────────────────────────

alter table public.incident_notifications
    add column if not exists via text not null default 'whatsapp';

alter table public.incident_notifications
    drop constraint if exists incident_notifications_via_check;
alter table public.incident_notifications
    add constraint incident_notifications_via_check
    check (via in ('whatsapp', 'email'));

-- `canal` e o aviso do proprio canal mudo: nao pertence a nenhum incidente de
-- produto, e o monitoramento falando de si mesmo.
alter table public.incident_notifications
    drop constraint if exists incident_notifications_kind_check;
alter table public.incident_notifications
    add constraint incident_notifications_kind_check
    check (kind in ('individual', 'resumo', 'recorrencia', 'canal'));

-- DEFEITO LATENTE CORRIGIDO AQUI: `alert-notify` grava `skipped_severity`
-- quando ninguem pediu para ser avisado naquela severidade, mas esse valor
-- NUNCA esteve na restricao — o insert falhava com 23514 e o erro era
-- descartado (o retorno do insert nao e conferido). Resultado: o painel nao
-- tinha registro nenhum desse caso.
alter table public.incident_notifications
    drop constraint if exists incident_notifications_status_check;
alter table public.incident_notifications
    add constraint incident_notifications_status_check
    check (status in ('sent', 'failed', 'skipped_window', 'skipped_ratelimit', 'skipped_severity'));

-- ── 3. chaves de desligar ────────────────────────────────────────────────────

alter table public.llm_platform_settings
    add column if not exists alert_email_enabled boolean not null default true,
    add column if not exists canal_mudo_enabled boolean not null default true,
    add column if not exists canal_mudo_atraso_min integer not null default 30,
    add column if not exists canal_mudo_horas integer not null default 6,
    add column if not exists canal_mudo_cooldown_min integer not null default 60;

comment on column public.llm_platform_settings.alert_email_enabled is
    'Segunda via por e-mail quando o WhatsApp recusa. Desligar aqui deixa o '
    'alerta morrer no canal unico — so faz sentido se o e-mail estiver gerando '
    'spam.';
comment on column public.llm_platform_settings.canal_mudo_atraso_min is
    'Minutos que uma critica/alta pode ficar na fila sem sair antes do canal ser '
    'declarado mudo. O despacho roda de minuto em minuto; 30 min de fila e '
    'defeito, nao lentidao.';
comment on column public.llm_platform_settings.canal_mudo_horas is
    'Janela do segundo criterio: houve tentativa de envio e NENHUMA deu certo '
    'neste periodo.';

-- ── 4. o detector ────────────────────────────────────────────────────────────
--
-- Tres sintomas, em ordem de certeza. Nao ha heartbeat cego ("nada saiu em N
-- horas") porque dia calmo tambem nao tem envio: silencio so e defeito quando
-- havia o que dizer.
--
--   meta_recusou  a Meta devolveu erro numa tentativa recente. Certeza total.
--   fila_parada   existe critica/alta viva que nasceu ha >= N min e nunca saiu.
--   sem_saida     houve tentativa na janela e NENHUMA foi bem-sucedida.
--
-- Roda em SQL puro: se dependesse de uma edge function para detectar, teria o
-- mesmo ponto unico de falha que veio consertar.

create or replace function public.canal_alertas_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado    boolean;
    v_atraso    integer;
    v_horas     integer;
    v_cooldown  integer;
    v_recusas   integer := 0;
    v_recusa    text;
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

    -- (a) a Meta recusou
    select count(*), max(coalesce(n.error_message, n.error_code))
      into v_recusas, v_recusa
      from public.incident_notifications n
     where n.status = 'failed'
       and n.via = 'whatsapp'
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

    if v_recusas > 0 then
        v_motivo  := 'meta_recusou';
        v_detalhe := v_recusas || ' envio(s) recusado(s) pela Meta nos ultimos '
                  || v_cooldown || ' min. Ultimo erro: ' || coalesce(v_recusa, 'sem detalhe');
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
$$;

revoke all on function public.canal_alertas_scan() from public, anon, authenticated;
grant execute on function public.canal_alertas_scan() to service_role;

-- ── 5. fechamento do ciclo do e-mail ─────────────────────────────────────────

create or replace function public.canal_alertas_email_done(
    p_incident_id  uuid,
    p_recipient_id uuid,
    p_ok           boolean,
    p_erro         text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    insert into public.incident_notifications (
        incident_id, recipient_id, kind, via, status, error_message
    ) values (
        p_incident_id, p_recipient_id, 'canal', 'email',
        case when p_ok then 'sent' else 'failed' end,
        nullif(p_erro, '')
    );

    -- So encerra o ciclo do incidente se o e-mail REALMENTE saiu. Se falhou,
    -- a reserva de 5 min expira e o despacho normal ainda tenta pelo WhatsApp —
    -- que pode ter voltado nesse meio tempo.
    if p_ok and p_incident_id is not null then
        perform public.incident_notification_done(
            p_incident_id := p_incident_id,
            p_ok          := true,
            p_event_count := (select event_count from public.incidents where id = p_incident_id),
            p_error       := null
        );
    end if;
end;
$$;

revoke all on function public.canal_alertas_email_done(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.canal_alertas_email_done(uuid, uuid, boolean, text) to service_role;

-- ── 6. o vigia ───────────────────────────────────────────────────────────────

create or replace function public.invoke_alert_channel_watch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'alert-channel-watch',
        p_origem  := 'cron:alert-channel-watch',
        p_url     := v_url || '/functions/v1/alert-channel-watch',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('action', 'scan')
    );
exception when others then
    raise warning 'invoke_alert_channel_watch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_channel_watch() from public, anon, authenticated;
grant execute on function public.invoke_alert_channel_watch() to service_role;

select cron.unschedule('alert-channel-watch')
 where exists (select 1 from cron.job where jobname = 'alert-channel-watch');

select cron.schedule('alert-channel-watch', '*/15 * * * *',
                     $$select public.invoke_alert_channel_watch()$$);

-- ── 7. o catalogo deixa de mentir ────────────────────────────────────────────
-- A linha nasceu em 20260923360000 com o aviso de que o caminho alternativo
-- ainda nao existia. Existe agora.

update public.incident_component_catalog
   set descricao = 'Caminho unico pelo qual TODO alerta desta plataforma sai: o numero '
                || 'WhatsApp da conta Bruno Admin, pela Graph API da Meta. Se ele para, '
                || 'nenhum incidente critico chega ao telefone.',
       acao_padrao = 'Este aviso chegou por E-MAIL porque o WhatsApp nao respondeu. '
                || 'Confira, nesta ordem: (1) o token da instancia meta-488512407686498 '
                || 'no painel de conexoes; (2) a qualidade/limite do numero na Meta '
                || '(recusa por qualidade derruba o envio sem avisar); (3) o painel de '
                || 'incidentes, onde tudo continua sendo registrado mesmo com o canal mudo.',
       updated_at = now()
 where component = 'canal:whatsapp-alertas';
