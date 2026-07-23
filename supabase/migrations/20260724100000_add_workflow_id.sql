-- Workflow ID do n8n: preenchido pelo cliente em /ia-config quando a IA é ligada.
-- Quando presente, TODAS as mensagens (qualquer instância/provider) são roteadas
-- para https://webhooks.clinvia.com.br/webhook/<workflow_id>, tornando o fluxo
-- n8n independente da instância (sobrevive a troca de instância / migração Meta).
ALTER TABLE public.ia_config ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE public.instances ADD COLUMN IF NOT EXISTS workflow_id TEXT;
