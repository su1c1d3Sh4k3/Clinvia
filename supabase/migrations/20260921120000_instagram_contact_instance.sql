-- Conexão de WhatsApp que atende os pacientes vindos do Instagram.
--
-- O Instagram não entrega telefone: o webhook cria um contato próprio, preso ao
-- IGSID (contacts.instagram_id), sem número. Por isso um agendamento nascido de
-- uma conversa de Instagram não tem como saber em qual conexão/funil gravar, e
-- a IA não tem um número para oferecer ao paciente que quer falar no WhatsApp.
--
-- Esta coluna é a resposta das duas coisas: a clínica escolhe, na aba Instagram
-- de Conexões, qual conexão de WhatsApp a IA divulga (vira o link wa.me do
-- payload) e é essa mesma conexão que fica vinculada ao agendamento feito pelo
-- link público.
--
-- ON DELETE SET NULL: apagar a conexão de WhatsApp não pode derrubar a conta de
-- Instagram — ela volta a ficar "sem número de contato" até a clínica escolher
-- outra.

ALTER TABLE public.instagram_instances
    ADD COLUMN IF NOT EXISTS contact_instance_id uuid
        REFERENCES public.instances(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.instagram_instances.contact_instance_id IS
    'Conexao de WhatsApp divulgada pela IA nas conversas desta conta de Instagram e usada como instancia do agendamento feito pelo link publico.';

-- Lookup do webhook/API é sempre "dada a conta IG, qual a conexão" — índice só
-- para o caminho inverso (quais contas IG apontam para a conexão X), usado na
-- limpeza quando uma conexão de WhatsApp é removida.
CREATE INDEX IF NOT EXISTS idx_instagram_instances_contact_instance
    ON public.instagram_instances (contact_instance_id)
    WHERE contact_instance_id IS NOT NULL;
