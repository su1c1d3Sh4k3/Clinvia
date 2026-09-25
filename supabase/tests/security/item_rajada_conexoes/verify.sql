-- Espalhamento dos horarios de cron (24/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O que este teste protege: a folga de conexao do banco. Medido em 24/09,
-- `max_connections` = 60 menos 3 reservadas menos ~43 ja em uso = FOLGA 14.
-- Ate 14 jobs partindo no mesmo minuto houve ZERO falha em 1259 minutos; a
-- partir de 17, 6% dos minutos falharam; com 25, 17%.
--
-- As checagens 1 e 2 nao olham a lista de jobs que a migration mexeu: elas
-- RECALCULAM o pico a partir de `cron.job`. Job novo cadastrado no offset zero
-- falha aqui, que e o ponto — a proxima rajada tem que ser barrada no code
-- review, nao no telefone dele.
--
-- A checagem 5 e a que nao pode ser esquecida: espalhar nao pode ter mudado
-- FREQUENCIA de nada. Se um `*/5` virou `*/7`, o pico melhora e o produto
-- quebra em silencio.

with
-- Expande o campo de minuto de cada job ativo nos minutos em que ele dispara.
-- Formas presentes no projeto: `*`, `*/n`, `a-b/n`, `a-b`, `a`, e listas com virgula.
termos as (
    select j.jobid, j.jobname, j.schedule,
           split_part(j.schedule, ' ', 2)          as campo_hora,
           trim(t)                                 as termo
      from cron.job j,
           unnest(string_to_array(split_part(j.schedule, ' ', 1), ',')) t
     where j.active
),
partidas as (
    select t.jobid, t.jobname, t.schedule, t.campo_hora, m.minuto
      from termos t
      cross join generate_series(0, 59) as m(minuto)
     where case
             when t.termo = '*' then true
             when t.termo ~ '^\*/[0-9]+$'
                 then m.minuto % (split_part(t.termo, '/', 2))::int = 0
             when t.termo ~ '^[0-9]+-[0-9]+/[0-9]+$'
                 then m.minuto between split_part(split_part(t.termo, '/', 1), '-', 1)::int
                                   and split_part(split_part(t.termo, '/', 1), '-', 2)::int
                  and (m.minuto - split_part(split_part(t.termo, '/', 1), '-', 1)::int)
                      % (split_part(t.termo, '/', 2))::int = 0
             when t.termo ~ '^[0-9]+-[0-9]+$'
                 then m.minuto between split_part(t.termo, '-', 1)::int
                                   and split_part(t.termo, '-', 2)::int
             when t.termo ~ '^[0-9]+$' then m.minuto = t.termo::int
             else false
           end
),
-- Mesma expansao para a hora, para achar o pior minuto do DIA (as 08:00
-- tres rotinas diarias largavam juntas em cima do pico horario).
grade as (
    select p.jobid, p.minuto, h.hora
      from partidas p
      cross join generate_series(0, 23) as h(hora)
     where case
             when p.campo_hora = '*' then true
             when p.campo_hora ~ '^\*/[0-9]+$'
                 then h.hora % (split_part(p.campo_hora, '/', 2))::int = 0
             when p.campo_hora ~ '^[0-9]+$' then h.hora = p.campo_hora::int
             else true   -- forma nao prevista: conta em toda hora (pessimista)
           end
),
pico_horario as (
    select minuto, count(distinct jobid) as jobs
      from partidas
     where campo_hora = '*'
     group by minuto
),
pico_diario as (
    select hora, minuto, count(distinct jobid) as jobs
      from grade group by hora, minuto
),
folga as (
    select (select setting::int from pg_settings where name = 'max_connections')
         - (select setting::int from pg_settings where name = 'superuser_reserved_connections')
         - (select count(*)::int from pg_stat_activity) as livres
),

-- 1. Pico de partidas no mesmo minuto, considerando so o que roda toda hora.
c1 as (
    select 1 as ord,
           'pico de jobs partindo no mesmo minuto (toda hora)' as checagem,
           case when max(jobs) <= 12 then 'ok'
                else 'FALHOU — alguem voltou a empilhar no mesmo offset' end as resultado,
           'pico ' || max(jobs)::text || ' no minuto :'
           || to_char((select p2.minuto from pico_horario p2
                        order by p2.jobs desc, p2.minuto limit 1), 'FM00')
           || ' (vale ' || min(jobs)::text || ')' as detalhe
      from pico_horario
),
-- 2. Pior minuto do dia inteiro: aqui entram as diarias de hora fixa.
c2 as (
    select 2, 'pior minuto do dia (com as rotinas diarias)',
           case when max(jobs) <= 12 then 'ok' else 'FALHOU' end,
           'pico ' || max(jobs)::text || ' as '
           || (select to_char(d.hora, 'FM00') || ':' || to_char(d.minuto, 'FM00')
                 from pico_diario d order by d.jobs desc, d.hora, d.minuto limit 1)
      from pico_diario
),
-- 3. O pico tem que caber na folga real, com margem. Se a folga encolher
--    (mais um PostgREST, mais um pooler), esta linha avisa antes da rajada.
c3 as (
    select 3, 'pico cabe na folga de conexao do banco',
           case when (select max(jobs) from pico_diario) <= (select livres from folga) - 3
                then 'ok' else 'CONFERIR — a folga encolheu' end,
           'pico ' || (select max(jobs) from pico_diario)::text
           || ' contra ' || (select livres from folga)::text || ' conexao(oes) livre(s) de '
           || (select setting from pg_settings where name = 'max_connections') || ' totais'
),
-- 4. O pool NAO foi aumentado. A instrucao foi espalhar, nao comprar.
c4 as (
    select 4, 'pool nao foi aumentado',
           case when (select setting::int from pg_settings where name = 'max_connections') <= 60
                then 'ok' else 'FALHOU — alguem subiu max_connections' end,
           'max_connections = ' || (select setting from pg_settings where name = 'max_connections')
),
-- 5. Espalhar nao pode ter mudado FREQUENCIA. Conta quantas vezes por hora
--    cada job roda: os grupos tem que continuar com 30, 12, 6, 4 e 2.
c5 as (
    select 5, 'frequencias preservadas (nenhum job ficou mais raro)',
           case when count(*) = 0 then 'ok'
                else 'FALHOU — ' || string_agg(jobname || '=' || n || 'x/h', ', ') end,
           coalesce(string_agg(jobname || ' ' || n::text || 'x/h', ', '), 'todos na frequencia esperada')
      from (
        select p.jobname, count(*) as n
          from partidas p
         where p.jobname in ('incident-analyze-scan','process-auto-follow-up',
                             'auto-close-worker','cron-health-watch','openai-provision-worker',
                             'appointment-reminders','appointment-confirmation-cron',
                             'mark-waiting-appointments','process-auto-messages',
                             'uzapi-health-check','incident-scan-db-sources','entrada-invalida-scan',
                             'cleanup-pg-net-responses','alert-channel-watch','provisionamento-scan',
                             'reset-stuck-webhook-jobs','instagram-window-expired-check',
                             'delivery-automation-dispatcher')
         group by p.jobname
      ) f
     where n not in (30, 12, 6, 4, 2)
),
-- 6. A ordem do bloco OpenAI: saldo -> sync horario -> alertas. Espalhar nao
--    pode ter invertido quem le o que o outro escreveu.
c6 as (
    select 6, 'ordem preservada: saldo < sync horario < alertas',
           case when (select min(minuto) from partidas where jobname = 'openai-saldo-scan')
                     < (select min(minuto) from partidas where jobname = 'openai-usage-sync-hourly')
                and (select min(minuto) from partidas where jobname = 'openai-usage-sync-hourly')
                     < (select min(minuto) from partidas where jobname = 'openai-alerts-scan')
                then 'ok' else 'FALHOU — a ordem inverteu' end,
           'saldo :' || (select min(minuto) from partidas where jobname = 'openai-saldo-scan')
           || ', sync :' || (select min(minuto) from partidas where jobname = 'openai-usage-sync-hourly')
           || ', alertas :' || (select min(minuto) from partidas where jobname = 'openai-alerts-scan')
),
-- 7. A poda de net._http_response nao pode cair no mesmo minuto de quem a le:
--    cleanup-pg-net-responses x cron-health-watch.
c7 as (
    select 7, 'poda do net._http_response nao colide com quem o le',
           case when not exists (
                    select 1 from partidas a join partidas b on a.minuto = b.minuto
                     where a.jobname = 'cleanup-pg-net-responses'
                       and b.jobname = 'cron-health-watch')
                then 'ok' else 'CONFERIR — voltaram a disputar o mesmo minuto' end,
           'poda em ' || (select string_agg(minuto::text, ',' order by minuto) from partidas
                           where jobname = 'cleanup-pg-net-responses')
),
-- 8. A regra de severidade da rajada continua a que ele pediu: isolada = media,
--    alta so na repeticao dentro de 2h. Nao foi tocada, e e texto de funcao.
c8 as (
    select 8, 'rajada isolada continua media, alta so repetindo em 2h',
           case when pg_get_functiondef(p.oid) ~ 'v_rajadas_jan >= 2 then ''alta'' else ''media'''
                then 'ok' else 'FALHOU — a regra da rajada mudou' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cron_health_scan' and p.prokind = 'f'
),
-- 9. Estado de fato: rajadas na janela que o proprio detector le.
c9 as (
    select 9, 'minutos de rajada nas ultimas 2h',
           case when count(*) = 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' minuto(s) com ' || '3+ jobs falhando junto'
      from (
        select date_trunc('minute', d.start_time)
          from cron.job_run_details d
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         group by 1
        having count(distinct d.jobid) >= 3
      ) s
),
-- 10. A meta que ele fixou em 25/09/2026: o MINUTO CHEIO tem que sobrar pelo
--     menos 4 conexoes. O :00 nao e um minuto qualquer — e o offset que todo
--     cron novo herda por descuido (`* * * * *`, `*/5`, `*/10` e `0 H * * *`
--     caem todos nele), entao e ali que a proxima rajada vai nascer. As
--     checagens 1 e 2 olham o PIOR minuto; esta olha o minuto que atrai job.
--     `20260925220000` tirou dali o worker de reenvio da Meta, o
--     `appointment-reminders` e o `auto-close-worker`: 11 partidas viraram 9.
c10 as (
    select 10, 'minuto :00 sobra pelo menos 4 conexoes',
           case when (select coalesce(max(jobs), 0) from pico_diario where minuto = 0)
                     <= (select livres from folga) - 4
                then 'ok' else 'FALHOU — o minuto cheio voltou a encher' end,
           'pico ' || (select coalesce(max(jobs), 0) from pico_diario where minuto = 0)::text
           || ' no :00 contra ' || (select livres from folga)::text || ' livre(s)'
)
select checagem, resultado, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7 union all select * from c8 union all select * from c9
    union all select * from c10
) t order by ord, checagem;
