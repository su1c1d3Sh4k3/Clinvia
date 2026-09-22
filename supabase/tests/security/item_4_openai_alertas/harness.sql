-- Arnes dos 3 alertas da 20260922300000. Dispara cada um de verdade, com dado
-- plantado, e termina em ROLLBACK: nada sobra em producao.
--
-- Uso: npx supabase db query --linked --file supabase/tests/security/item_4_openai_alertas/harness.sql
--
-- PITFALL: a fase da zeragem so pode alertar em horario comercial (8h-20h, dia
-- util, fuso SP). Fora dessa janela a linha "FASE 3" sai com 0 e isso esta
-- CORRETO — a linha AGORA mostra a janela vigente.
begin;
set local lock_timeout = '5s';

create temp table _r (ord serial, info text) on commit drop;

insert into _r(info)
select 'AGORA SP | ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
       || ' | horario_comercial=' || (extract(isodow from now() at time zone 'America/Sao_Paulo') between 1 and 5
            and extract(hour from now() at time zone 'America/Sao_Paulo') >= 8
            and extract(hour from now() at time zone 'America/Sao_Paulo') < 20)::text;

-- FASE 1: estado limpo (a semente da migration e recente) => nenhum alerta.
insert into _r(info) select 'FASE 1 (nada errado) | ' || public.openai_alert_scan()::text;

-- FASE 2: sincronizacao parada. Envelhece o rastro de saude em 5h (limite = 3h).
update public.openai_sync_runs set started_at = now() - interval '5 hours';
insert into _r(info) select 'FASE 2 (sync parado) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 2 mensagem | ' || message from public.openai_alerts where kind = 'sync_failure';

-- FASE 3: zeragem em horario comercial. PELE com 300 reqs/dia nos 7 dias
-- anteriores e ZERO hoje, provisionada ha 10 dias (conta nova nao alerta).
update public.profiles
set openai_provisioned_at = now() - interval '10 days'
where id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af';

delete from public.openai_project_usage_daily
where project_id = 'proj_D4cs16yyh3fdEHBeuVEd1Raa'
  and day = (now() at time zone 'America/Sao_Paulo')::date;

insert into public.openai_project_usage_daily
    (day, project_id, model, input_tokens, input_cached_tokens, output_tokens, num_model_requests, updated_at)
select (now() at time zone 'America/Sao_Paulo')::date - g,
       'proj_D4cs16yyh3fdEHBeuVEd1Raa', 'arnes-modelo', 1000, 0, 500, 300, now()
from generate_series(1, 7) g;

insert into _r(info) select 'FASE 3 (zeragem) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 3 mensagem | ' || message from public.openai_alerts where kind = 'zero_usage';

-- FASE 4: anomalia diaria. Media dos 7 dias anteriores US$1/dia e US$10 hoje
-- => passa do fator 3 e do piso de US$ 3,00.
insert into public.openai_project_costs_daily (day, project_id, line_item, cost_usd, currency, updated_at)
select (now() at time zone 'America/Sao_Paulo')::date - g,
       'proj_D4cs16yyh3fdEHBeuVEd1Raa', 'arnes', 1.00, 'usd', now()
from generate_series(1, 7) g
on conflict (day, project_id, line_item) do update set cost_usd = 1.00;

insert into public.openai_project_costs_daily (day, project_id, line_item, cost_usd, currency, updated_at)
values ((now() at time zone 'America/Sao_Paulo')::date,
        'proj_D4cs16yyh3fdEHBeuVEd1Raa', 'arnes', 10.00, 'usd', now())
on conflict (day, project_id, line_item) do update set cost_usd = 10.00;

insert into _r(info) select 'FASE 4 (anomalia) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 4 mensagem | ' || message from public.openai_alerts where kind = 'daily_anomaly';

-- FASE 5: repetir a varredura nao pode duplicar nada (dedupe_key UNIQUE).
insert into _r(info) select 'FASE 5 (dedupe) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 5 total por tipo | ' || kind || '=' || count(*)::text
from public.openai_alerts group by kind;

-- FASE 6: piso de US$ 3,00/dia segura conta pequena. Custo hoje US$0,50 com
-- media US$0,01/dia = 50x, e MESMO ASSIM nao alerta.
delete from public.openai_alerts where kind = 'daily_anomaly';
update public.openai_project_costs_daily set cost_usd = 0.01
where project_id = 'proj_D4cs16yyh3fdEHBeuVEd1Raa' and line_item = 'arnes'
  and day < (now() at time zone 'America/Sao_Paulo')::date;
update public.openai_project_costs_daily set cost_usd = 0.50
where project_id = 'proj_D4cs16yyh3fdEHBeuVEd1Raa' and line_item = 'arnes'
  and day = (now() at time zone 'America/Sao_Paulo')::date;
delete from public.openai_project_costs_daily
where project_id = 'proj_D4cs16yyh3fdEHBeuVEd1Raa' and line_item <> 'arnes'
  and day = (now() at time zone 'America/Sao_Paulo')::date;

insert into _r(info) select 'FASE 6 (piso segura 50x de US$0,50) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 6 alertas de anomalia = ' || count(*)::text || ' (esperado 0)'
from public.openai_alerts where kind = 'daily_anomaly';

-- FASE 7: as chaves de desligar funcionam.
delete from public.openai_alerts;
update public.llm_platform_settings
set sync_alert_enabled = false,
    zero_usage_alert_enabled = false,
    daily_anomaly_alert_enabled = false
where id;
insert into _r(info) select 'FASE 7 (tudo desligado) | ' || public.openai_alert_scan()::text;
insert into _r(info)
select 'FASE 7 alertas = ' || count(*)::text || ' (esperado 0)' from public.openai_alerts;

select info from _r order by ord;
rollback;
