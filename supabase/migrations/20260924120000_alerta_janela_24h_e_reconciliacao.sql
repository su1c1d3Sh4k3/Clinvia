-- 20260924120000 — o alerta parou de chegar e o painel dizia que tinha chegado.
--
-- O QUE ACONTECEU (24/09/2026)
-- Ultima resposta do destinatario: 22/09 16:58 SP. A janela de 24h da Meta
-- fechou em 23/09 16:58. A partir dai TODO alerta saiu como TEXTO LIVRE, e a
-- Meta respondeu HTTP 200 com wamid de verdade — para so depois falhar a
-- mensagem por webhook assincrono com {"code":131047,"title":"Re-engagement
-- message"}. 13 wamids assim nos logs, e os 13 estao gravados como 'sent' em
-- incident_notifications. O telefone mudo por ~19h com o painel verde.
--
-- Tres defeitos independentes, cada um suficiente sozinho:
--
--   1. O 200 sincrono da Meta NAO e prova de entrega. alert-notify tratava como
--      prova, entao `livre.ok` era verdadeiro, o fallback de template nunca
--      rodava e a segunda via por e-mail (que so existe no ramo de falha)
--      tambem nao. Os templates sys_alerta_incidente_v2 / sys_alerta_resumo_v2
--      estao APROVADOS na WABA desde 22/09 — o caminho que funciona fora da
--      janela existia e nunca foi tomado.
--
--   2. Nada reconciliava o wamid do alerta. alert-notify fala direto com o
--      Graph e de proposito nao cria linha em `messages`, entao
--      webhook-handle-status nao tem em que casar a falha assincrona: ela cai
--      no chao. Consequencia em cadeia: canal_alertas_scan procura por
--      status='failed' e so via 'sent', logo o detector de canal mudo — feito
--      exatamente para este caso — ficou calado.
--
--   3. Ninguem sabia se a janela estava aberta. Era possivel saber: toda
--      resposta dele chega pelo meta-webhook.
--
-- O QUE ESTA MIGRATION FAZ
--   (a) alert_recipients.last_inbound_at — quando o destinatario respondeu pela
--       ultima vez. Backfill a partir de `messages`. alert-notify usa isto para
--       ESCOLHER o caminho ANTES de enviar, em vez de descobrir depois.
--   (b) incident_notifications.delivered_at — confirmacao real de entrega.
--       'sent' passa a significar "a Meta aceitou"; entregue e outra coluna.
--   (c) alert_notification_status() — o meta-webhook casa o wamid e fecha o
--       ciclo: falha vira 'failed' de verdade e o incidente VOLTA para a fila.
--   (d) alert_recipient_inbound() — reabre a janela quando ele responde.
--   (e) canal_alertas_scan ganha o motivo `sem_confirmacao`: aceito pela Meta e
--       nunca entregue. E o sintoma exato deste incidente; sem ele o detector
--       so pegaria o caso depois da reconciliacao.
--
-- AUTOCORRECAO: se o 131047 chegar mesmo assim, a propria reconciliacao zera o
-- last_inbound_at. O rastreamento pode errar uma vez; nao pode errar sempre.

begin;

-- ── (a) janela do destinatario ───────────────────────────────────────────────

alter table public.alert_recipients
    add column if not exists last_inbound_at timestamptz;

comment on column public.alert_recipients.last_inbound_at is
    'Ultima mensagem RECEBIDA deste telefone. Define a janela de 24h da Meta: '
    'dentro dela o alerta sai como texto livre (layout completo), fora dela sai '
    'como template aprovado. NULL = trata como fechada (template).';

-- Backfill: a resposta dele ja esta em `messages`, so nunca foi lida daqui.
-- Casamento pelos ultimos 8 digitos, que e a regra de identidade de contato do
-- projeto (DDD e formato variam, os 8 finais nao). Recorte de 30 dias porque
-- resposta mais velha que isso significa janela fechada de qualquer jeito, e
-- NULL ja e o valor seguro — nao vale varrer `messages` inteira por ele.
update public.alert_recipients r
   set last_inbound_at = sub.ultima
  from (
    select right(regexp_replace(rr.telefone, '\D', '', 'g'), 8) as last8,
           max(m.created_at) as ultima
      from public.alert_recipients rr
      join public.contacts c
        on c.number like '%' || right(regexp_replace(rr.telefone, '\D', '', 'g'), 8) || '%'
      join public.conversations cv on cv.contact_id = c.id
      join public.messages m on m.conversation_id = cv.id
     where m.direction = 'inbound'
       and m.created_at > now() - interval '30 days'
     group by 1
  ) sub
 where right(regexp_replace(r.telefone, '\D', '', 'g'), 8) = sub.last8
   and r.last_inbound_at is null;

-- ── (b) entrega confirmada ───────────────────────────────────────────────────

alter table public.incident_notifications
    add column if not exists delivered_at timestamptz;

comment on column public.incident_notifications.delivered_at is
    'Confirmacao de ENTREGA vinda do webhook de status da Meta. status=''sent'' '
    'significa apenas que a Meta ACEITOU o envio (200 + wamid) — ela ainda pode '
    'falhar a mensagem depois, de forma assincrona (131047 fora da janela de '
    '24h, 131048 spam). Sem esta coluna nao ha como distinguir aceito de '
    'entregue, e foi assim que o canal ficou mudo por 19h com o painel verde.';

create index if not exists idx_incident_notifications_wamid
    on public.incident_notifications (wamid)
 where wamid is not null;

-- ── (c) reconciliacao do wamid ───────────────────────────────────────────────

create or replace function public.alert_notification_status(
    p_wamid         text,
    p_status        text,
    p_error_code    text default null,
    p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_id        uuid;
    v_incidente uuid;
    v_recipient uuid;
begin
    if nullif(trim(coalesce(p_wamid, '')), '') is null then
        return false;
    end if;

    if p_status in ('delivered', 'read') then
        update public.incident_notifications
           set delivered_at = coalesce(delivered_at, now())
         where wamid = p_wamid
        returning id into v_id;
        return v_id is not null;
    end if;

    if p_status <> 'failed' then
        return false;
    end if;

    -- `status = 'sent'` no WHERE e o que torna isto idempotente: a Meta reenvia
    -- o mesmo status, e sem o filtro cada reenvio devolveria o incidente para a
    -- fila de novo, em laco.
    update public.incident_notifications
       set status        = 'failed',
           error_code    = coalesce(nullif(p_error_code, ''), error_code),
           error_message = coalesce(nullif(p_error_message, ''), error_message)
     where wamid = p_wamid
       and status = 'sent'
    returning id, incident_id, recipient_id
         into v_id, v_incidente, v_recipient;

    if v_id is null then
        return false;
    end if;

    -- 131047 = a janela de 24h estava fechada e nos achavamos que nao.
    -- Zera o relogio do destinatario: na proxima tentativa o alerta ja sai como
    -- template. E a autocorrecao — o rastreamento pode errar uma vez, nao sempre.
    if p_error_code = '131047' and v_recipient is not null then
        update public.alert_recipients
           set last_inbound_at = null, updated_at = now()
         where id = v_recipient;
    end if;

    -- Devolve o incidente para a fila. O despacho roda de minuto em minuto e
    -- vai retentar — agora pelo caminho certo. Sem isto o incidente continuaria
    -- contabilizado como notificado e o aviso morreria aqui.
    if v_incidente is not null then
        update public.incidents
           set notified_count        = greatest(0, coalesce(notified_count, 0) - 1),
               notify_claimed_at     = null,
               notify_next_attempt_at = now(),
               notify_last_error     = 'Meta recusou de forma assincrona: '
                                    || coalesce(p_error_code, '?') || ' '
                                    || coalesce(left(p_error_message, 200), ''),
               updated_at            = now()
         where id = v_incidente;
    end if;

    return true;
end;
$$;

revoke all on function public.alert_notification_status(text, text, text, text)
    from public, anon, authenticated;
grant execute on function public.alert_notification_status(text, text, text, text)
    to service_role;

-- ── (d) a janela reabre quando ele responde ──────────────────────────────────

create or replace function public.alert_recipient_inbound(p_telefone text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_last8 text := right(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 8);
begin
    if length(v_last8) < 8 then
        return false;
    end if;

    update public.alert_recipients
       set last_inbound_at = now(), updated_at = now()
     where right(regexp_replace(telefone, '\D', '', 'g'), 8) = v_last8;

    return found;
end;
$$;

revoke all on function public.alert_recipient_inbound(text) from public, anon, authenticated;
grant execute on function public.alert_recipient_inbound(text) to service_role;

-- ── (e) detector: aceito e nunca entregue ────────────────────────────────────
--
-- Motivo novo, e o unico que teria pego ESTE incidente no momento em que ele
-- comecou: a Meta aceitou, nada voltou como falha e nada foi entregue. Os tres
-- motivos antigos exigiam que alguem ja soubesse da falha.

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
    v_mudos     integer := 0;
    v_mudo_min  integer;
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

    -- (d) aceito pela Meta e nunca entregue.
    -- 15 min de carencia: a confirmacao de entrega costuma voltar em segundos,
    -- mas celular desligado atrasa legitimamente. Abaixo disso viraria alarme
    -- falso toda vez que ele estivesse sem sinal.
    select count(*),
           max((extract(epoch from (now() - n.sent_at)) / 60)::int)
      into v_mudos, v_mudo_min
      from public.incident_notifications n
     where n.via = 'whatsapp'
       and n.status = 'sent'
       and n.delivered_at is null
       and n.sent_at <= now() - interval '15 minutes'
       and n.sent_at >= now() - make_interval(hours => v_horas);

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
    elsif v_mudos > 0 then
        v_motivo  := 'sem_confirmacao';
        v_detalhe := v_mudos || ' alerta(s) aceito(s) pela Meta nas ultimas ' || v_horas
                  || 'h sem NENHUMA confirmacao de entrega (o mais antigo ha '
                  || coalesce(v_mudo_min, 0) || ' min). A Meta devolve 200 com wamid '
                  || 'e falha a mensagem depois: aceito nao e entregue.';
    end if;

    if v_motivo is null then
        return jsonb_build_object('mudo', false, 'motivo', 'canal_respondendo');
    end if;

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
                                'sucessos_janela', v_saiu,
                                'sem_confirmacao', v_mudos)
    ));
    v_incidente := nullif(v_res ->> 'incident_id', '')::uuid;

    if v_incidente is not null then
        update public.incidents
           set notify_claimed_at = now(), updated_at = now()
         where id = v_incidente;
    end if;

    select not exists (
        select 1 from public.incident_notifications n
         where n.kind = 'canal' and n.via = 'email' and n.status = 'sent'
           and n.sent_at >= now() - make_interval(mins => v_cooldown)
    ) into v_pendente;

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

commit;
