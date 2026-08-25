-- instances.workflow_code — código do fluxo n8n gravado PELO n8n (back), não mais
-- digitado no front (/ia-config perdeu o campo "Workflow ID").
--
-- Destino das mensagens por instância passa a ser, nesta ordem:
--   workflow_code -> workflow_id (legado, digitado à mão) -> webhook_url (legado)
-- em webhook-handle-message e instagram-webhook.
--
-- api-token-usage também resolve o tenant por workflow_code (o n8n manda o mesmo
-- código como "id" no relatório de tokens).

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS workflow_code text NULL;

COMMENT ON COLUMN public.instances.workflow_code IS
    'Código do workflow n8n desta instância, gravado pelo próprio n8n. Roteamento: https://webhooks.clinvia.com.br/webhook/<workflow_code>. Tem prioridade sobre workflow_id (legado).';

CREATE INDEX IF NOT EXISTS idx_instances_workflow_code
    ON public.instances (workflow_code)
    WHERE workflow_code IS NOT NULL;
