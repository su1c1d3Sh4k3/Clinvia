-- Contraste no detector do canal mudo (24/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- Este teste existe por um motivo especifico: a guarda do ramo (a) foi adicionada
-- em 23/09 e APAGADA em 24/09 por uma re-emissao do corpo inteiro a partir da
-- versao errada. Ninguem percebeu porque o detector nao quebra — ele volta a
-- mentir, que e pior. As checagens 1 a 4 amarram as duas guardas ao texto da
-- funcao justamente para que a proxima re-emissao falhe aqui, e nao no telefone.
--
-- As checagens 5 a 8 provam o estado de fato: o webhook de status chega, a
-- reconciliacao funciona desde 12:21, e o detector esta calado.

with
-- 1. Ramo (a): recusa so conta se NADA saiu na mesma janela.
c1 as (
    select 1 as ord,
           'ramo (a) meta_recusou exige v_ok_recente = 0' as checagem,
           case when pg_get_functiondef(p.oid) ~ 'v_recusas > 0 and v_ok_recente = 0'
                then 'ok' else 'FALHOU — a guarda de 23/09 sumiu de novo' end as resultado,
           '' as detalhe
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'canal_alertas_scan' and p.prokind = 'f'
),
-- 2. Ramo (d): ausencia de recibo so conta se NADA foi confirmado na mesma janela.
c2 as (
    select 2, 'ramo (d) sem_confirmacao exige v_confirmados = 0',
           case when pg_get_functiondef(p.oid) ~ 'v_mudos > 0 and v_confirmados = 0'
                then 'ok' else 'FALHOU' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'canal_alertas_scan' and p.prokind = 'f'
),
-- 3. Ramo (d): linha sem wamid nao pode ser contada — nao ha chave para o recibo
--    casar, entao a ausencia dela nao diz nada sobre o canal.
c3 as (
    select 3, 'ramo (d) ignora notificacao sem wamid',
           case when pg_get_functiondef(p.oid) ~ 'n\.wamid is not null'
                then 'ok' else 'FALHOU' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'canal_alertas_scan' and p.prokind = 'f'
),
-- 4. O eco continua barrado: o incidente do proprio canal fica fora do ramo (b).
c4 as (
    select 4, 'ramo (b) continua excluindo o proprio canal',
           case when pg_get_functiondef(p.oid) ~ 'canal:whatsapp-alertas'
                then 'ok' else 'FALHOU' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'canal_alertas_scan' and p.prokind = 'f'
),
-- 5. O webhook de status da Meta chega de verdade. Se isto zerar, a premissa do
--    detector deixou de valer e ele nao pode mais acusar canal mudo por ausencia
--    de recibo — e o conserto e receber o status, nao mexer no envio.
c5 as (
    select 5, 'recibos de status da Meta nas ultimas 24h',
           case when count(*) > 0 then 'ok' else 'FALHOU — nenhum recibo chegou' end,
           count(*)::text || ' mensagem(ns) delivered/read'
      from public.messages m
     where m.direction = 'outbound'
       and m.status in ('delivered', 'read')
       and m.created_at >= now() - interval '24 hours'
),
-- 6. A reconciliacao do ALERTA (que nao passa por `messages`) funciona.
c6 as (
    select 6, 'alertas de WhatsApp confirmados por reconciliacao',
           case when count(*) > 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' confirmado(s), ultimo em '
           || coalesce(to_char(max(delivered_at) at time zone 'America/Sao_Paulo',
                               'DD/MM HH24:MI'), '(nunca)')
      from public.incident_notifications
     where via = 'whatsapp' and delivered_at is not null
),
-- 7. Confirmacao rapida: se o recibo demorasse minutos, a carencia de 15 min
--    estaria mal dimensionada. Medido: 2 a 18 segundos.
c7 as (
    select 7, 'confirmacao volta em segundos, nao em minutos',
           case when coalesce(max(extract(epoch from (delivered_at - sent_at))), 0) < 300
                then 'ok' else 'CONFERIR — carencia de 15 min pode estar curta' end,
           'pior caso '
           || coalesce(max(extract(epoch from (delivered_at - sent_at)))::int::text, '0')
           || 's'
      from public.incident_notifications
     where via = 'whatsapp' and delivered_at is not null
       and sent_at >= now() - interval '24 hours'
),
-- 8. Contraprova viva do ramo (d), simulada sem chamar a funcao (ela ESCREVE:
--    `canal_alertas_scan` registra incidente, entao nao entra em teste de
--    leitura). Reproduz a condicao nova sobre a janela de 6h: sem confirmacao
--    alguma no periodo o detector acusa; com pelo menos uma, cala.
c8 as (
    select 8, 'ramo (d) calado enquanto houver confirmacao na janela',
           case when count(*) filter (where delivered_at is not null) > 0
                then 'ok'
                when count(*) filter (where delivered_at is null
                                        and sent_at <= now() - interval '15 minutes') = 0
                then 'ok'
                else 'CONFERIR — nenhuma confirmacao na janela, o detector acusaria' end,
           count(*) filter (where delivered_at is not null)::text || ' confirmado(s) x '
           || count(*) filter (where delivered_at is null
                                 and sent_at <= now() - interval '15 minutes')::text
           || ' sem confirmacao, na janela de 6h'
      from public.incident_notifications
     where via = 'whatsapp' and status = 'sent' and wamid is not null
       and sent_at >= now() - interval '6 hours'
)
select checagem, resultado, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7 union all select * from c8
) t order by ord, checagem;
