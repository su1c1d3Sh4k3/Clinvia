-- Rollback de 20260924220000_canal_mudo_contraste.sql
--
-- Devolve `canal_alertas_scan` ao corpo que estava em producao antes: sem o
-- contraste no ramo (d) e sem a guarda `v_ok_recente` no ramo (a).
--
-- ATENCAO: este rollback REINTRODUZ DOIS FALSOS POSITIVOS CONHECIDOS. Nao e um
-- estado neutro, e o estado do qual a gente saiu de proposito:
--
--   * `sem_confirmacao` volta a acusar canal mudo por causa de notificacao
--     antiga que nunca teve reconciliador — com o canal funcionando e as
--     mensagens chegando no telefone. Foi exatamente o alerta falso de 24/09.
--   * `meta_recusou` volta a olhar so as recusas e ignorar os envios entregues
--     na mesma janela — o falso positivo medido em 23/09.
--
-- So rode isto se o contraste estiver ESCONDENDO uma falha real de canal, e nesse
-- caso o certo e ajustar a condicao, nao voltar atras nas duas.

begin;

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
