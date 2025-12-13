-- Add default_queue_id to instances table
ALTER TABLE public.instances
ADD COLUMN IF NOT EXISTS default_queue_id UUID REFERENCES public.queues(id) ON DELETE SET NULL;
