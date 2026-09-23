-- Calibragem do detector de canal mudo, achada pela propria prova com falha
-- injetada (23/09/2026).
--
-- O QUE A PROVA MOSTROU: um unico despacho atingiu dois destinatarios. Um saiu
-- (`sent`), o outro foi recusado pela Meta (131009, numero invalido de
-- proposito). O sintoma `meta_recusou` olhava so as recusas e declarou o canal
-- MUDO — com o canal funcionando e a mensagem no telefone do Super Admin.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE: este vigia existe para ser acreditado
-- no pior dia do ano. Alerta que grita quando esta tudo bem e alerta que sera
-- ignorado quando nao estiver — e ai o silencio volta a ser indistinguivel de
-- "esta tudo bem", que e o defeito original.
--
-- A CORRECAO: recusa so vira "canal mudo" se NADA tiver saido na mesma janela.
-- Havendo sucesso, o problema e daquele destinatario (numero errado, bloqueado),
-- nao do canal — e disso ja ha rastro na linha `failed` do painel.
--
-- Nada mais muda: `fila_parada` e `sem_saida` seguem iguais, e este ultimo ja
-- nascera com a regra certa (tentou e NENHUMA saiu).

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
$$;

revoke all on function public.canal_alertas_scan() from public, anon, authenticated;
grant execute on function public.canal_alertas_scan() to service_role;
