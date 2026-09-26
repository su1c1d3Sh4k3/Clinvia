-- Segredos fora do codigo: catalogo dos dois modos novos de falhar
-- =================================================================
-- Em 26/09/2026 o admintoken da UAZAPI saiu do codigo (estava em texto puro em
-- `uzapi-create-instance/index.ts` e, pior, em `src/lib/uzapi.ts`, que roda no
-- NAVEGADOR — o bundle publico entregava credencial de administrador do
-- provedor a cada visitante). Passou a vir de `Deno.env.get('UAZAPI_ADMIN_
-- TOKEN')`, sem fallback: sem o secret a function falha FECHADA.
--
-- Tirar o segredo do codigo abre dois modos de falhar que antes nao existiam,
-- e os dois precisam de nome proprio para nao chegarem mudos:
--
--   1. `uzapi_admin_token_missing` — o secret nao esta no ambiente. Nenhuma
--      clinica consegue conectar WhatsApp nao-oficial enquanto durar. E defeito
--      de CONFIGURACAO nosso, nao do cliente, e por isso ALTA: a tela do
--      cliente so diz "fale com o suporte", entao se isto nao alertar, o
--      primeiro a saber e ele pelo telefone do cliente.
--
--   2. `uazapi:varredura-cega` — o provedor responde 200 com lista VAZIA
--      enquanto temos instancia UAZAPI cadastrada. Foi o que aconteceu no
--      minuto seguinte a rotacao: o admintoken novo autentica (200; token
--      antigo e token falso dao 401) mas enxerga OUTRO escopo de
--      administrador, e `/instance/all` voltou `[]` com as 11 instancias
--      inteiras no ar. Sem este componente o resultado seria "0 orfas" com
--      `success: true` — saude aparente — e na passada seguinte o fechamento
--      automatico resolveria os 9 incidentes de orfa abertos, APAGANDO a
--      divida em vez de mostra-la.
--
-- Severidade de (2) e `media`, nao alta: quem perdeu a visao foi um detector de
-- divida de cadastro, nao a entrada da mensagem do paciente. Media cai no
-- resumo de 2 em 2 horas, que e onde um detector cego deve aparecer — nao no
-- telefone as 01:50 da manha, que e o horario do cron.

set lock_timeout = '5s';
set statement_timeout = '120s';

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao,
     severidade_padrao, severidade_teto, somente_painel, is_active)
values
    ('uazapi:varredura-cega', 'exato', 'detector',
     'a UAZAPI respondeu 200 com lista vazia de instancias enquanto public.instances tem linha UAZAPI',
     'O detector de instancia orfa perdeu a visao — ele NAO esta dizendo que nao ha orfa, esta dizendo '
     'que nao conseguiu medir. Causa conhecida: o admintoken do secret UAZAPI_ADMIN_TOKEN autentica mas '
     'pertence a um escopo de administrador diferente do que criou as instancias (foi o efeito da rotacao '
     'de 26/09/2026). Conferir na UAZAPI qual admin enxerga as instancias e por o token DESSE admin no '
     'secret; `curl -H "admintoken: <valor>" https://clinvia.uazapi.com/instance/all` distingue os casos: '
     '401 = token invalido, 200 com [] = escopo errado. Enquanto durar, a criacao de instancia nova pelo '
     'painel tambem pode estar afetada, e os incidentes de orfa abertos ficam congelados de proposito.',
     'media', null, false, true),

    ('uzapi_admin_token_missing', 'exato', 'servico',
     'a edge function uzapi-create-instance nao encontrou o secret UAZAPI_ADMIN_TOKEN no ambiente',
     'Nenhum cliente consegue criar/conectar instancia UAZAPI enquanto isto durar, e a tela dele so diz '
     '"fale com o suporte". Conferir o secret UAZAPI_ADMIN_TOKEN no projeto Supabase e redeployar a '
     'function se o secret tiver sido criado depois do ultimo deploy. NAO existe fallback no codigo de '
     'proposito: um fallback faria a criacao "quase funcionar" com credencial errada e devolveria erro do '
     'provedor no lugar do nosso, que e mais caro de diagnosticar do que a falha limpa.',
     'alta', null, false, true)

on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();
