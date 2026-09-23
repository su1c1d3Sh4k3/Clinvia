-- Remocao dos tres crons de strategic-reports (decisao do dono, 23/09/2026).
--
-- AUDITORIA ANTES DE REMOVER (o que foi conferido):
--   front      -> ZERO ocorrencias de 'strategic' em src/. Nao ha tela, rota, hook
--                 nem botao do Super Admin chamando isso. O `src/hooks/useStrategicReports.ts`
--                 e o trecho de `src/pages/Reports.tsx` que invocavam a funcao existem
--                 SOMENTE numa worktree antiga (.claude/worktrees/strange-archimedes),
--                 nao no codigo que vai para producao.
--   edge fns   -> nenhuma outra funcao chama generate-strategic-reports.
--   banco      -> um unico leitor, `public.get_next_report_number`, que so serve a
--                 propria funcao (numera o relatorio seguinte).
--
-- DIFERENCA IMPORTANTE EM RELACAO AO instagram-enrich-profiles: este NAO esta quebrado.
-- Ele roda e grava. `strategic_reports` tem 5.104 linhas, 22 por dia, ultima em
-- 22/09/2026 22:00 — todas de um unico tenant (Luminara, conta de teste do dono).
-- Ou seja: producao diaria que ninguem le. Sai por ser inutil, nao por falhar.
--
-- A TABELA NAO E DERRUBADA. `strategic_reports` fica de pe com os 5.104 registros:
-- parar de produzir e reversivel, apagar historico nao e. Se o dono quiser o drop,
-- vira migration propria.
--
-- A implantacao da edge function e removida fora daqui:
--   npx supabase functions delete generate-strategic-reports --project-ref swfshqvvbohnahdyndch

do $$
declare
    v_nome text;
begin
    foreach v_nome in array array[
        'strategic-reports-daily',
        'strategic-reports-weekly',
        'strategic-reports-monthly'
    ] loop
        if exists (select 1 from cron.job where jobname = v_nome) then
            perform cron.unschedule(v_nome);
            raise notice 'cron % desagendado', v_nome;
        else
            raise notice 'cron % ja nao existia', v_nome;
        end if;
    end loop;
end $$;

-- Tira os tres da carencia do vigia, senao ele passa a ve-los como "job sumiu".
delete from public.cron_health_seen
 where jobname in ('strategic-reports-daily',
                   'strategic-reports-weekly',
                   'strategic-reports-monthly');

update public.incidents
   set status = 'resolved',
       resolved_at = now(),
       updated_at = now(),
       notes = coalesce(notes || E'\n', '')
            || 'Fechado por 20260923250000: os crons de strategic-reports foram '
            || 'descontinuados por decisao do dono em 23/09/2026.'
 where status <> 'resolved'
   and component in ('cron:strategic-reports-daily',
                     'cron:strategic-reports-weekly',
                     'cron:strategic-reports-monthly');
