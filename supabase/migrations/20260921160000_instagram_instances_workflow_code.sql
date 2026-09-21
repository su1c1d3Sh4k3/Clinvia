-- O Instagram tem fluxo proprio no n8n (o contato nao tem telefone e o link de
-- agendamento pede identificacao), mas a instancia de Instagram so tinha
-- workflow_id: o roteamento acabava caindo no workflow_code da instancia de
-- WhatsApp da conta. Espelha a coluna de public.instances.

ALTER TABLE public.instagram_instances
    ADD COLUMN IF NOT EXISTS workflow_code text;

COMMENT ON COLUMN public.instagram_instances.workflow_code IS
    'Path do webhook do fluxo de Instagram no n8n (gravado pelo proprio n8n): https://webhooks.clinvia.com.br/webhook/<workflow_code>. Sem ele o instagram-webhook cai no workflow da instancia de WhatsApp da conta.';
