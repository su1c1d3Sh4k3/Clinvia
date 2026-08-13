-- Remove configuração manual de fila e funil por instância (UAZAPI):
-- comportamento agora é unificado com a API oficial — nova conversa vai para
-- fila 'Atendimento IA' (IA ligada) ou 'Atendimento Humano', e a negociação
-- no CRM (crm_client) é sempre criada. Nenhuma function do banco referencia
-- essas colunas (verificado via pg_proc).
ALTER TABLE public.instances DROP COLUMN IF EXISTS default_queue_id;
ALTER TABLE public.instances DROP COLUMN IF EXISTS auto_create_deal_funnel_id;
