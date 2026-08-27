-- Ticket único por (contato, conexão) na aba Resolvidos.
--
-- USER RULE: cada instância é um workflow separado. Se o cliente conversou em 10
-- conexões, são 10 tickets. Na aba Resolvidos aparece UMA linha por
-- (contato, conexão) — a conversa resolvida mais recente daquele par — e apenas
-- quando aquele par NÃO tem conversa aberta/pendente (nesse caso o cliente
-- aparece em Abertos/Pendentes, com todo o histórico dentro do próprio ticket).
--
-- O estado é materializado em `resolved_head` porque o PostgREST não faz
-- DISTINCT ON nem NOT EXISTS correlacionado: com a coluna, a aba Resolvidos
-- continua sendo uma query normal em `conversations` e mantém filtros, busca
-- global, contagem exata, paginação, RLS e realtime sem nenhuma duplicação de
-- lógica.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS resolved_head BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.conversations.resolved_head IS
  'true = esta é a conversa que representa o par (contato, conexão) na aba Resolvidos do inbox. Mantida por trg_conversations_resolved_head.';

-- Conexão da conversa. Espelha a convenção do resto do projeto: instance_id
-- preenchido = WhatsApp; nulo com instagram_instance_id = Instagram; ambos nulos
-- (legado) caem num balde sentinela.
CREATE OR REPLACE FUNCTION public.conversation_channel_key(
  p_instance_id UUID,
  p_instagram_instance_id UUID
)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_instance_id, p_instagram_instance_id, '00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- Recalcula a cabeça de um par (contato, conexão).
CREATE OR REPLACE FUNCTION public.recompute_resolved_head(
  p_contact_id UUID,
  p_channel_key UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Conversa sem contato (grupo/legado) nunca é agrupada: fica sempre visível.
  IF p_contact_id IS NULL THEN
    RETURN;
  END IF;

  WITH escopo AS (
    SELECT
      c.id,
      c.status::TEXT AS status,
      bool_or(c.status::TEXT IN ('open', 'pending')) OVER () AS tem_ativo,
      row_number() OVER (
        ORDER BY COALESCE(c.resolved_at, c.last_message_at, c.created_at) DESC NULLS LAST, c.id DESC
      ) AS rn
    FROM public.conversations c
    WHERE c.contact_id = p_contact_id
      AND public.conversation_channel_key(c.instance_id, c.instagram_instance_id) = p_channel_key
  ),
  alvo AS (
    SELECT e.id, (NOT e.tem_ativo AND e.status = 'resolved' AND e.rn = 1) AS head
    FROM escopo e
  )
  UPDATE public.conversations c
  SET resolved_head = a.head
  FROM alvo a
  WHERE c.id = a.id
    AND c.resolved_head IS DISTINCT FROM a.head;
END;
$$;

-- Trigger. Só nas colunas que mudam a resposta — NUNCA em last_message_at, que
-- é escrita a cada mensagem recebida.
--
-- Sem recursão: o UPDATE de recompute_resolved_head toca apenas `resolved_head`,
-- que não está na lista do `UPDATE OF`.
CREATE OR REPLACE FUNCTION public.trg_conversations_resolved_head()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_key UUID;
  v_new_key UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_resolved_head(
      OLD.contact_id,
      public.conversation_channel_key(OLD.instance_id, OLD.instagram_instance_id)
    );
    RETURN OLD;
  END IF;

  v_new_key := public.conversation_channel_key(NEW.instance_id, NEW.instagram_instance_id);
  PERFORM public.recompute_resolved_head(NEW.contact_id, v_new_key);

  -- Conversa mudou de contato ou de conexão: o par antigo também precisa de
  -- nova cabeça.
  IF TG_OP = 'UPDATE' THEN
    v_old_key := public.conversation_channel_key(OLD.instance_id, OLD.instagram_instance_id);
    IF OLD.contact_id IS DISTINCT FROM NEW.contact_id OR v_old_key IS DISTINCT FROM v_new_key THEN
      PERFORM public.recompute_resolved_head(OLD.contact_id, v_old_key);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_conversations_resolved_head ON public.conversations;
CREATE TRIGGER zz_conversations_resolved_head
AFTER INSERT OR DELETE OR UPDATE OF status, contact_id, instance_id, instagram_instance_id
ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.trg_conversations_resolved_head();

-- Aba Resolvidos = user_id + resolved_head, ordenada por last_message_at.
CREATE INDEX IF NOT EXISTS idx_conversations_resolved_head
  ON public.conversations (user_id, last_message_at DESC)
  WHERE resolved_head;

-- Lista de fragmentos do menu lateral (todas as conversas do par).
CREATE INDEX IF NOT EXISTS idx_conversations_contact_instance
  ON public.conversations (contact_id, instance_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
