-- Backfill do CRM por conexão (rodado em lotes; registrado aqui para histórico).
-- Ordem exata aplicada em produção:
--
--   1. lotes de 1000 atribuindo canal aos cards existentes (repetir até UPDATE 0)
--   2. finalizar cards ativos sem NENHUMA conversa (invariante 20260817130000)
--   3. split: 1 card por (contato, canal) para tickets abertos
--   4. reverter as "ressurreições" (contatos que não tinham card ativo nenhum —
--      backlog legado anterior a 20260817130000, fora do escopo desta mudança)
--
-- Resultado em produção: 3.190 -> 3.321 cards ativos, 177 splits reais,
-- 498 cards sentinela (contatos cujas conversas legadas não têm canal nenhum).

-- ---- Passo 1: canal do card = conversa COM canal mais próxima da criação do card
--      (preferindo as criadas ANTES dele). Repetir até UPDATE 0.
WITH alvo AS (
  SELECT cc.id, x.instance_id AS inst, x.instagram_instance_id AS ig
  FROM crm_client cc
  JOIN LATERAL (
    SELECT c.instance_id, c.instagram_instance_id
    FROM conversations c
    WHERE c.contact_id = cc.contact_id
      AND c.user_id = cc.user_id
      AND (c.instance_id IS NOT NULL OR c.instagram_instance_id IS NOT NULL)
    ORDER BY (c.created_at <= cc.created_at) DESC,
             abs(extract(epoch FROM (c.created_at - cc.created_at))),
             c.last_message_at DESC NULLS LAST
    LIMIT 1
  ) x ON TRUE
  WHERE cc.instance_id IS NULL
    AND cc.instagram_instance_id IS NULL
  LIMIT 1000
)
UPDATE crm_client cc
SET instance_id = a.inst,
    instagram_instance_id = a.ig,
    updated_at = NOW()
FROM alvo a
WHERE cc.id = a.id;

-- ---- Passo 2: card ativo sem conversa nenhuma é proibido
UPDATE crm_client cc
SET stage = 'Finalizado', is_active = FALSE, stage_changed_at = NOW(), updated_at = NOW()
WHERE cc.is_active
  AND NOT EXISTS (SELECT 1 FROM conversations c
                  WHERE c.contact_id = cc.contact_id AND c.user_id = cc.user_id);

-- ---- Passo 3: split — 1 card ativo por (contato, canal) com ticket aberto
WITH novos AS (
  INSERT INTO crm_client (user_id, contact_id, stage, instance_id, instagram_instance_id)
  SELECT DISTINCT ON (c.contact_id, c.instance_id, c.instagram_instance_id)
         c.user_id,
         c.contact_id,
         CASE WHEN q.name = 'Atendimento IA' THEN 'Em Atendimento IA' ELSE 'Em Atendimento Humano' END,
         c.instance_id,
         c.instagram_instance_id
  FROM conversations c
  LEFT JOIN queues q ON q.id = c.queue_id
  WHERE c.status IN ('open', 'pending')
    AND c.contact_id IS NOT NULL
    AND (c.instance_id IS NOT NULL OR c.instagram_instance_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.contact_id = c.contact_id
        AND cc.user_id = c.user_id
        AND cc.is_active
        AND cc.instance_id IS NOT DISTINCT FROM c.instance_id
        AND cc.instagram_instance_id IS NOT DISTINCT FROM c.instagram_instance_id)
  ORDER BY c.contact_id, c.instance_id, c.instagram_instance_id, c.last_message_at DESC NULLS LAST
  RETURNING id, contact_id, user_id, instance_id, instagram_instance_id
)
INSERT INTO crm_client_channel_split_audit (card_id, contact_id, user_id, instance_id, instagram_instance_id)
SELECT id, contact_id, user_id, instance_id, instagram_instance_id FROM novos;

-- ---- Passo 4: o passo 3 também "ressuscitaria" 1.313 contatos do backlog legado
--      (ticket aberto sem NENHUM card ativo, anterior ao trigger de ciclo de vida).
--      Isso não faz parte desta mudança: mantemos só os splits reais.
CREATE TEMP TABLE tmp_resur AS
SELECT a.card_id
FROM crm_client_channel_split_audit a
WHERE NOT EXISTS (
  SELECT 1 FROM crm_client cc
  WHERE cc.contact_id = a.contact_id AND cc.user_id = a.user_id AND cc.is_active
    AND NOT EXISTS (SELECT 1 FROM crm_client_channel_split_audit a2 WHERE a2.card_id = cc.id)
);

DELETE FROM crm_client_history  WHERE crm_client_id IN (SELECT card_id FROM tmp_resur);
DELETE FROM crm_client_services WHERE crm_client_id IN (SELECT card_id FROM tmp_resur);
DELETE FROM crm_client          WHERE id            IN (SELECT card_id FROM tmp_resur);
DELETE FROM crm_client_channel_split_audit WHERE card_id IN (SELECT card_id FROM tmp_resur);

DROP TABLE tmp_resur;
