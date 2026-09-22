-- RASCUNHO — NAO APLICADO. E O ULTIMO ARQUIVO DA ETAPA, de proposito.
--
-- Etapa "projeto e chave OpenAI por conta", delta 3: liga a chave geral.
--
-- Enquanto `provisioning_enabled = false`, `claim_openai_provision_jobs()`
-- devolve zero linhas e o cron `openai-provision-worker` sai sem fazer nada —
-- mesmo com jobs na fila. Este arquivo e o unico interruptor entre "tudo pronto
-- e inerte" e "conta nova aprovada ganha projeto e chave na OpenAI sozinha".
--
-- ORDEM OBRIGATORIA (aplicar SO depois de tudo isto):
--   1. secret OPENAI_ADMIN_KEY_WRITE criado no projeto Supabase;
--   2. edge functions provision-openai-project, openai-provision-worker e
--      sync-openai-usage deployadas e o cron do worker agendado;
--   3. teste ponta a ponta com UMA conta de teste nova aprovada do zero, com o
--      projeto aparecendo na organizacao da OpenAI;
--   4. provisionamento manual das contas de hoje concluido (lista aprovada pelo
--      user, uma por uma).
--
-- Aplicar antes disso cria projeto na OpenAI para toda conta aprovada sem que
-- haja onde ver o resultado. O rollback ao lado desliga na hora.

update public.llm_platform_settings
set provisioning_enabled = true,
    updated_at = now()
where id;
