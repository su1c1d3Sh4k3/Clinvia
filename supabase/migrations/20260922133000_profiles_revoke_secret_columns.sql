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

revoke select (openai_token) on public.profiles from authenticated;
revoke select (openai_token) on public.profiles from anon;
revoke select (openai_api_key_id) on public.profiles from authenticated;
revoke select (openai_api_key_id) on public.profiles from anon;
revoke select (openai_service_account_id) on public.profiles from authenticated;
revoke select (openai_service_account_id) on public.profiles from anon;

-- Sanidade: o service_role continua com acesso total (nao passa por RLS nem por
-- privilegio de coluna revogado de outro role), e o proprio dono da linha
-- tambem nao le mais a coluna — por design: a chave so sai pela edge function.
