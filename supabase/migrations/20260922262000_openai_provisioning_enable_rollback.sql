-- Rollback da 20260922262000: desliga o provisionamento automatico na hora.
--
-- Efeito imediato: claim_openai_provision_jobs() volta a devolver zero linhas,
-- o cron sai sem fazer nada e nenhuma conta nova ganha projeto na OpenAI. Os
-- jobs pendentes ficam na fila (nao sao descartados) e voltam a ser processados
-- quando o provisionamento for religado.
--
-- Nao mexe em conta ja provisionada: projeto, chave e limite continuam de pe.

update public.llm_platform_settings
set provisioning_enabled = false,
    updated_at = now()
where id;
