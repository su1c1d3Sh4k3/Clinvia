-- Volta a descrição/ação de `token:cripto-falhou` ao texto de 20260925160000.
--
-- Só faz sentido junto com o revert do código (o `else` de admin-update-profile e
-- o ramo `if (!key)` de encryptToken). Rodar isto sozinho põe de volta um texto
-- que manda o plantão procurar chave em texto puro que o código não gera mais.

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
   set descricao =
           'A criptografia da chave OpenAI de um cliente falhou. O chamador recebe null '
           'e grava a chave EM TEXTO PURO no banco — um vazamento criado por acidente, '
           'em silêncio.',
       acao_padrao =
           'Trate como incidente de segurança. Confira OPENAI_TOKEN_ENCRYPTION_KEY nos '
           'secrets e procure em profiles.openai_token as linhas SEM o prefixo enc:.'
 where component = 'token:cripto-falhou';
