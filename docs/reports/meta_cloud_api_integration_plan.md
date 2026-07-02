# Plano de Integração — Meta WhatsApp Cloud API no Clinvia

**Data:** 2026-07-02
**Objetivo:** Adicionar suporte à API oficial da Meta (Cloud API) em paralelo à UZAPI existente, sem impacto no que já funciona.

---

## 1. MAPEAMENTO UZAPI → META CLOUD API

### 1.1 Payload de Mensagem Recebida (Webhook Inbound)

#### UZAPI (formato atual):
```json
{
  "instanceName": "clinvia-whatsapp",
  "EventType": "messages",
  "message": {
    "messageid": "3EB0ABC123...",
    "sender": "5511999999999",
    "sender_pn": "11999999999",
    "pushName": "João Silva",
    "messageType": "conversation",
    "text": "Olá, bom dia!",
    "fromMe": false,
    "timestamp": 1234567890,
    "isGroup": false,
    "chatid": "5511999999999@c.us",
    "vote": "",
    "selectedDisplayText": "",
    "content": {
      "contextInfo": {
        "stanzaID": "reply-msg-id",
        "quotedMessage": { "conversation": "texto citado" },
        "participant": "5511888888888@s.whatsapp.net"
      },
      "fileName": "documento.pdf",
      "mimetype": "application/pdf",
      "selectedID": "ac_confirm"
    }
  },
  "chat": {
    "wa_chatid": "5511999999999",
    "wa_name": "João Silva",
    "imagePreview": "https://pps.whatsapp.net/...",
    "name": "João Silva"
  }
}
```

#### META CLOUD API (formato oficial):
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5511999999999",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "João Silva" },
          "wa_id": "5511999999999"
        }],
        "messages": [{
          "from": "5511999999999",
          "id": "wamid.HBgLMTY1...",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Olá, bom dia!" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 1.2 Tabela de Mapeamento de Campos

| Campo interno (Clinvia) | UZAPI | Meta Cloud API |
|---|---|---|
| `instanceName` | `payload.instanceName` | Lookup por `metadata.phone_number_id` |
| `messageId` (evolution_id) | `message.messageid` | `messages[0].id` (wamid.xxx) |
| `senderNumber` | `chat.wa_chatid` ou `message.chatid` | `messages[0].from` |
| `pushName` | `chat.wa_name` ou `chat.name` | `contacts[0].profile.name` |
| `messageType` | `message.messageType` (conversation, imagemessage, etc) | `messages[0].type` (text, image, etc) |
| `messageText` | `message.text` | `messages[0].text.body` |
| `fromMe` | `message.fromMe` | Não existe — outbound não vem via webhook |
| `isGroup` | `message.isGroup` | Não suportado na Cloud API |
| `profilePicUrl` | `chat.imagePreview` | Não vem no webhook — buscar via API separada |
| `mediaId` | `message.messageid` (para download) | `messages[0].image.id` / `audio.id` etc |
| `mediaFilename` | `message.content.fileName` | `messages[0].document.filename` |
| `mediaMimetype` | `message.content.mimetype` | `messages[0].document.mime_type` |
| `replyToId` | `message.content.contextInfo.stanzaID` | `messages[0].context.id` |
| `quotedBody` | `contextInfo.quotedMessage.conversation` | Não vem — precisa buscar |
| `reactionEmoji` | `message.text` (quando type=reaction) | `messages[0].reaction.emoji` |
| `reactionTargetId` | `message.reaction` | `messages[0].reaction.message_id` |
| `buttonResponseId` | `message.content.selectedID` | `messages[0].interactive.button_reply.id` |
| `buttonResponseText` | `message.selectedDisplayText` / `message.vote` | `messages[0].interactive.button_reply.title` |
| `locationLat` | N/A | `messages[0].location.latitude` |
| `locationLng` | N/A | `messages[0].location.longitude` |

### 1.3 Tipos de Mensagem

| Tipo interno | UZAPI `messageType` | Meta `type` |
|---|---|---|
| `text` | `conversation`, `extendedtextmessage` | `text` |
| `image` | `imagemessage` | `image` |
| `audio` | `audiomessage` | `audio` |
| `video` | `videomessage` | `video` |
| `document` | `documentmessage` | `document` |
| `sticker` | `stickermessage`, `sticker` | `sticker` |
| `reaction` | `reactionmessage`, `reaction` | `reaction` |
| `location` | N/A | `location` |
| `contacts` | N/A | `contacts` |
| `interactive` | (vote/selectedDisplayText) | `interactive` (button_reply/list_reply) |

### 1.4 Status de Mensagem (ACK/Read Receipt)

#### UZAPI (formato atual):
```json
// ReadReceipt
{ "type": "ReadReceipt", "state": "Read", "event": { "MessageIDs": ["msg1", "msg2"] } }

// ACK
{ "EventType": "ack", "ack": { "key": { "id": "msg1" }, "status": 3 } }
// status: 1=sent, 2=delivered, 3=read, 4=played
```

#### META CLOUD API:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "wamid.xxx",
          "status": "delivered",
          "timestamp": "1234567890",
          "recipient_id": "5511999999999"
        }]
      }
    }]
  }]
}
// status: "sent" | "delivered" | "read" | "failed"
```

---

## 2. ENVIO DE MENSAGENS

### 2.1 Comparação de Envio

#### UZAPI (atual):
```
POST https://clinvia.uazapi.com/send/text
Headers: { token: instance.apikey }
Body: { number: "5511999999999", text: "Olá!" }

POST https://clinvia.uazapi.com/send/media
Headers: { token: instance.apikey }
Body: { number: "...", type: "image", file: "https://url-da-imagem", caption: "legenda" }

POST https://clinvia.uazapi.com/send/contact
Headers: { token: instance.apikey }
Body: { number: "...", fullName: "Nome", phoneNumber: "...", organization: "..." }
```

#### META CLOUD API:
```
POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
Headers: { Authorization: Bearer ACCESS_TOKEN, Content-Type: application/json }

// Texto
{ "messaging_product": "whatsapp", "to": "5511999999999", "type": "text", "text": { "body": "Olá!" } }

// Imagem (por URL)
{ "messaging_product": "whatsapp", "to": "...", "type": "image", "image": { "link": "https://url", "caption": "legenda" } }

// Documento
{ "messaging_product": "whatsapp", "to": "...", "type": "document", "document": { "link": "https://url", "caption": "legenda", "filename": "doc.pdf" } }

// Áudio
{ "messaging_product": "whatsapp", "to": "...", "type": "audio", "audio": { "link": "https://url" } }

// Vídeo
{ "messaging_product": "whatsapp", "to": "...", "type": "video", "video": { "link": "https://url", "caption": "legenda" } }

// Contato (vCard)
{ "messaging_product": "whatsapp", "to": "...", "type": "contacts", "contacts": [{ "name": { "formatted_name": "Nome" }, "phones": [{ "phone": "5511999" }] }] }

// Reação
{ "messaging_product": "whatsapp", "to": "...", "type": "reaction", "reaction": { "message_id": "wamid.xxx", "emoji": "👍" } }

// Reply (resposta a mensagem)
{ "messaging_product": "whatsapp", "to": "...", "type": "text", "context": { "message_id": "wamid.xxx" }, "text": { "body": "resposta" } }

// Template
{ "messaging_product": "whatsapp", "to": "...", "type": "template", "template": { "name": "template_name", "language": { "code": "pt_BR" }, "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "valor" }] }] } }
```

### 2.2 Download de Mídia

#### UZAPI (atual):
```
POST https://clinvia.uazapi.com/message/download
Headers: { token: apikey }
Body: { id: messageId, return_base64: true, return_link: false }
→ Retorna: [{ base64Data: "..." }]
```

#### META CLOUD API:
```
// Passo 1: Obter URL temporária
GET https://graph.facebook.com/v21.0/{MEDIA_ID}
Headers: { Authorization: Bearer ACCESS_TOKEN }
→ Retorna: { url: "https://lookaside.fbsbx.com/...", mime_type: "...", sha256: "...", file_size: 123 }

// Passo 2: Baixar arquivo
GET {url retornada}
Headers: { Authorization: Bearer ACCESS_TOKEN }
→ Retorna: binário do arquivo
```

---

## 3. TEMPLATES DE MENSAGEM

### 3.1 Criar Template
```
POST https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
Headers: { Authorization: Bearer ACCESS_TOKEN }
Body:
{
  "name": "confirmacao_agendamento",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Confirmação de Agendamento"
    },
    {
      "type": "BODY",
      "text": "Olá {{1}}, seu agendamento para {{2}} está confirmado para {{3}}.",
      "example": { "body_text": [["João", "Limpeza de pele", "15/07 às 14h"]] }
    },
    {
      "type": "FOOTER",
      "text": "Clinvia - Gestão Inteligente"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Confirmar" },
        { "type": "QUICK_REPLY", "text": "Remarcar" },
        { "type": "QUICK_REPLY", "text": "Cancelar" }
      ]
    }
  ]
}
```

### 3.2 Listar Templates
```
GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
Headers: { Authorization: Bearer ACCESS_TOKEN }
→ Retorna: { data: [{ name, status, category, language, components, ... }] }
// status: APPROVED | PENDING | REJECTED | PAUSED | DISABLED
```

### 3.3 Deletar Template
```
DELETE https://graph.facebook.com/v21.0/{WABA_ID}/message_templates?name=template_name
Headers: { Authorization: Bearer ACCESS_TOKEN }
```

### 3.4 Enviar Template
```
POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "template",
  "template": {
    "name": "confirmacao_agendamento",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João" },
          { "type": "text", "text": "Limpeza de pele" },
          { "type": "text", "text": "15/07 às 14h" }
        ]
      }
    ]
  }
}
```

---

## 4. CONEXÃO DO USUÁRIO (Embedded Signup v4)

### 4.1 Frontend — Botão de Conexão
```html
<!-- SDK do Facebook -->
<script src="https://connect.facebook.net/en_US/sdk.js"></script>

<script>
FB.init({
  appId: 'META_APP_ID',
  autoLogAppEvents: true,
  xfbml: true,
  version: 'v21.0'
});

// Listener para capturar resultado do Embedded Signup
window.addEventListener('message', (event) => {
  if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;

  try {
    const data = JSON.parse(event.data);
    if (data.type === 'WA_EMBEDDED_SIGNUP') {
      const { phone_number_id, waba_id } = data.data;
      // Enviar para backend
    }
  } catch {}
});

function connectWhatsApp() {
  FB.login((response) => {
    if (response.authResponse) {
      const code = response.authResponse.code;
      // Enviar 'code' para o backend trocar por token permanente
      fetch('/functions/v1/meta-embedded-signup', {
        method: 'POST',
        body: JSON.stringify({ code, waba_id, phone_number_id })
      });
    }
  }, {
    config_id: 'FLOW_CONFIG_ID', // Criado no Meta App Dashboard
    response_type: 'code',
    override_default_response_type: true,
    extras: {
      setup: {}, // Pode pré-preencher dados do cliente
      featureType: '',
      sessionInfoVersion: '3'
    }
  });
}
</script>
```

### 4.2 Backend — Trocar Token + Registrar Número

```typescript
// Edge Function: meta-embedded-signup

// Passo 1: Trocar code por access_token
const tokenResponse = await fetch(
  `https://graph.facebook.com/v22.0/oauth/access_token` +
  `?client_id=${META_APP_ID}` +
  `&client_secret=${META_APP_SECRET}` +
  `&code=${code}`,
  { method: 'GET' }
);
// Retorna: { access_token: "...", token_type: "bearer" }

// Passo 2: Registrar número para Cloud API
// Limite: 10 requests por número em janela de 72 horas
const registerResponse = await fetch(
  `https://graph.facebook.com/v22.0/${phone_number_id}/register`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      pin: '123456' // PIN de 6 dígitos para 2FA
    })
  }
);

// Passo 3: Subscrever app a webhooks do WABA
// override_callback_uri permite apontar para nosso endpoint
const webhookResponse = await fetch(
  `https://graph.facebook.com/v22.0/${waba_id}/subscribed_apps`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      override_callback_uri: `${SUPABASE_URL}/functions/v1/meta-webhook`,
      verify_token: META_WEBHOOK_VERIFY_TOKEN
    })
  }
);

// Passo 4: Salvar na tabela instances
await supabase.from('instances').insert({
  user_id,
  name: display_name,
  instance_name: `meta-${phone_number_id}`,
  server_url: 'https://graph.facebook.com',
  apikey: access_token,
  provider: 'meta',
  meta_waba_id: waba_id,
  meta_phone_number_id: phone_number_id,
  meta_access_token: access_token,
  status: 'connected',
  phone: display_phone_number,
});
```

### 4.3 Webhook — Verificação (Challenge)

```typescript
// Edge Function: meta-webhook (GET handler)
if (req.method === 'GET') {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}
```

---

## 5. PLANO DE IMPLEMENTAÇÃO

### Princípio: ZERO impacto no código existente

A estratégia é criar uma **camada de abstração (adapter)** que normaliza os dados da Meta para o formato que o sistema já entende. O código downstream (CRM, IA, follow-up, confirmação de agendamento, push notifications) não precisa ser alterado.

### Fase 1: Banco de Dados (Migration)

**Nova migration — adicionar campos à tabela `instances`:**
```sql
ALTER TABLE instances ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'uzapi';
-- 'uzapi' = comportamento atual, 'meta' = Cloud API

ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_access_token TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;
```

**Nova tabela — `message_templates`:**
```sql
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,

  name TEXT NOT NULL,
  category TEXT NOT NULL, -- MARKETING, UTILITY, AUTHENTICATION
  language TEXT NOT NULL DEFAULT 'pt_BR',
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, PAUSED, DISABLED
  rejection_reason TEXT,

  components JSONB NOT NULL DEFAULT '[]',

  meta_template_id TEXT, -- ID retornado pela Meta

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(waba_id, name, language)
);
```

### Fase 2: Edge Functions (Backend)

| Edge Function | Descrição | Impacto |
|---|---|---|
| `meta-webhook` (NOVA) | Recebe webhooks da Meta, normaliza payload e chama `webhook-handle-message` internamente | Zero impacto — nova function |
| `meta-send-message` (NOVA) | Envia mensagens via Cloud API | Zero impacto — nova function |
| `meta-embedded-signup` (NOVA) | Troca token + registra número + salva credenciais | Zero impacto — nova function |
| `meta-template-manage` (NOVA) | CRUD de templates (criar, listar, deletar) | Zero impacto — nova function |
| `evolution-send-message` (EXISTENTE) | Adicionar roteamento: se `instance.provider === 'meta'`, redirecionar para `meta-send-message` | Impacto mínimo — um if no início |
| `webhook-handle-message` (EXISTENTE) | Nenhuma alteração necessária — `meta-webhook` normaliza o payload antes de chamar | Zero impacto |

### Fase 2.1: Adapter — `meta-webhook`

A função `meta-webhook` será responsável por:

1. Verificar challenge (GET)
2. Validar assinatura HMAC-SHA256 (X-Hub-Signature-256 com App Secret)
3. Extrair mensagens do payload nested da Meta
4. **Normalizar para o formato UZAPI** que `webhook-handle-message` já entende
5. Chamar `webhook-handle-message` internamente com o payload normalizado

```typescript
// Exemplo de normalização Meta → UZAPI
function normalizeMetaToUzapi(metaPayload, instance) {
  const entry = metaPayload.entry[0];
  const changes = entry.changes[0];
  const value = changes.value;

  // MENSAGENS
  if (value.messages && value.messages.length > 0) {
    const msg = value.messages[0];
    const contact = value.contacts?.[0];

    return {
      instanceName: instance.instance_name,
      EventType: 'messages',
      message: {
        messageid: msg.id,
        sender: msg.from,
        sender_pn: msg.from,
        pushName: contact?.profile?.name || '',
        messageType: mapMetaTypeToUzapi(msg.type),
        text: extractTextFromMeta(msg),
        fromMe: false, // Meta webhook só envia inbound
        timestamp: parseInt(msg.timestamp),
        isGroup: false, // Cloud API não suporta grupos
        chatid: msg.from,
        content: extractContentFromMeta(msg),
        vote: msg.interactive?.button_reply?.title || '',
        selectedDisplayText: msg.interactive?.button_reply?.title || '',
      },
      chat: {
        wa_chatid: msg.from,
        wa_name: contact?.profile?.name || '',
        name: contact?.profile?.name || '',
      }
    };
  }

  // STATUS
  if (value.statuses && value.statuses.length > 0) {
    const status = value.statuses[0];
    return {
      type: 'ReadReceipt',
      state: mapMetaStatusToUzapi(status.status),
      event: { MessageIDs: [status.id] }
    };
  }
}

function mapMetaTypeToUzapi(metaType) {
  const map = {
    'text': 'conversation',
    'image': 'imagemessage',
    'audio': 'audiomessage',
    'video': 'videomessage',
    'document': 'documentmessage',
    'sticker': 'stickermessage',
    'reaction': 'reactionmessage',
    'interactive': 'conversation',
    'button': 'conversation',
    'location': 'conversation',
    'contacts': 'conversation',
  };
  return map[metaType] || 'conversation';
}

function mapMetaStatusToUzapi(metaStatus) {
  const map = { 'sent': 'Sent', 'delivered': 'Delivered', 'read': 'Read', 'failed': 'Failed' };
  return map[metaStatus] || 'Sent';
}
```

### Fase 2.2: Download de Mídia — `meta-webhook`

```typescript
// Em vez de chamar UZAPI /message/download,
// baixar mídia via Graph API e salvar no Storage
async function downloadMediaFromMeta(mediaId, accessToken, supabase, conversationId) {
  // 1. Obter URL temporária
  const metaResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const { url, mime_type } = await metaResp.json();

  // 2. Baixar arquivo
  const fileResp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const fileBlob = await fileResp.blob();

  // 3. Upload no Storage (mesmo fluxo do UZAPI)
  const ext = mime_type.split('/')[1] || 'bin';
  const fileName = `media/${conversationId}/${Date.now()}_${mediaId}.${ext}`;
  await supabase.storage.from('media').upload(fileName, fileBlob, {
    contentType: mime_type, cacheControl: '3600', upsert: true
  });

  const { data } = supabase.storage.from('media').getPublicUrl(fileName);
  return data.publicUrl;
}
```

### Fase 2.3: Roteamento no `evolution-send-message`

```typescript
// No INÍCIO de evolution-send-message, ANTES de qualquer lógica existente:
const instance = conversation.instance;

if (instance.provider === 'meta') {
  // Redirecionar para meta-send-message
  const metaResponse = await fetch(`${supabaseUrl}/functions/v1/meta-send-message`, {
    method: 'POST',
    headers: {
      'Authorization': req.headers.get('Authorization') || `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqData)
  });
  return metaResponse;
}

// ... código UZAPI existente continua inalterado ...
```

### Fase 3: Frontend

| Componente | Alteração | Impacto |
|---|---|---|
| `Connections.tsx` | Adicionar botão "Conectar via WhatsApp Oficial (Meta)" | Novo componente, zero impacto |
| `MetaConnectionCard` (NOVO) | Card para instâncias Meta (status, desconectar) | Novo componente |
| `TemplatesPage.tsx` (NOVO) | Página CRUD de templates | Nova página |
| `useSendMessage.ts` | Nenhuma alteração — já chama `evolution-send-message` que fará o roteamento | Zero impacto |
| Chat/Mensagens | Nenhuma alteração — dados chegam no mesmo formato após normalização | Zero impacto |

### Fase 4: Templates (Sistema Novo)

Nova página `/templates` com:
- Lista de templates do WABA
- Criar novo template (nome, categoria, body com variáveis, botões)
- Status de aprovação (polling ou webhook)
- Enviar template para contato
- Preview do template

---

## 6. RESUMO DE IMPACTO

### Arquivos que NÃO serão alterados:
- `webhook-handle-message/index.ts` — recebe payload normalizado
- `webhook-handle-status/index.ts` — recebe payload normalizado
- `_shared/utils.ts` — funções UZAPI intactas
- Toda a lógica de CRM, IA, follow-up, confirmação de agendamento
- Todos os hooks do frontend (useSendMessage, useMessages, etc)
- Chat, conversas, contatos — tudo continua funcionando igual

### Arquivo com alteração MÍNIMA:
- `evolution-send-message/index.ts` — adicionar ~10 linhas de roteamento no início

### Arquivos/Functions NOVOS:
- `meta-webhook/index.ts` — recebe + normaliza webhooks da Meta
- `meta-send-message/index.ts` — envia mensagens via Cloud API
- `meta-embedded-signup/index.ts` — conexão do cliente
- `meta-template-manage/index.ts` — CRUD de templates
- `meta-media-download.ts` (shared) — download de mídia da Meta

### Migration NOVA:
- Campos em `instances` (provider, meta_waba_id, etc)
- Tabela `message_templates`

### Frontend NOVO:
- Botão de conexão Meta na página Connections
- Página de gerenciamento de templates

---

## 7. ORDEM DE EXECUÇÃO

| # | Tarefa | Dependência |
|---|---|---|
| 1 | Migration: campos em instances + tabela message_templates | Nenhuma |
| 2 | Edge Function: `meta-webhook` (challenge + normalização + status) | Migration |
| 3 | Edge Function: `meta-send-message` (texto, mídia, template, reply) | Migration |
| 4 | Edge Function: `meta-embedded-signup` (OAuth + registro) | Migration |
| 5 | Roteamento em `evolution-send-message` (if provider === 'meta') | meta-send-message |
| 6 | Frontend: botão Meta em Connections.tsx | meta-embedded-signup |
| 7 | Edge Function: `meta-template-manage` (CRUD) | Migration |
| 8 | Frontend: página /templates | meta-template-manage |
| 9 | Testes com número de teste da Meta | Tudo acima |
| 10 | App Review (vídeos) | Tudo funcionando |

---

## 8. SECRETS NECESSÁRIOS NO SUPABASE

| Secret | Descrição |
|---|---|
| `META_APP_ID` | ID do Meta App |
| `META_APP_SECRET` | Secret do Meta App (para HMAC + troca de token) |
| `META_WEBHOOK_VERIFY_TOKEN` | Token customizado para verificação de webhook |

Os `access_token` de cada cliente ficam na tabela `instances.meta_access_token` (por instância).
