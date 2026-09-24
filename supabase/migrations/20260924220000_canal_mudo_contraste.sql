-- O detector do canal mudo gritava com o canal funcionando (24/09/2026).
--
-- O QUE ELE RELATOU: "6 mensagens aceitas pela Meta em 6h sem nenhuma
-- confirmacao de entrega" — enquanto os alertas do dia chegavam normalmente no
-- telefone dele. Ele mandou desconfiar do detector, nao do canal. Estava certo.
--
-- O QUE A MEDICAO MOSTROU, em ordem:
--
--   1. O webhook de status da Meta EXISTE, esta inscrito e chega. A assinatura
--      da WABA 497613820103663 aponta para `.../functions/v1/meta-webhook`, e so
--      no dia 24/09 entraram 1.376 recibos `delivered` e 236 `read` na tabela
--      `messages`. Nunca houve buraco aqui.
--
--   2. O que nao existia era a RECONCILIACAO DO ALERTA. O alerta nao passa por
--      `messages` — `alert-notify` fala direto com o Graph —, entao ate ontem
--      nada casava o recibo com `incident_notifications`. Isso foi consertado
--      em `20260924120000`, que entrou em producao as 12:21 de hoje.
--
--   3. A partir de 12:21 TODA notificacao de WhatsApp foi confirmada, em 2 a 18
--      segundos. As 44 anteriores nunca serao: elas sao de antes do reconciliador
--      existir e a Meta nao reenvia recibo. Ficaram presas numa janela deslizante
--      de 6h alimentando o detector de hora em hora.
--
--   4. Nenhuma mensagem se perdeu. As 6 do alerta eram exatamente as 6 linhas
--      pre-12:21 que ainda estavam dentro da janela as 14:15.
--
-- Ou seja: o conserto era receber e gravar o status — e ja foi feito. O que falta
-- e o detector parar de ler ausencia de recibo antigo como canal mudo.
--
-- DOIS CONSERTOS, e o segundo e uma regressao minha:
--
--   (d) `sem_confirmacao` passa a exigir CONTRASTE: so acusa se, na mesma janela,
--       NENHUMA notificacao foi confirmada. Uma unica confirmacao prova a cadeia
--       inteira de pe (envio -> Meta -> webhook -> reconciliacao), e nesse caso o
--       que falta e outra coisa, nao o canal. Passa a exigir tambem `wamid not
--       null`: sem wamid nao existe chave para o recibo casar, entao contar essa
--       linha e contar uma ausencia que nao depende do canal.
--
--   (a) `meta_recusou` RECUPERA a guarda `v_ok_recente`, que `20260923380000`
--       tinha adicionado e que a minha re-emissao de ontem (`20260924120000`)
--       apagou sem querer. E literalmente o mesmo defeito do ramo (d): contar o
--       que falhou e ignorar o que deu certo na mesma janela. Reescrever um corpo
--       grande a partir da versao errada e a forma mais facil de desfazer, em
--       silencio, a correcao da vespera — por isso o teste de acesso desta
--       migration fixa as DUAS guardas, e nao so a de hoje.
--
-- Nada muda no envio. Nenhuma linha historica e reescrita: as 44 sem confirmacao
-- ficam como estao (inventar um `delivered_at` que nunca aconteceu seria mentir
-- no unico lugar onde a gente mede honestidade de entrega); elas simplesmente
-- deixam de ser lidas como prova de canal mudo.

begin;

create or replace function public.canal_alertas_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado      boolean;
    v_atraso      integer;
    v_horas       integer;
    v_cooldown    integer;
    v_recusas     integer := 0;
    v_recusa      text;
    v_ok_recente  integer := 0;
    v_presas      integer := 0;
    v_preso       text;
    v_min         integer;
    v_tentou      integer := 0;
    v_saiu        integer := 0;
    v_mudos       integer := 0;
    v_mudo_min    integer;
    v_confirmados integer := 0;
    v_motivo      text := null;
    v_detalhe     text := null;
    v_rec         record;
    v_res         jsonb;
    v_incidente   uuid;
    v_pendente    boolean;
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

    -- (a) a Meta recusou — E nenhum envio deu certo no mesmo periodo.
    -- Um despacho atinge varios destinatarios: um numero invalido recusado nao
    -- diz nada sobre o canal se a mensagem chegou no telefone do Super Admin na
    -- mesma janela. Uma leitura so, duas contagens — janelas diferentes daria
    -- resultado diferente.
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

    -- (d) aceito pela Meta e nunca entregue — E nada entregue na mesma janela.
    --
    -- Tres condicoes, cada uma comprada com um falso positivo:
    --
    --   * 15 min de carencia: a confirmacao volta em segundos, mas celular
    --     desligado atrasa legitimamente.
    --   * `wamid is not null`: sem wamid nao ha chave para o recibo casar. Essa
    --     linha nunca sera confirmada por motivo que nao e do canal.
    --   * `v_confirmados = 0`: o contraste. Uma unica confirmacao na janela prova
    --     envio, Meta, webhook e reconciliacao funcionando. Sem isso o detector
    --     le como canal mudo qualquer residuo que nunca teve reconciliador.
    select count(*) filter (where n.delivered_at is null
                              and n.sent_at <= now() - interval '15 minutes'),
           max((extract(epoch from (now() - n.sent_at)) / 60)::int)
               filter (where n.delivered_at is null
                         and n.sent_at <= now() - interval '15 minutes'),
           count(*) filter (where n.delivered_at is not null)
      into v_mudos, v_mudo_min, v_confirmados
      from public.incident_notifications n
     where n.via = 'whatsapp'
       and n.status = 'sent'
       and n.wamid is not null
       and n.sent_at >= now() - make_interval(hours => v_horas);

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
    elsif v_mudos > 0 and v_confirmados = 0 then
        v_motivo  := 'sem_confirmacao';
        v_detalhe := v_mudos || ' alerta(s) aceito(s) pela Meta nas ultimas ' || v_horas
                  || 'h e NENHUM confirmado no mesmo periodo (o mais antigo ha '
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
                                'entregues_janela_curta', v_ok_recente,
                                'presos', v_presas,
                                'tentativas_janela', v_tentou,
                                'sucessos_janela', v_saiu,
                                'sem_confirmacao', v_mudos,
                                'confirmados_janela', v_confirmados)
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
