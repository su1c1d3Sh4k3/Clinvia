-- APLICADA em producao em 22/09/2026, depois do teste ponta a ponta (projeto
-- criado, chave cifrada, limite de US$ 200 e chamada real HTTP 200).
--
-- Etapa "projeto e chave OpenAI por conta", delta 3: liga a chave geral.
--
-- Enquanto `provisioning_enabled = false`, `claim_openai_provision_jobs()`
-- devolve zero linhas e o cron `openai-provision-worker` sai sem fazer nada —
-- mesmo com jobs na fila. Este arquivo e o unico interruptor entre "tudo pronto
-- e inerte" e "conta nova aprovada ganha projeto e chave na OpenAI sozinha".
--
-- ORDEM CUMPRIDA antes de aplicar:
--   1. chave de admin da organizacao no secret OPENAI_ADMIN_KEY (o
--      OPENAI_ADMIN_KEY_WRITE nao existe; a funcao cai nela com aviso);
--   2. edge functions provision-openai-project, openai-provision-worker e
--      sync-openai-usage deployadas e os 3 crons agendados (20260922261500);
--   3. teste ponta a ponta com conta de teste nova aprovada do zero.
--
-- O provisionamento das contas que ja existiam foi feito na sequencia, uma a
-- uma, enfileirando a mao. O rollback ao lado desliga na hora.

update public.llm_platform_settings
set provisioning_enabled = true,
    updated_at = now()
where id;
