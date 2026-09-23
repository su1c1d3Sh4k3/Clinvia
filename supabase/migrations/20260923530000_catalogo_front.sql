-- Catalogo do front: a familia `front:` entra no painel e para no painel.
--
-- POR QUE `baixa` E `somente_painel = true`, E NAO UMA ESCOLHA MAIS "SEGURA":
--
-- Nao existe, neste projeto, NENHUMA medicao de volume de erro de navegador.
-- Nunca foi coletado — ate esta etapa o erro do front morria no console do
-- cliente. Entao o orcamento de ruido exigido pelo plano nao pode ser estimado
-- aqui: nao ha 7 dias de historico para contar. O que da para afirmar com
-- honestidade e a ORDEM DE GRANDEZA do pior caso, e ela e desconfortavel: uma
-- tela em loop de render dispara um erro por frame, e um unico bundle quebrado
-- atinge todos os usuarios logados ao mesmo tempo.
--
-- Contra isso ha dois freios ja implementados, e nenhum deles e severidade:
--
--   * no navegador, teto de 8 por sessao mais deduplicacao por mensagem;
--   * no servidor, `request_id` deterministico (versao + rota + tipo + erro +
--     hora) — a mesma falha vira UM evento por hora por mais vezes que chegue.
--
-- Mesmo com os dois, chutar `alta` hoje seria decidir sem dado que o telefone
-- dele toca; e chutar um limiar "conservador" e como o limiar de 3x do custo
-- nasceu errado antes de haver medicao. A escolha honesta e: uma semana de
-- painel com trafego real, contagem na mao, e SO ENTAO decidir se alguma rota
-- merece promocao. Promover depois e barato; despromover depois de acordar
-- alguem de madrugada custa a confianca no alerta inteiro.
--
-- Uma linha de prefixo, nao uma por rota: `front:` cobre `front:/crm`,
-- `front:/agendar`, `front:/` e tudo o que aparecer amanha. O nome da rota ja
-- esta no componente, entao o painel agrupa sozinho sem precisar de cadastro.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel)
values
    ('front:', 'prefixo', 'servico',
     'Erro de JavaScript no navegador de um usuario real. O que vem depois dos dois-pontos e a ROTA onde quebrou, ja mascarada: id, telefone e a query string inteira sao descartados antes de sair do navegador. A descricao traz a familia do navegador e a versao do bundle que ele estava rodando.',
     'Compare a versao do bundle do incidente com a que esta publicada agora. Bundle antigo e o caso mais comum e nao e defeito novo: o usuario esta com service worker velho em cache (ver docs de PWA/Cloudflare). Se a versao bater com a publicada, e defeito vivo — a pilha do incidente aponta o arquivo, e a rota diz quem esta sendo afetado.',
     'baixa', true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       somente_painel    = excluded.somente_painel,
       updated_at        = now();
