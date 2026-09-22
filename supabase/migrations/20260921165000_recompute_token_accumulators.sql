-- Recalcula os acumuladores de tokens a partir do token_usage_log ja limpo
-- (fantasmas arquivadas em 20260921164000) e passa a coluna "monthly" a significar
-- de fato o mes corrente.
--
-- Contexto: profiles.tokens_monthly / approximate_cost_monthly eram vitalicios porque
-- reset_monthly_tokens() nunca foi agendado (token_monthly_history estava VAZIA).
-- Decisao do user (21/09/2026): monthly = mes-calendario real (fuso America/Sao_Paulo),
-- total = vitalicio, e o reset passa a rodar no dia 1.
--
-- O UPDATE em massa em profiles seria catastrofico antes de 20260921163000 (cada linha
-- geraria uma fantasma nova); agora o trigger nao existe mais e nao ha efeito colateral.

with mes as (
  select (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::timestamp
          at time zone 'America/Sao_Paulo') as ini
),
limpo as (
  select l.owner_id,
         sum(l.total_tokens) as tok_vida,
         sum(l.cost_usd) as usd_vida,
         coalesce(sum(l.total_tokens) filter (where l.created_at >= (select ini from mes)), 0) as tok_mes,
         coalesce(sum(l.cost_usd) filter (where l.created_at >= (select ini from mes)), 0) as usd_mes
  from token_usage_log l
  group by l.owner_id
)
update profiles p
set tokens_total = coalesce(c.tok_vida, 0),
    approximate_cost_total = round(coalesce(c.usd_vida, 0), 4),
    tokens_monthly = coalesce(c.tok_mes, 0),
    approximate_cost_monthly = round(coalesce(c.usd_mes, 0), 4)
from (select p2.id,
             l.tok_vida, l.usd_vida, l.tok_mes, l.usd_mes
      from profiles p2
      left join limpo l on l.owner_id = p2.id
      where l.owner_id is not null
         or coalesce(p2.tokens_total, 0) > 0
         or coalesce(p2.approximate_cost_total, 0) > 0
         or coalesce(p2.tokens_monthly, 0) > 0
         or coalesce(p2.approximate_cost_monthly, 0) > 0) c
where c.id = p.id;

-- team_members.tokens_total / approximate_cost_total vem do track_token_usage
-- (source='system', o unico caminho que preenche team_member_id).
with limpo_tm as (
  select l.team_member_id,
         sum(l.total_tokens) as tok,
         sum(l.cost_usd) as usd
  from token_usage_log l
  where l.team_member_id is not null
  group by l.team_member_id
)
update team_members t
set tokens_total = coalesce(c.tok, 0),
    approximate_cost_total = round(coalesce(c.usd, 0), 4)
from (select t2.id, l.tok, l.usd
      from team_members t2
      left join limpo_tm l on l.team_member_id = t2.id
      where l.team_member_id is not null
         or coalesce(t2.tokens_total, 0) > 0
         or coalesce(t2.approximate_cost_total, 0) > 0) c
where c.id = t.id;

-- Reset mensal: 00:05 de Sao Paulo do dia 1 (03:05 UTC). A funcao usa NOW() - 1 day
-- para rotular o year_month, entao precisa rodar depois da meia-noite do dia 1.
select cron.unschedule('reset-monthly-tokens')
where exists (select 1 from cron.job where jobname = 'reset-monthly-tokens');

select cron.schedule('reset-monthly-tokens', '5 3 1 * *', $$select public.reset_monthly_tokens();$$);
