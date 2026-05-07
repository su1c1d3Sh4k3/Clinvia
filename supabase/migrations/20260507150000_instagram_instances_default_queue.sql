-- Adiciona default_queue_id em instagram_instances pra paridade com a tabela
-- 'instances' (WhatsApp). Quando uma conversa Instagram é criada via
-- instagram-webhook, ela passa a herdar a fila default do tenant.
ALTER TABLE public.instagram_instances
    ADD COLUMN IF NOT EXISTS default_queue_id UUID
        REFERENCES public.queues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ig_instances_default_queue
    ON public.instagram_instances(default_queue_id);

COMMENT ON COLUMN public.instagram_instances.default_queue_id IS
    'Fila default que conversas Instagram herdam ao serem criadas pelo webhook.';
