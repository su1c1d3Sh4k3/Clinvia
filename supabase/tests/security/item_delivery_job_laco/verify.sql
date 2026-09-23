-- Prova de que a RPC parou de mentir. Roda com a fila VAZIA (o estado normal:
-- a tabela tem 5 linhas, todas 'done' desde abril).
--
-- A assercao nao olha o objeto inteiro: olha se a RPC devolve NULO DE VERDADE.
-- Se um dia alguem reescrever a funcao e voltar a `RETURN claimed` sem o teste
-- de `id`, e esta linha que tem que ficar vermelha — antes de virar 700 mil
-- requisicoes 400 por dia de novo.
--
-- MAS ATENCAO: passar aqui NAO significa que o cliente HTTP recebe nulo. Para
-- uma funcao `RETURNS <composto>`, o PostgREST devolve o formato da linha com
-- todos os campos nulos, HTTP 200 — medido em producao em 23/09. O SQL estar
-- certo nao dispensa o `if (!job?.id) break;` do worker; e ele quem fecha o
-- laco. Este arquivo cobre o lado do banco; o lado do cliente esta no
-- comentario do proprio worker.

select format('%-6s fila vazia => RPC devolve NULO (nao a linha de NULLs)',
              case when public.pick_delivery_automation_job() is null
                   then 'ok' else 'FALHOU' end)

union all
select format('%-6s a fila esta mesmo vazia (pendentes=%s) — sem isto a linha acima nao prova nada',
              case when count(*) = 0 then 'ok' else 'AVISO' end, count(*))
  from public.delivery_automation_jobs
 where status = 'pending' and scheduled_at <= now()

union all
select format('%-6s so service_role executa a RPC',
              case when not has_function_privilege('anon', 'public.pick_delivery_automation_job()', 'EXECUTE')
                    and not has_function_privilege('authenticated', 'public.pick_delivery_automation_job()', 'EXECUTE')
                    and has_function_privilege('service_role', 'public.pick_delivery_automation_job()', 'EXECUTE')
                   then 'ok' else 'FALHOU' end);
