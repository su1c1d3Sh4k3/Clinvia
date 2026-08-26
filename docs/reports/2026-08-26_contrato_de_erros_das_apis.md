# Contrato de erros das APIs públicas (n8n + link de agendamento)

Data: 2026-08-26

## Motivação

As 16 edge functions `api-*` devolviam erro genérico em vários caminhos: `"Unauthorized"`,
`"Error"`, `"Invalid action"`, `"Missing user_id"`, mensagem crua do Postgres vazando pelo
catch, e — pior — dezenas de consultas onde o `error` do supabase-js era destructurado e
**ignorado**, virando um "não encontrado" enganoso mais adiante. Quem chamava (n8n e, no caso
do link público, o próprio paciente) não tinha como saber o que quebrou.

Regra adotada: **nenhuma resposta de erro pode ser genérica.** Toda falha diz o que aconteceu,
em qual etapa, e — quando o motivo é técnico — carrega o detalhe do banco em `details`.

## Formato da resposta de erro

Compatível com os dois formatos que já existiam (`{error}` e `{success,error,message}`):

```json
{
  "success": false,
  "error":   "Falha ao gravar o agendamento: ...",
  "message": "Falha ao gravar o agendamento: ...",
  "code":    "appointment_insert_failed",
  "details": "duplicate key value violates unique constraint ..."
}
```

- `error` e `message` carregam **o mesmo texto humano** — quem lia `.error` e quem lia
  `.message` continuam funcionando.
- `code` é estável, em `snake_case`, para o n8n ramificar **sem parsear texto**.
- `details` só aparece quando existe motivo técnico (mensagem do Postgres, corpo de resposta
  HTTP, campos recebidos, ids procurados).
- Campos extras que já existiam no topo do corpo foram preservados (ex.: `deal_id` no 409 de
  `create_deal` do `api-crm`).

## Onde isso vive

`supabase/functions/_shared/api-errors.ts` é a fonte única:

| helper | uso |
|---|---|
| `apiError(headers, {status, code, message, details?, extra?})` | qualquer erro |
| `describeDbError(operation, error)` | texto "Falha ao `<operation>`: `<motivo>` [`<code>`]" |
| `dbErrorResponse(headers, code, operation, error)` | 500 de banco já formatado |
| `unexpectedErrorResponse(headers, context, error)` | catch externo (sempre 500, nunca 400) |
| `requireApiKey(req, headers)` | distingue segredo não configurado / header ausente / chave errada |
| `readJsonBody(req, headers)` | body vazio / JSON inválido / não-objeto, dizendo o que chegou |
| `missingFields(headers, body, required[], hint?)` | 400 listando **exatamente** o que faltou |
| `unknownAction(headers, action, valid[])` | 400 **enumerando** as ações válidas |

`supabase/functions/_shared/resolve-conversation.ts` lança `ConversationResolutionError` com
os mesmos códigos estáveis (`conversation_id_missing`, `conversation_id_malformed`,
`conversation_not_found`, `conversation_wrong_tenant`, `conversation_without_contact`,
`conversation_lookup_failed`).

## Códigos transversais

Aparecem em (quase) todas as funções:

| code | status | quando |
|---|---|---|
| `api_key_not_configured` | 500 | o segredo `SCHEDULING_API_KEY` não existe no ambiente da função |
| `api_key_missing` | 401 | header `x-api-key` ausente |
| `api_key_invalid` | 401 | chave enviada não confere |
| `body_empty` / `body_invalid_json` / `body_not_object` / `body_unreadable` | 400 | corpo da requisição |
| `missing_fields` | 400 | `details` lista os campos recebidos |
| `unknown_action` | 400 | mensagem enumera as ações válidas |
| `database_error` / `unexpected_error` | 500 | catch externo, com o motivo em `details` |

## Falhas que antes eram silenciosas e agora aparecem

Estas eram as piores: davam **200 com dado errado** ou 404 mentiroso.

| função | falha silenciosa | agora |
|---|---|---|
| `api-availability` | erro na leitura de `appointments` deixava `busy` vazio → **oferecia horários já ocupados** | `appointments_read_failed` (fatal) |
| `api-public-booking` | idem no `get_slots`; e o bloco de CRM engolia tudo em `console.warn` | `appointments_read_failed`; sincronização do funil vira `crm_warning` no corpo de sucesso |
| `api-scheduling` | ~17 erros destructurados ignorados nos blocos de CRM | `crm_warning` no corpo de sucesso (o agendamento já foi gravado, então não é fatal) |
| `api-services` | erro na busca de `service_name` era descartado → conta com serviços recebia "nenhum serviço" | `service_names_read_failed` |
| `api-services` | `generateBookingLink` retornava `null` em 4 situações distintas, sem dizer nada | campo `booking_link_error` explicando qual dado faltou |
| `api-sale-scheduling-due` | erro da RPC `update_overdue_ia_scheduling` só em `console.error`, resposta 200 | `overdue_update_warning` no corpo |
| `api-token-usage` | erro de `increment_profile_token_usage` só em `console.error`, resposta 200 | entra no array `warnings` |
| `api-token-usage` | `"No tenant found for this workflow_id"` sem dizer a cadeia tentada | mensagem cita `instances.workflow_code` → `instances.workflow_id` → `ia_config.workflow_id` e o valor recebido |
| `api-contacts` | `PGRST116` no `update ... .single()` (nenhuma linha casou) virava erro genérico | `contact_not_found` (404) |
| `api-get-media` | `provider` vinha `undefined` e era assumido como `"uazapi"` | `provider: null` + `console.warn` descritivo |
| `api-send-message` | resposta não-ok do `evolution-send-message` era repassada crua | `send_failed` preservando o status, com `provider`/`conversation_id` em `extra` |

Também: `await req.json()` estava **fora do `try`** em `api-add-note`, `api-contact-messages`,
`api-contacts`, `api-professionals`, `api-reset-context` e `api-get-media` — um JSON malformado
derrubava a função com `SyntaxError` não capturada. Todas usam `readJsonBody` agora.

## `api-public-booking` é caso à parte

É a única API lida por um **paciente**: `src/pages/PublicBooking.tsx:19` faz
`throw new Error(data.error || "Erro")` e renderiza `err.message` em vermelho na tela.

Por isso ela usa dois helpers locais, `patientError` e `patientDbError`: `error`/`message`
sempre trazem orientação humana ("Não conseguimos registrar o seu agendamento. Tente novamente
em alguns instantes ou fale com a clínica para marcar por telefone.") e o motivo técnico vai
**só** em `details` e no log da função. O catch externo passou de 400 para 500 e não vaza mais
texto do Postgres.

## O que muda para o n8n

Nada é obrigatório: `error` e `message` continuam existindo com texto legível. O ganho é poder
trocar `{{ $json.error.includes("...") }}` por `{{ $json.code === "no_active_deal" }}` nos nós
de decisão, e ter `details` para logar quando algo falha.

## Pendência de segurança

`api-followup-pending` e `api-contact-messages` **não validam `x-api-key`** — são publicamente
chamáveis. Não foi adicionada autenticação nesta passagem porque o n8n pode já estar chamando
sem o header, e exigir a chave quebraria produção sem aviso. Decidir com o dono do workflow
antes de fechar (há um `TODO(segurança)` no topo de cada handler).
