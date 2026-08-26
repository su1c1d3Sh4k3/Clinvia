# APIs do n8n padronizadas por `conversation_id`

**Data:** 2026-08-26
**Commit:** C2 do projeto "CRM por conexão"
**Quebra de contrato:** sim — sem janela de compatibilidade (decisão do usuário).

## Por quê

Desde o CRM por conexão, o card do funil é por **(contato, conexão)**. Um contato
com conversa em duas instâncias tem dois cards e pode estar em duas etapas ao mesmo
tempo. `contact_id` e `phone_number` **não dizem qual conexão** — a API teria que
adivinhar em qual funil mexer.

A **conversa** é o dado completo: carrega contato + instância (WhatsApp) ou conta
(Instagram). Por isso todas as APIs consumidas pelo n8n passam a exigir
`conversation_id`.

O `webhook-handle-message` **já envia** `bd_data.conversation_id` e
`bd_data.instance_id` no payload do prompt — nenhuma informação nova precisa ser
produzida pelo workflow.

## O que muda em cada nó HTTP do n8n

Trocar o campo de identificação por:

```json
"conversation_id": "{{ $json.bd_data.conversation_id }}"
```

| Endpoint | Antes | Depois |
|---|---|---|
| `api-crm` | `contact_id` **ou** `phone_number` | `conversation_id` (obrigatório, exceto `action: list_stages`) |
| `api-scheduling` | `contact_id`/`phone_number` + `instance` | `conversation_id` (obrigatório em `fetch_appointments` e `create_appointment`); campo `instance` **removido** — deriva da conversa |
| `api-add-note` | `conversation_id` **ou** `contact_id` | `conversation_id` (obrigatório) |
| `api-send-message` | `number` + `instance_id` (+ `conversation_id`/`contact_id`) | `conversation_id` (obrigatório); número e instância derivados da conversa |
| `api-contact-messages` | `contact_id` | `conversation_id` |
| `api-services` | `user_id` + `service_name` | idem + `conversation_id` (opcional; só serve para gerar o `booking_link` com a conexão) |
| `api-get-media` | `message_id` \| `conversation_id` \| `media_url` | **inalterado** |
| `api-public-booking` | token do link com `instance_id` opcional | `instance_id` **obrigatório** no token (links antigos mostram erro pedindo link novo) |

`reschedule_appointment` / `cancel_appointment` (api-scheduling) e
`reschedule_booking` / `cancel_booking` (api-public-booking) continuam por
`appointment_id` — a conexão vem de `appointments.instance_id`.

## APIs de lista que passam a devolver `conversation_id`

Para o n8n encadear nas APIs acima sem precisar resolver telefone:

| Endpoint | Campos novos na resposta |
|---|---|
| `api-followup-pending` | já retornava `conversation_id` e `instance_id` (uma linha por conversa) |
| `api-sale-scheduling-due` | `conversation_id`, `instance_id` em cada item de `sales` |
| `api-recurrence-due` | `conversation_id`, `instance_id` em cada item de `data` |

Nas duas últimas, a conversa escolhida é a **aberta/pendente** do contato; se não
houver nenhuma viva, a de atividade mais recente. Pode vir `null` se o contato
nunca teve conversa — nesse caso o fluxo precisa criar/abrir uma antes de chamar
`api-send-message`.

## Erros novos

| HTTP | `error` | Quando |
|---|---|---|
| 400 | `Missing required field: conversation_id` | campo ausente |
| 404 | `Conversa não encontrada: <id>` | id inválido |
| 403 | `Conversa não pertence a este user_id` | id de outro tenant |
| 400 | `Conversa sem contato vinculado (grupo?)` | conversa de grupo |
| 400 | `unsupported_channel` (api-send-message) | conversa de Instagram — usar `instagram-send-message` |

## Efeito no CRM

Toda leitura/escrita de card agora casa a conexão da conversa, com **fallback para
o card legado sem conexão** (bucket sentinela) — contas que ainda não tiveram o
split continuam funcionando igual.

`api-crm` action `close_ticket` passou a usar a RPC
`crm_close_conversation_negotiation`: encerra **só aquele ticket** e move só o card
daquela conexão. A conversa da outra instância segue aberta.
