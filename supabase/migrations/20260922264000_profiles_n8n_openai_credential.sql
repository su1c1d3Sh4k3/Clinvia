-- Credencial do OpenAI no n8n, por conta.
--
-- O n8n precisa saber QUAL credencial usar no workflow da conta. O id e o nome
-- da credencial sao devolvidos/registrados pelo proprio n8n, entao ficam aqui
-- para viajar no payload de `criar_workflow`/`deleta_workflow`
-- (edge function ia-workflow-webhook, disparada ao ligar/desligar a IA de uma
-- conexao). Vazio vai como `null` no payload.
--
-- Sem grant para anon/authenticated de proposito: `profiles` tem grant por
-- COLUNA (nao existe grant de tabela), entao coluna nova nasce invisivel para o
-- front — e quem monta o payload e a edge function com service role.
--
-- Rollback: 20260922264000_profiles_n8n_openai_credential_rollback.sql

alter table public.profiles
    add column if not exists n8n_openai_credential_id text,
    add column if not exists n8n_openai_credential_name text;

comment on column public.profiles.n8n_openai_credential_id is
    'Id da credencial OpenAI da conta dentro do n8n. Viaja no payload de criar/deletar workflow; vazio = null.';

comment on column public.profiles.n8n_openai_credential_name is
    'Nome da credencial OpenAI da conta no n8n (por convencao, igual ao nome do projeto: `Clinbia - <empresa> - <id curto>`).';
