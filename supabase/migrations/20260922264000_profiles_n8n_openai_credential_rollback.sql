-- Rollback de 20260922264000_profiles_n8n_openai_credential.sql
--
-- Derruba as duas colunas da credencial OpenAI no n8n. Nao ha grant nem policy
-- para desfazer (a coluna nasceu invisivel para o front: `profiles` tem grant
-- por COLUNA e nenhuma delas foi concedida).
--
-- Consequencia: o payload de criar/deletar workflow volta a sair sem
-- `n8n_openai_credential_id`/`_name`. Se o workflow do n8n ja depender desses
-- campos, isso quebra a criacao de workflow — nao rodar sem alinhar com o n8n.

alter table public.profiles
    drop column if exists n8n_openai_credential_id,
    drop column if exists n8n_openai_credential_name;
