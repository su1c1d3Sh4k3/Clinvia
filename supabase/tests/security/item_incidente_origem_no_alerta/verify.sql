-- ============================================================
-- item: a origem chega ao alerta (migration 20260923470000)
--
-- Duas coisas sao provadas aqui, e a segunda so existe porque eu errei:
--
--   1. o claim devolve `origem`/`origem_inferida` na posicao certa, e o
--      despachante consegue ler os dois de um incidente injetado;
--   2. as tres regras que NAO tem nada a ver com origem continuam no corpo da
--      funcao. A primeira versao desta migration recriou o claim a partir da
--      definicao de 20260923170000 — quatro versoes atras — e apagou em silencio
--      a espera de analise, a exclusao de `somente_painel` e a gravidade
--      efetiva. O SQL aplicou sem um aviso sequer. Recriar funcao a partir da
--      migration errada nao da erro: da uma volta no tempo.
--
-- O incidente de teste usa o componente `zz-teste:origem-no-alerta`, que o
-- catalogo marca como `somente_painel` — ele nao chega a telefone nenhum. Que
-- ele NAO seja reclamado pela fila e, aliais, a propria asserção 2.
-- ============================================================

begin;

-- ── fixture ─────────────────────────────────────────────────────────────────
-- Origem DECLARADA: e o caso que o header `x-origin` produz em trafego real.
select public.incident_record(jsonb_build_object(
    'source',          'edge_function',
    'component',       'zz-teste:origem-no-alerta',
    'route',           'verify',
    'http_code',       500,
    'error_message',   'evento de teste do item origem-no-alerta',
    'request_id',      'zz-teste:origem-no-alerta:declarada',
    'origem',          'ia_n8n',
    'origem_inferida', false,
    'started_at',      now()
));

-- Origem AUSENTE: tem que sair inferida, nunca em branco.
select public.incident_record(jsonb_build_object(
    'source',        'frontend',
    'component',     'zz-teste:origem-no-alerta-inferida',
    'route',         'verify',
    'http_code',     500,
    'error_message', 'evento de teste sem origem declarada',
    'request_id',    'zz-teste:origem-no-alerta:inferida',
    'started_at',    now()
));

with fn as (
    select prosrc, pg_get_function_result(oid) as assinatura
      from pg_proc where proname = 'incident_claim_for_notification'
),
casos(ordem, caso, passou, porque) as (values

-- ── 1. a origem viaja ───────────────────────────────────────────────────────
(1, 'o claim devolve origem e origem_inferida',
 (select assinatura from fn) like '%origem text, origem_inferida boolean%',
 'sem isso a coluna existe no banco e morre antes do WhatsApp'),

(2, 'a origem sai na mesma posicao da assinatura e do returning',
 (select prosrc from fn) like '%i.origem, coalesce(i.origem_inferida, true)%',
 'a ligacao e posicional: fora de ordem a origem sai no campo de outra coisa, sem erro'),

(3, 'origem declarada chega no evento como declarada',
 (select origem = 'ia_n8n' and not origem_inferida
    from public.incident_events
   where request_id = 'zz-teste:origem-no-alerta:declarada'),
 'quem se identifica com x-origin nao pode virar palpite'),

(4, 'evento sem origem sai inferido, nunca em branco',
 (select origem = 'front' and origem_inferida
    from public.incident_events
   where request_id = 'zz-teste:origem-no-alerta:inferida'),
 'source=frontend e conclusivo; e a inferencia tem que se declarar inferencia'),

(5, 'o incidente agregado herda a origem do evento',
 (select i.origem = 'ia_n8n'
    from public.incidents i
   where i.component = 'zz-teste:origem-no-alerta'),
 'o alerta le o incidente, nao o evento'),

-- ── 2. o que a origem NAO podia ter derrubado ───────────────────────────────
(6, 'REGRESSAO: a exclusao de somente_painel continua no claim',
 (select prosrc from fn) ilike '%somente_painel%',
 'sem ela manutencao interna e componente de teste voltam a tocar o telefone'),

(7, 'REGRESSAO: o claim ainda roteia por gravidade EFETIVA',
 (select prosrc from fn) ilike '%incident_severidade_efetiva%',
 'sem ela analisador fora do ar segura critico por 2 horas'),

(8, 'REGRESSAO: a espera de 2 minutos por analise continua',
 (select prosrc from fn) ilike '%2 minutes%',
 'sem ela o alerta sai antes da IA ter o que dizer'),

(9, 'REGRESSAO: a reserva e o recuo progressivo continuam',
 (select prosrc from fn) ilike '%notify_claimed_at%'
 and (select prosrc from fn) ilike '%notify_next_attempt_at%',
 'sem eles dois despachantes mandam o mesmo alerta duas vezes'),

(10, 'REGRESSAO: o cooldown de recorrencia continua',
 (select prosrc from fn) ilike '%incident_notify_cooldown_min%',
 'sem ele um incidente repetido vira mensagem por minuto'),

(11, 'REGRESSAO: a chave de desligar continua respeitada',
 (select prosrc from fn) ilike '%alert_notify_enabled%',
 'e o freio de mao do canal inteiro'),

-- ── 3. o componente de teste nao pode chegar a telefone ─────────────────────
(12, 'o componente de teste esta catalogado como somente_painel',
 coalesce((select ci.somente_painel
             from public.incident_component_info('zz-teste:origem-no-alerta') ci), false),
 'e o que permite exercitar o caminho sem tocar o WhatsApp dele'),

(13, 'e por isso a fila NAO reclama o incidente de teste',
 not exists (select 1 from public.incident_claim_for_notification(50) c
              where c.component like 'zz-teste:%'),
 'prova viva da asserção 6: a regra nao so esta no texto, ela age'),

-- ── 4. grants ───────────────────────────────────────────────────────────────
(14, 'DROP + CREATE nao deixou o EXECUTE aberto para PUBLIC',
 not has_function_privilege('anon', (select oid from pg_proc
   where proname = 'incident_claim_for_notification'), 'EXECUTE'),
 'create function concede a PUBLIC; revoke from anon sozinho nao tira'),

(15, 'o service_role continua podendo executar',
 has_function_privilege('service_role', (select oid from pg_proc
   where proname = 'incident_claim_for_notification'), 'EXECUTE'),
 'e quem o alert-notify usa')

)
-- O `db query` do CLI devolve so as linhas do ULTIMO statement, entao o placar
-- entra como linha 99 desta mesma consulta em vez de virar um select separado.
select ordem, caso, case when passou then 'ok' else 'REPROVADO' end as resultado, porque
  from casos
union all
select 99,
       'PLACAR',
       case when (select count(*) from casos where not passou) = 0
            then 'ok' else 'REPROVADO' end,
       format('%s de %s asserções passaram · %s das 7 regras do claim preservadas',
              (select count(*) from casos where passou),
              (select count(*) from casos),
              (select count(*) from (values
                   ('somente_painel'), ('incident_severidade_efetiva'), ('2 minutes'),
                   ('notify_claimed_at'), ('notify_next_attempt_at'),
                   ('incident_notify_cooldown_min'), ('alert_notify_enabled')
                 ) r(m) where (select prosrc from fn) ilike '%' || r.m || '%'))
order by 1;

-- Nada de teste sobrevive a este arquivo: o rollback apaga tudo.
rollback;
