-- Espalhamento dos crons — 26/09/2026.
--
-- Ordem: "nenhum minuto com mais de 7 jobs comecando juntos, mantendo a
-- frequencia de cada job". A ARITMETICA NAO PERMITE 7, e o numero esta medido:
--
--   piso por minuto = 8 jobs `* * * * *`
--                   + `meta-send-retry-worker` (`1-59`, todo minuto menos o :00)
--                   + 1 do par `/2` (`incident-analyze-scan` nos pares,
--                     `process-auto-follow-up` nos impares — juntos cobrem os 60)
--                   + 1 do grupo `/5` (5 jobs nas 5 fases 0..4 — cobrem os 60)
--                   = 11 partidas em TODO minuto de 1 a 59, sem exceção.
--
-- Abaixo de 11 so se mudarmos frequencia, que a propria ordem proibe. Entao o
-- que da para fazer e outra coisa, e vale a pena: reduzir QUANTOS minutos ficam
-- acima do piso.
--
-- Os jobs que sobram (os `/10`, `/15`, `/30`, os de hora cheia, o resumo de 2h
-- e a poda de 6h) somam 67 partidas para distribuir em 60 minutos. Logo, no
-- melhor caso possivel, 7 minutos ficam com 2 extras (= 13) e os outros 53 com
-- 1 (= 12). Hoje sao 13 minutos em 13, quase o dobro do minimo.
--
-- A causa e uma so, e e um acidente de cadastro: a familia `/10` tem 7 jobs
-- para 10 fases, e DUAS fases estao empilhadas enquanto a fase 0 esta vazia.
-- `appointment-reminders` e `incident-scan-db-sources` largam os dois em
-- `6-59/10`, colidindo em :06, :16, :26, :36, :46 e :56 — seis dos treze picos.
--
-- Mover `incident-scan-db-sources` para a fase 0 resolve os seis de uma vez e
-- e o unico movimento que ainda melhora alguma coisa: depois dele NAO EXISTE
-- mais minuto livre na grade, e os 7 picos restantes sao o minimo aritmetico.
--
-- Por que a fase 0 e segura aqui, sendo que o :00 e o minuto que atrai job por
-- descuido (checagem 10 do verify): porque hoje o :00 esta com 9 partidas — e o
-- UNICO minuto sem nada do grupo `/5` — e passa a 10. Continua sendo o minuto
-- mais folgado da hora. Os :10, :20, :30, :40 e :50, que estavam em 11, vao a
-- 12, que e a mediana da grade.
--
-- O que NAO foi feito, de proposito: nao se encostou nas conexoes da Storage
-- API nem em nada gerenciado pelo Supabase, e `max_connections` continua 60.
--
-- Frequencia preservada: `6-59/10` e `0-59/10` disparam 6x por hora os dois.
-- A checagem 5 do verify cobre exatamente isso.

do $$
begin
    if exists (select 1 from cron.job where jobname = 'incident-scan-db-sources') then
        perform cron.schedule(
            'incident-scan-db-sources',
            '0-59/10 * * * *',
            (select command from cron.job where jobname = 'incident-scan-db-sources')
        );
    end if;
end
$$;
