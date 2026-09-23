-- Teste inverso do placar do bloco A: quebra de proposito e prova que o
-- incidente nasce com a severidade CERTA — nao so que nasce.
--
-- CADA ARQUIVO E UMA INVOCACAO SEPARADA, e isso e essencial: o `db query` roda o
-- arquivo inteiro em UMA transacao, e `created_at default now()` e o relogio da
-- TRANSACAO. Tudo num arquivo so daria o mesmo carimbo de tempo a chamadas que
-- deveriam estar em ordem. Foi exatamente esse empate que expos o defeito do
-- `order by created_at` no `ultimo_code` (corrigido para `order by request_id`).
--
--   1) --file .../teste_inverso_1_preparar.sql      (catalogo + respostas ok)
--   2) --file .../teste_inverso_2_falhar.sql        (as falhas)
--   3) --file .../teste_inverso_3_voltar.sql        (o alvo C volta a responder)
--   4) esperar ~20s
--      --file .../teste_inverso_ler.sql             (roda o varredor e julga)
--   5) --file .../teste_inverso_limpar.sql          (SEMPRE, mesmo se reprovar)
--
-- SEGURANCA: o componente sai como `cron-http:zz-teste-<cenario>`. A linha de
-- catalogo abaixo e o prefixo `cron-http:zz-teste`, mais LONGO que `cron-http:`,
-- e `incident_component_info` escolhe o prefixo mais longo — entao o cenario de
-- PANE, que nasce 'alta', fica somente_painel e NAO chega no telefone. Sem esta
-- linha o teste dispararia um alerta real.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, somente_painel, severidade_padrao, is_active)
values
    ('cron-http:zz-teste', 'prefixo', 'detector',
     'Alvo HTTP de teste do placar do bloco A. Nao existe em producao.',
     'Nenhuma. Se aparecer fora de um teste em andamento, e sujeira: apague.',
     true, 'baixa', true)
on conflict (component) do update
   set somente_painel = true, is_active = true, updated_at = now();

-- URL de sucesso: httpbin devolve 204 a um POST, sem autenticacao e sem efeito.
-- Nao da para usar o proprio gateway: POST sem chave e 401 ou 404 em toda rota
-- publica dele, e POST numa function real teria efeito colateral.

-- Cenario A (TROPECO, a falha e a ultima coisa que se sabe do alvo): 4 ok
select public.clinvia_http_post('zz-teste-tropeco', 'teste-inverso-placar',
       'https://httpbin.org/status/204', '{}'::jsonb) from generate_series(1, 4);

-- Cenario C (o caso REAL de 23/09: o alvo volta a responder antes da varredura): 4 ok
select public.clinvia_http_post('zz-teste-volta', 'teste-inverso-placar',
       'https://httpbin.org/status/204', '{}'::jsonb) from generate_series(1, 4);

select 'passo 1 ok — rodar teste_inverso_2_falhar.sql' as passo;
