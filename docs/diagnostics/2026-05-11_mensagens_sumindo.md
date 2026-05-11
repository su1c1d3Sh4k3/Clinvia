# Diagnóstico — Mensagens chegando no WhatsApp mas NÃO aparecendo na plataforma

> Investigação extensa do fluxo de webhook → conclusão: **8.5% das mensagens
> processadas SOMEM** silenciosamente. Causa raiz identificada com evidência
> estatística. Correção pendente de aprovação do usuário.

## 1. Fluxo completo de recebimento (mapeado)

```
WhatsApp
   ↓
UZAPI (uazapi.com)
   ↓ POST webhook
edge_function: webhook-queue-receiver
   ↓ INSERT em webhook_queue (status='pending')
   ↓ invoca processor em background
edge_function: webhook-queue-processor
   ↓ claim 10 jobs (status='processing')
   ↓ rotear por event_type
      ├── messages_update/ack → webhook-handle-status
      └── messages          → webhook-handle-message
                              ↓ valida payload
                              ↓ fetch instance
                              ↓ persiste foto contato  ← LENTO (até 24s)
                              ↓ insere/atualiza contato/grupo
                              ↓ insere/atualiza conversation
                              ↓ baixa media (se houver)
                              ↓ INSERT em messages ★
                              ↓ push notifications
                              ↓ webhook externo (n8n)
                              ↓ return 200
```

★ = ponto crítico onde mensagens "somem" se algo dá errado antes.

## 2. Evidência estatística — 8.5% de drop silencioso

Últimas 2h: 213 jobs `done` em `webhook_queue` para evento `messages`.
**18 deles (8.5%)** têm `evolution_id` no payload mas **NÃO existem em `messages`**.

| Estado | Quantidade | Mean time | Median | P95 |
|---|---:|---:|---:|---:|
| **Inserido OK** | 195 | 20.09s | 10.67s | 70.17s |
| **MISSING** ⚠️ | 18 | **41.17s** | **36.58s** | 68.49s |

**Correlação clara**: jobs com `process_duration` alto têm probabilidade muito maior de não inserir a mensagem.

### Mensagens perdidas (sample real)

| Instance | Sender | Tipo | Process duration |
|---|---|---|---:|
| clinica | Achados do Thiasoc | ImageMessage grupo | 113.6s |
| dracintiaconsultório | Gabi | Conversation 1-1 | 60.5s |
| dracintiaconsultório | Gabriela Andrade | Conversation 1-1 | 58.8s |
| recepção | Carolina Pitta | ReactionMessage grupo | 56.3s |
| clinica | Marília Ferreira | Conversation 1-1 | 45.1s |
| clinica | Fabricia Souza (outbound) | Conversation 1-1 | 41.7s |
| dracintiaconsultório | Cleia | Conversation 1-1 | 23.2s |

Reparou: **mensagens individuais (`is_group=false`) também somem**, não é só grupo. Texto puro ("Conversation") soma — não é só mídia.

## 3. Causa raiz identificada

### `webhook-handle-message/index.ts` linhas 599-680 e 948-969

Ordem atual do handler:

```typescript
1. Fetch instance
2. Persistir foto do contato  ← async, até 24s no pior caso
   ├── ensureContactPhotoPersisted faz fetches HTTP
   ├── 3 tentativas (payload, banco, fresh do UZAPI)
   └── Cada fetch tem timeout 8s × 3 tentativas = 24s
3. Insere/atualiza contato
4. Insere/atualiza conversation
5. Download de mídia (se houver) ← outros segundos
6. INSERT messages ★         ← BLOQUEADO atrás de tudo acima
7. Push notifications
8. return 200
```

**Edge Functions do Supabase têm limite de tempo de wall-clock**. Quando o handler demora muito (foto demorando + media + RLS + push + n8n), o runtime mata o processo. Mas como o INSERT messages está NO FIM, ele nunca acontece — enquanto a `webhook_queue.completed_at` é marcada como done pelo processor.

### Padrão crítico no processor (`webhook-queue-processor/index.ts:110-117`)

```typescript
const { data, error: invokeError } = await supabase.functions.invoke(
  targetFunction, { body: job.payload }
);

if (invokeError) {
  throw new Error(invokeError.message);
}

// 4. Marcar como 'done' — sem verificar data.success!
await supabase.from('webhook_queue').update({
  status: 'done', completed_at: new Date().toISOString()
}).eq('id', job.id);
```

**O processor marca como `done` mesmo se o handler retornar `{ success: false }`.** Não há validação semântica — apenas erro HTTP/network.

### Outros pontos de drop silencioso identificados

| Ponto | Linha | Comportamento |
|---|---|---|
| `msgError` ao INSERT | 971-972 | logga + continua, retorna 200 mesmo assim |
| Rate limit 120 req/min/IP | 317 | retorna 429 — UZAPI provavelmente NÃO retenta |
| Validação payload | 344-351 | retorna 400 — perdido |
| Instance não encontrada | 362-367 | retorna 404 |
| Grupo sem `wa_chatid` | 399-404 | retorna 400 |
| Contato sem `waNumber` | 577-583 | retorna 400 |
| Dedup `evolution_id` | 920-934 | retorna `duplicate:true` — pode ser falso positivo |

## 4. Por que as fotos travam o handler

`ensureContactPhotoPersisted` (linha 231):

1. Tenta baixar `payloadPhotoUrl` (URL do WhatsApp CDN) — timeout 8s
2. Se falhar, tenta `currentPic` (URL atual do banco, possivelmente expirada) — timeout 8s
3. Se falhar, busca URL fresca via `fetchProfilePicFromUzapi` — timeout 8s

Worst case: 24s GASTO antes do INSERT da mensagem.

E o WhatsApp CDN frequentemente retorna 404 quando URLs expiram. Cada falha consome o timeout completo (8s).

## 5. Conclusão

**O sistema atual joga a mensagem fora quando a foto do contato é lenta de persistir.**

Funcionalidade de mensagem (essencial) está bloqueada atrás de funcionalidade de foto (cosmética). Hierarquia errada.

## 6. Plano de correção (PENDENTE de aprovação)

### Correção 1 — Reordenar fluxo no `webhook-handle-message` ⭐

**MUDANÇA**: INSERT da mensagem ANTES de qualquer operação cosmética (foto, mídia).

```typescript
// Order corrigida:
1. Fetch instance
2. Insere/atualiza contato (sem foto)
3. Insere/atualiza conversation
4. INSERT messages ★ ← AGORA aqui, antes de qualquer fetch externo
5. (background) Persistir foto + baixar mídia + push + n8n
6. return 200
```

Mensagem é o ouro. Foto/media é açúcar. Salvar primeiro, embelezar depois.

### Correção 2 — Push/foto em `EdgeRuntime.waitUntil`

Mover persistência de foto, download de mídia, push notifications e forward
n8n para `EdgeRuntime.waitUntil(...)`. Handler retorna 200 imediatamente após
INSERT da mensagem.

```typescript
const insertResult = await supabase.from('messages').insert(...);
EdgeRuntime.waitUntil((async () => {
  await ensureContactPhotoPersisted(...);
  await downloadMedia(...);
  await sendPushNotifications(...);
  await forwardToN8N(...);
})());
return new Response(JSON.stringify({ success: true }), { status: 200 });
```

### Correção 3 — Reduzir timeouts dos fetches de foto

`fetchProfilePicFromUzapi` / `fetchProfilePicFromEvolution`: 8s → 3s.
`persistContactPhoto`: implícito → 5s explícito.

3 tentativas × 3s = 9s worst-case (era 24s).

### Correção 4 — Processor valida `data.success`

```typescript
const { data, error: invokeError } = await supabase.functions.invoke(...);

if (invokeError || !data?.success) {
  throw new Error(invokeError?.message || data?.error || 'Handler returned non-success');
}
```

Garante que `done` só é marcado quando handler reportou sucesso semântico.

### Correção 5 — Recovery das 18 mensagens já perdidas

```sql
-- Re-enfileirar as 18 mensagens perdidas para reprocessamento
UPDATE webhook_queue
SET status = 'pending', attempts = 0, started_at = NULL, completed_at = NULL
WHERE id IN (
  SELECT wq.id FROM webhook_queue wq
  WHERE status = 'done'
    AND event_type = 'messages'
    AND created_at > NOW() - INTERVAL '2 hours'
    AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.evolution_id = (wq.payload->'message'->>'messageid')
    )
);
```

**ATENÇÃO**: só fazer isso DEPOIS da correção 1+2 ser deployada — senão vai cair no mesmo timeout.

## 7. Não vou implementar sem confirmação

O `webhook-handle-message` é o coração do sistema de recebimento. Modificações nele afetam **todos os clientes**. Aguardando OK explícito do usuário antes de implementar.

Se OK → faço Correção 1+2+3 em commit único, deploy via `supabase functions deploy webhook-handle-message`, então Correção 4 (processor), então Correção 5 (recovery).
