-- pick_delivery_automation_job: devolver NULO DE VERDADE quando nao ha job.
--
-- O comentario original desta funcao dizia `RETURN claimed; -- NULL when no
-- candidate`. Nao e. `claimed` e uma variavel de tipo COMPOSTO: quando o
-- `RETURNING ... INTO` nao casa linha nenhuma, o Postgres nao deixa a variavel
-- nula — ele preenche TODOS os campos com NULL. O que sai e a linha
-- `(,,,,,)`, que o PostgREST serializa como um objeto JSON com todas as
-- chaves nulas. Do lado do Deno isso e um objeto, e objeto e verdadeiro:
--
--     if (!job) break;          // nunca dispara
--     ...
--     .eq("id", job.id)         // job.id === undefined
--     => PATCH /delivery_automation_jobs?id=eq.null => HTTP 400
--
-- E o erro desse `.update()` nao era lido por ninguem, entao o laco girava ate
-- o teto de 50 jobs, a cada minuto, sobre uma fila VAZIA. Medido no gateway em
-- 23/09: 701.960 respostas 400 em 24 horas vindas deste unico caminho — 42% de
-- tudo o que o projeto respondeu no dia, com 0% de sucesso e nenhum sintoma
-- visivel, porque a function terminava com `success: true`.
--
-- ATENCAO — esta migration sozinha NAO apaga o laco, e a producao provou isso.
-- Ela foi aplicada as 21:32 UTC de 23/09 e o gateway continuou registrando
-- ~480 respostas 400 por minuto ate as 21:47, quando o worker corrigido subiu.
-- O motivo:
--
--     $ curl .../rpc/pick_delivery_automation_job   (funcao ja corrigida)
--     {"id":null,"user_id":null,...,"created_at":null}      HTTP 200
--
-- Para uma funcao `RETURNS <tipo composto>`, o PostgREST monta o formato da
-- linha mesmo quando o valor e NULL no SQL. Ou seja: pelo SQL a funcao agora
-- devolve NULO de verdade (o teste em item_delivery_job_laco prova), mas pela
-- API HTTP o cliente recebe um OBJETO — e objeto e verdadeiro em JS.
--
-- LICAO, que vale para toda RPC nova: se a resposta pode ser "nada", NAO use
-- `RETURNS <composto>`. Use `RETURNS SETOF <composto>`, que sai como `[]`.
-- Enquanto este contrato continuar sendo objeto, quem tem de decidir se veio
-- job e o CHAMADOR, testando a chave primaria — nunca o valor em si.
--
-- Esta correcao fica porque o contrato escrito no comentario original da
-- funcao ("NULL if none") era falso ate no SQL, e deixar isso de pe seria
-- manter a armadilha armada para o proximo chamador. Mas quem de fato fecha o
-- laco e o guard `if (!job?.id) break;` no worker.

CREATE OR REPLACE FUNCTION public.pick_delivery_automation_job()
RETURNS public.delivery_automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claimed public.delivery_automation_jobs;
BEGIN
    WITH candidate AS (
        SELECT id
        FROM public.delivery_automation_jobs
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE public.delivery_automation_jobs j
       SET status = 'running',
           picked_at = now(),
           attempts = attempts + 1
      FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.* INTO claimed;

    -- `claimed` aqui e uma linha de NULLs, nao um NULL. `id` e a chave
    -- primaria: se ela veio nula, nao houve linha.
    IF claimed.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_delivery_automation_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_delivery_automation_job() TO service_role;
