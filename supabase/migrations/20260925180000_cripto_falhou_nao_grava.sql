-- `token:cripto-falhou` deixou de significar vazamento: agora significa recusa.
--
-- A linha catalogada em 20260925160000 descrevia o comportamento REAL de ontem —
-- "o chamador recebe null e grava a chave EM TEXTO PURO no banco". Era verdade:
-- `admin-update-profile` tinha `if (encrypted)` sem `else`, então o texto puro
-- sobrevivia no objeto de update e ia para a coluna.
--
-- O comportamento mudou no código (ordem dele: "se criptografar falhar, não grava
-- nada e devolve erro"): `encryptToken` devolvendo null agora é recusa de escrita
-- nos DOIS chamadores, e o front mostra o motivo ao super admin. Se a descrição
-- ficasse como está, o alerta mandaria procurar um vazamento que o código não
-- consegue mais produzir — e mandaria procurar no lugar errado.
--
-- A gravidade CONTINUA `alta`, e não é inércia: sem criptografia nenhuma conta
-- nova consegue cadastrar chave própria, e é um secret da plataforma que sumiu.
-- Só deixou de ser incidente de vazamento para ser incidente de indisponibilidade.
--
-- Sem `severidade_padrao` no update de propósito: reemitir o valor aqui faria
-- esta migration apagar em silêncio uma recalibragem futura do piso.

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
   set descricao =
           'A criptografia da chave OpenAI de um cliente falhou (secret '
           'OPENAI_TOKEN_ENCRYPTION_KEY ausente ou erro do WebCrypto). A chave NÃO '
           'foi gravada: os dois pontos de escrita recusam a gravação em vez de '
           'guardar a chave em claro. O efeito visível é que ninguém consegue '
           'cadastrar chave própria enquanto isto durar; o super admin vê o motivo '
           'na tela.',
       acao_padrao =
           'Confira OPENAI_TOKEN_ENCRYPTION_KEY nos secrets das edge functions. O '
           'contexto do incidente diz qual dos dois caminhos falhou '
           '(chave_de_criptografia_ausente = secret sumiu; excecao_do_webcrypto = '
           'valor do secret inválido). Nada a recuperar no banco: nada foi escrito.'
 where component = 'token:cripto-falhou';
