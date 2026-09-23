-- Passo 2 do teste inverso: as falhas. Nome de function inexistente = 404 do gateway.

-- Cenario A — 1 falha depois de 4 ok, e nada mais acontece. Esperado: 'media'
-- (intermitente: o alvo caiu e a ultima coisa que se sabe dele e a queda).
select public.clinvia_http_post('zz-teste-tropeco', 'teste-inverso-placar',
       'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/nao-existe-zz-teste', '{}'::jsonb);

-- Cenario B — PANE: 3 falhas, nenhum sucesso em 24h. Esperado: 'alta'
-- (e ainda assim somente_painel, por causa da linha de catalogo do passo 1).
select public.clinvia_http_post('zz-teste-pane', 'teste-inverso-placar',
       'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/nao-existe-zz-teste', '{}'::jsonb)
  from generate_series(1, 3);

-- Cenario C — 1 falha; no passo 3 o alvo volta. Esperado: 'baixa'.
select public.clinvia_http_post('zz-teste-volta', 'teste-inverso-placar',
       'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/nao-existe-zz-teste', '{}'::jsonb);

select 'passo 2 ok — rodar teste_inverso_3_voltar.sql' as passo;
