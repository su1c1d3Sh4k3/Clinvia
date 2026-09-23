-- TESTE DE INJECAO DE FALHA — passo 1 de 2.
--
-- "Monitor que nunca foi testado falhando nao vale nada." Este arquivo quebra
-- de proposito exatamente a dependencia que ficou semanas quebrada em silencio
-- (a chave que o alert-notify confere) e o `verify.sql` prova que o
-- cron-health-watch percebeu.
--
-- POR QUE ESTE TESTE E SEGURO
-- ===========================
-- Ele NAO altera configuracao nenhuma: nao mexe no vault, nao mexe em variavel
-- de ambiente, nao desliga cron. Faz UMA chamada avulsa ao alert-notify com uma
-- chave errada. O alert-notify recusa (que e o comportamento correto) e nada
-- mais acontece. O despachante de verdade continua funcionando ao lado, com a
-- chave certa, durante o teste inteiro. Reversivel por construcao: nao ha o que
-- reverter.
--
-- COMO RODAR
--   1. npx supabase db query --linked --file supabase/tests/security/item_cron_health_watch/injecao_de_falha.sql
--   2. espere ~10 segundos (o worker do pg_net precisa despachar e receber)
--   3. npx supabase db query --linked --file supabase/tests/security/item_cron_health_watch/verify.sql
--
-- O request_id devolvido aqui e o mesmo que aparece no verify como prova de
-- correlacao — e a unica forma de ligar uma linha de net._http_response a um
-- alvo, porque aquela tabela nao tem coluna de URL.

select public.clinvia_http_post(
    p_alvo    := 'alert-notify',
    p_origem  := 'teste:injecao-de-falha',
    p_url     := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
                 || '/functions/v1/alert-notify',
    p_headers := jsonb_build_object(
        'Content-Type',  'application/json',
        -- Authorization VALIDA: precisa passar pelo gateway para que a
        -- requisicao chegue ate a funcao. E la dentro que o teste acontece.
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1),
        -- x-service-key ERRADA: e este o defeito sendo reproduzido. Era isto,
        -- na pratica, que o JWT legado do vault causava.
        'x-service-key', 'chave-deliberadamente-errada-teste-de-injecao'
    ),
    p_body    := jsonb_build_object('action', 'dispatch'),
    p_timeout := 15000
) as request_id_injetado;
