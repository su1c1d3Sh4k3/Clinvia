-- Rajadas de "connection failed": era o proprio monitoramento (24/09/2026).
--
-- O QUE ELE PERGUNTOU: "quantos jobs ativos existem hoje contra quantos
-- existiam ha uma semana, o tamanho do pool, quantas conexoes simultaneas nos
-- minutos das rajadas, e se os jobs que falharam coincidem com os minutos de
-- maior concorrencia. Se formos nos, o conserto e espalhar os horarios, nao
-- aumentar o pool."
--
-- SOMOS NOS. As quatro medicoes:
--
--   1. POOL: max_connections = 60, superuser_reserved_connections = 3, logo 57
--      utilizaveis. Num minuto calmo ja havia 43 conexoes abertas (so o
--      `authenticator` do PostgREST segura 21). FOLGA REAL = 14.
--
--   2. CORRELACAO (8 dias, 1418 minutos com job rodando):
--
--        jobs/min | minutos | com falha |   %
--              6  |    629  |        0  |  0,0
--              8  |    630  |        0  |  0,0
--             17  |     16  |        1  |  6,3
--             18  |     66  |        4  |  6,1
--             25  |     30  |        5  | 16,7
--             26  |      7  |        1  | 14,3
--
--      Ate 14 jobs no mesmo minuto: ZERO falha em 1259 minutos. Acima de 17:
--      falha. O degrau cai exatamente onde a folga de conexao acaba.
--
--   3. AS 11 RAJADAS da serie caem todas em :00/:10/:20/:30/:40/:50 — os
--      minutos onde `*/5`, `*/10`, `*/15` e `*/30` se empilham por usarem
--      todos o offset zero. O minuto 0 chegava a 25-26 partidas simultaneas.
--
--   4. QUEM CRESCEU: 42 jobs ativos hoje contra ~32 uma semana atras. Os 14
--      novos sao de monitoramento (alert-dispatch, incident-analyze-scan,
--      cron-health-watch, incident-scan-db-sources, entrada-invalida-scan,
--      alert-channel-watch, provisionamento-scan, openai-*). Nenhum deles e
--      pesado sozinho; juntos, todos no offset zero, foi o que empurrou um
--      sistema que ja vivia perto da parede para o outro lado dela.
--
-- `cron.max_running_jobs` = 32 e MAIOR que a folga de 14: o pg_cron tenta
-- iniciar mais jobs do que existe conexao e o Postgres responde "connection
-- failed". Nao mexemos nisso nem em `max_connections` — a instrucao foi
-- espalhar, e espalhar resolve sem comprar nada.
--
-- O QUE MUDA: so o OFFSET. Nenhuma frequencia e alterada, nenhum job e
-- removido, nenhum comando e reescrito (`cron.alter_job` troca apenas o
-- schedule). O `*/5` continua de 5 em 5 minutos; passa a rodar em 1,6,11,...
-- em vez de 0,5,10,...
--
-- RESULTADO MODELADO, minuto a minuto (o modelo reproduz o medido: preve 27
-- no minuto 0 contra 25-26 observados):
--
--        antes:  pico 27, vale 6   (minuto 0 = 27, minutos impares = 6)
--        depois: pico  9, vale 8   (uniforme)
--
--   Pior minuto do dia: era 08:00 com 30 partidas (3 rotinas diarias em cima
--   do pico horario). Passa a ser 10. Contra 14 de folga, margem de 4 no pior
--   caso conhecido.
--
-- ORDEM PRESERVADA onde ela importa: openai-saldo (13) antes de
-- openai-usage-sync-hourly (23) antes de openai-alerts (33), como era com
-- 15 < 20 < 30. E `cleanup-pg-net-responses` deixou de cair no mesmo minuto
-- que `cron-health-watch` — a poda de `net._http_response` disputava o minuto
-- com quem a le.
--
-- A SEVERIDADE NAO MUDA, e esta e a parte que a medicao derrubou: ele pediu
-- "rajada isolada que se recuperou no ciclo seguinte e media, alta so se
-- repetir dentro de 2h". O bloco B1 do `cron_health_scan` JA faz exatamente
-- isso (`v_rajadas_jan >= 2` => alta), e os 7 incidentes da serie provam no
-- dado: os 5 com 1 minuto de rajada na janela sairam `media` e NAO foram
-- notificados; os 2 com 2 minutos sairam `alta` e foram. Mexer aqui seria
-- consertar o que esta certo.

begin;

do $$
declare
    v_alvo   record;
    v_jobid  bigint;
    v_mudou  integer := 0;
begin
    for v_alvo in
        select * from (values
            -- ── a cada 2 min: par / impar ───────────────────────────────────
            ('incident-analyze-scan',        '*/2 * * * *'),
            ('process-auto-follow-up',       '1-59/2 * * * *'),

            -- ── a cada 5 min: offsets 0,1,2 ─────────────────────────────────
            ('auto-close-worker',            '*/5 * * * *'),
            ('cron-health-watch',            '1-59/5 * * * *'),
            ('openai-provision-worker',      '2-59/5 * * * *'),

            -- ── a cada 10 min: offsets 0,1,2,3,5,6,7 ────────────────────────
            -- 4, 8 e 9 ficam livres de proposito: e onde os de 15 e 30 pousam.
            ('appointment-reminders',        '*/10 * * * *'),
            ('appointment-confirmation-cron','1-59/10 * * * *'),
            ('mark-waiting-appointments',    '2-59/10 * * * *'),
            ('process-auto-messages',        '3-59/10 * * * *'),
            ('uzapi-health-check',           '5-59/10 * * * *'),
            ('incident-scan-db-sources',     '6-59/10 * * * *'),
            ('entrada-invalida-scan',        '7-59/10 * * * *'),

            -- ── a cada 15 min: offsets 4,9,14 (sempre em minuto mod10 4 ou 9)
            ('cleanup-pg-net-responses',     '4-59/15 * * * *'),
            ('alert-channel-watch',          '9-59/15 * * * *'),
            ('provisionamento-scan',         '14-59/15 * * * *'),

            -- ── a cada 30 min: offsets 8,18 ─────────────────────────────────
            ('reset-stuck-webhook-jobs',     '8-59/30 * * * *'),
            ('instagram-window-expired-check','18-59/30 * * * *'),
            ('delivery-automation-dispatcher','28,58 * * * *'),

            -- ── de hora em hora: nos minutos mod10 = 3, os mais vazios ──────
            ('campaign-expiry',              '3 * * * *'),
            ('openai-saldo-scan',            '13 * * * *'),
            ('openai-usage-sync-hourly',     '23 * * * *'),
            ('openai-alerts-scan',           '33 * * * *'),
            ('alert-summary',                '43 */2 * * *'),
            ('cleanup-cron-history',         '53 */6 * * *'),

            -- ── as tres diarias que largavam juntas as 08:00 ────────────────
            ('account-emails-cron',          '0 8 * * *'),
            ('generate-opportunities-daily', '8 8 * * *'),
            ('recurrence-campaign-generator','18 8 * * *'),

            -- ── e o par das 03:00, que deixava o pior minuto do dia em 11 ───
            ('cleanup-tickets-daily',        '0 3 * * *'),
            ('cleanup-webhook-queue-daily',  '24 3 * * *')
        ) as t(jobname, schedule)
    loop
        select j.jobid into v_jobid from cron.job j where j.jobname = v_alvo.jobname;

        if v_jobid is null then
            -- Job ausente nao e erro: pode ter sido desagendado de proposito
            -- (foi o caso de instagram-enrich-profiles em 23/09). Avisa e segue.
            raise notice '[espalhar] job % nao existe, pulando', v_alvo.jobname;
        else
            perform cron.alter_job(v_jobid, schedule => v_alvo.schedule);
            v_mudou := v_mudou + 1;
        end if;
    end loop;

    raise notice '[espalhar] % job(s) reagendado(s)', v_mudou;
end;
$$;

commit;
