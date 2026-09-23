-- Passo 3 do teste inverso: so o cenario C. O alvo volta a responder ok antes da
-- proxima passada do varredor — que e o que acontece de verdade, ja que o
-- cron-health-watch roda de 5 em 5 minutos e o alvo costuma rodar de minuto em
-- minuto. E o unico jeito de a falha isolada chegar em 'baixa'.

select public.clinvia_http_post('zz-teste-volta', 'teste-inverso-placar',
       'https://httpbin.org/status/204', '{}'::jsonb) from generate_series(1, 2);

select 'passo 3 ok — esperar ~20s e rodar teste_inverso_ler.sql' as passo;
