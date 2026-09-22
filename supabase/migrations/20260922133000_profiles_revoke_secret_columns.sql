-- SEGURANCA — vazamento de credencial (achado em 22/09/2026).
--
-- A policy "Users can view all profiles" e SELECT ... USING (true) para o role
-- `authenticated`: QUALQUER usuario logado de QUALQUER tenant le a linha de
-- profiles de todos os outros, incluindo `openai_token` — que esta gravado em
-- TEXTO PURO (4 chaves sk-proj-... de clientes reais). Guardar aqui a chave que a
-- plataforma cria pioraria o problema.
--
-- Correcao cirurgica por privilegio de COLUNA: o role `authenticated` deixa de
-- poder ler as colunas secretas. O Super Admin le via edge function
-- `admin-openai-account` (service role, mascarada por padrao).
--
-- O escopo da policy de LINHA (que tambem expoe e-mail, empresa e custo de todos
-- os tenants) e o item 6 da lista do user: auditoria de RLS, com plano proprio.
--
-- ORDEM DE APLICACAO (decisao do user): esta migration entra SO DEPOIS do deploy
-- do front que removeu o `select("*")` em profiles (ChatArea.tsx) e moveu a
-- leitura do token para a edge function (AdminClients.tsx). Aplicar antes gera
-- `permission denied for table profiles` no chat de todos os usuarios.
--
-- CORRIGIDO EM 22/09 (achado no arnes do item 0.5): `revoke select (coluna)` e
-- SILENCIOSAMENTE INOCUO enquanto existir `grant select on profiles` no nivel de
-- TABELA — o privilegio de coluna e derivado do da tabela. A versao anterior
-- deste arquivo so tinha os `revoke select (col)` e nao teria efeito nenhum.
-- Tem de tirar o SELECT da TABELA e devolver coluna por coluna.
--
-- Pre-requisito ja verificado: nenhuma query viva do front faz `select("*")` em
-- profiles (so `src/components/ChatArea.tsx.bak`, que nao compila). Todas as 12
-- leituras nomeiam colunas. Se alguem voltar a usar `*`, quebra com 42501.

begin;

set local lock_timeout = '5s';

do $mig$
declare cols text;
begin
  -- Todas as colunas MENOS as tres secretas. Montado do catalogo para nao
  -- precisar manter lista a mao (profiles tem 51 colunas).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('openai_token', 'openai_api_key_id',
                            'openai_service_account_id');

  execute 'revoke select on public.profiles from authenticated, anon';
  execute format('grant select (%s) on public.profiles to authenticated, anon', cols);
end $mig$;

commit;

-- Sanidade: o service_role continua com acesso total (nao passa por RLS nem por
-- privilegio de coluna revogado de outro role), e o proprio dono da linha
-- tambem nao le mais a coluna — por design: a chave so sai pela edge function.
-- O alcance de LINHA nao muda: anon e authenticated continuam com o mesmo
-- SELECT de antes, menos as 3 colunas.
