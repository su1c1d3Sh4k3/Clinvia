# Plano — Monitoramento de incidentes (n8n + plataforma)

> Status: **PLANO. Nada aplicado em produção.** Migrations escritas e paradas em `supabase/migrations/`
> (não rodadas). Depende de 5 decisões do user, listadas em "O que depende de você".
>
> Prioridade acordada: executar **depois** de fechar o que já está em andamento
> (colunas de `token_usage_log`, Ordem C do custo por projeto, alerta de saldo da organização).
> Referência de estado geral: `docs/security/ESTADO_ATUAL.md`.

---

## 0. O que foi medido no banco antes de planejar (22/09/2026 19:21 SP)

Três fatos mudaram o desenho em relação ao plano original:

**(a) `497613820103663` é WABA ID, não `phone_number_id`.**

| dono | instance_name | phone_number_id | waba_id | token |
|---|---|---|---|---|
| **Bruno Admin** | `meta-488512407686498` | **488512407686498** | **497613820103663** | presente (350) |
| PELE DERMATOLOGIA | `meta-1220713571131185` | 1220713571131185 | 1792039661991367 | presente |
| PELE DERMATOLOGIA | `meta-215168561689565` | 215168561689565 | 266479419882781 | presente |
| Clinbia | `meta-1323435687512482` | 1323435687512482 | 1047337758289203 | presente |
| Contourline Equip. | `meta-103057676058930` | 103057676058930 | 112145888471490 | presente |

⇒ O remetente do alerta é a instância **`meta-488512407686498`** (conta Bruno Admin), status
`connected`. O `alert_recipients` guarda o `instance_id` dessa linha, não o número solto.

**(b) A WABA do Bruno Admin já tem 12 templates, todos `APPROVED`** — e **nenhum** serve de alerta:
`bom_dia`, `bom_dia_cliente`, `camp_teste_v1`, `hello_word`, `rec_default_msg1_v1`,
`rec_default_msg2_v1`, `rec_default_msg3_v1`, `sys_confirm_24h_v1`, `sys_confirm_multi_v1`,
`sys_feedback_24h_v1`, `sys_reminder_2h_v1`, `teste_imagem`.
⇒ Você precisa aprovar um template novo (texto exato na §0.3).

**(c) O contato `5537920001025` ("Bruno") já existe em DOIS tenants** (Bruno Admin e PELE).
Isso é irrelevante para o alerta — e é justamente por isso que o envio de alerta **não pode**
passar pelo caminho normal.

### 0.1 Por que não dá para reusar o envio atual

Levantamento do repositório:

- `evolution-send-message` → delega para `meta-send-message` para instâncias Meta.
- `meta-send-message/index.ts:221-241` resolve a instância **a partir de `conversation_id`**
  (`.from("conversations").select("*, instance:instances(*)")`).
- `evolution-send-message/index.ts:185-220` exige JWT de usuário para criar conversa
  ("Cannot create conversation: User not authenticated").

⇒ **Hoje não existe envio de WhatsApp para um número que não seja contato com conversa.**
Mandar alerta pelo caminho atual criaria contato + conversa + card de CRM + ticket no inbox do
tenant Bruno Admin a cada erro da plataforma. Inaceitável.

**Decisão:** função nova **`alert-notify`** que fala direto com o Graph
(`POST https://graph.facebook.com/v22.0/{phone_number_id}/messages`), lendo
`instances.meta_access_token` da linha remetente. Zero contato, zero conversa, zero mensagem em
`messages`. O rastro do envio fica em `incident_notifications` (§1.4), não no inbox.

### 0.2 Por que o formato bonito da §5 tem que virar template

`_shared/system-templates.ts::sanitizeParam` remove `\n` dos parâmetros — e a Meta **não aceita
newline dentro de `{{n}}}`**, independente do nosso código. Logo o layout de 8 linhas do plano
original **não pode viajar como variável**: ele tem que ser o **corpo do template**, com uma
variável de uma linha por campo.

Fora da janela de 24h (o caso normal de um alerta às 3h da manhã) o texto livre é recusado pela
Meta. Dentro da janela ele passaria, mas depender disso é aleatório. ⇒ **sempre template.**

### 0.3 Template que você precisa registrar e aprovar

Dois templates. Registrar em `/whatsapp-connection` → aba **Templates**, com a conexão
**Bruno Admin (`meta-488512407686498`)** selecionada.

---

**Template 1 — alerta individual**

- **Nome:** `sys_alerta_incidente_v1`
- **Categoria:** `UTILITY`
- **Idioma:** `pt_BR`
- **Cabeçalho:** nenhum · **Rodapé:** nenhum · **Botões:** nenhum
- **Corpo (copiar exatamente, com as quebras de linha):**

```
{{1}} Alerta Clinvia

Componente: {{2}}
Erro: {{3}}
Clínica afetada: {{4}}

Causa provável: {{5}}
Origem provável: {{6}}
O que fazer: {{7}}

Painel: {{8}}

Mensagem automática do monitoramento da plataforma.
```

- **Variáveis (todas uma única linha, sem quebra):**

| var | conteúdo | exemplo para o formulário da Meta |
|---|---|---|
| `{{1}}` | selo de gravidade | `🔴 CRÍTICO — Plataforma` |
| `{{2}}` | componente | `api-token-usage` |
| `{{3}}` | erro + contagem + início | `falha ao gravar consumo (42501) — 14 ocorrências desde 14:05` |
| `{{4}}` | clínica afetada ou `nenhuma identificada` | `PELE Dermatologia` |
| `{{5}}` | `ai_probable_cause` | `policy nova de token_usage_log bloqueando o insert do service_role` |
| `{{6}}` | `ai_origin` | `supabase/functions/api-token-usage/index.ts:426` |
| `{{7}}` | `ai_fix_system` ou `ai_fix_n8n` | `revisar a migration 20260922xxxx; rollback disponível` |
| `{{8}}` | link do incidente | `https://app.clinbia.ai/admin?tab=alertas&i=7f3a2c10` |

> A linha final estática existe de propósito: a Meta recusa template cujo corpo **termina** em
> variável. Não remova.

---

**Template 2 — resumo agrupado (média/baixa, a cada 2h; e o "continua acontecendo")**

- **Nome:** `sys_alerta_resumo_v1`
- **Categoria:** `UTILITY` · **Idioma:** `pt_BR`
- **Corpo:**

```
🟡 Resumo do monitoramento — {{1}}

{{2}}

Painel: {{3}}

Mensagem automática do monitoramento da plataforma.
```

| var | conteúdo | exemplo |
|---|---|---|
| `{{1}}` | janela | `22/09 16:00 às 18:00` |
| `{{2}}` | lista em UMA linha, itens separados por ` · ` | `api-availability: timeout (3x) · uzapi-health: instância desconectada (2x)` |
| `{{3}}` | link do painel | `https://app.clinbia.ai/admin?tab=alertas` |

**Se a Meta recusar `UTILITY`** (o conteúdo não é transacional de cliente), reenvie os dois como
`MARKETING`. Funciona igual; só muda o preço (`MARKETING` ≈ US$ 0,0625 vs `UTILITY` ≈ US$ 0,008
por envio, conforme `meta_template_price_usd`). Com o rate limit de 10/h o teto é ~US$ 15/mês no
pior caso, e o caso realista é ~US$ 0,50/mês.

**Enquanto os templates não estiverem `APPROVED`:** o sistema grava o incidente, grava a análise,
mostra no painel e **tenta** o envio; a recusa da Meta é gravada em
`incident_notifications.error_message` e **nada quebra**. `appointment-confirmation-cron:571-576`
já usa essa regra (pula template que não está `APPROVED`) — mantemos a mesma disciplina.

### 0.4 O que foi registrado de verdade na WABA (medido em 22/09/2026 21:40)

`GET /v22.0/497613820103663/message_templates` devolveu os dois templates **`PENDING`** e
**`MARKETING`** (não `UTILITY`), com um corpo **diferente** do proposto acima. `alert-notify` foi
escrito contra o corpo REAL, não contra o desta seção — se o template for recriado, conferir de
novo antes de mexer no código.

**`sys_alerta_incidente_v1` (real):**

```
*Alerta Clinbia* - {{1}}
Componente: {{2}}
Erro: {{3}}
Ocorrencias: {{4}}
Conta: {{5}}
Causa provavel: {{6}}
O que fazer: {{7}}
Painel: {{8}}
Mensagem automatica do monitoramento interno.
```

Diferenças para a proposta: a contagem saiu de `{{3}}` e virou `{{4}}` própria; **`origem provável`
deixou de ter variável** (vai concatenada na causa, `causa — origem`); `{{5}}` é a conta.

**`sys_alerta_resumo_v1` (real):** `{{1}}` período · `{{2}}` quantidade de incidentes ·
`{{3}}` destaques. O link do painel virou linha estática, não é mais variável.

**Tentativa real do caminho de template em 22/09 21:56:** `132001 — template name
(sys_alerta_incidente_v1) does not exist in pt_BR`. É o que a Meta responde para template não
aprovado; confirma que o plano B está inerte até a aprovação sair.

### 0.5 Ordem de envio: texto livre primeiro, template como plano B

Decisão tomada na implementação, **não estava no plano original**. `alert-notify` tenta
`type: text` e só cai no template quando a Meta recusa. Três motivos:

1. Dentro da janela de 24h o texto livre é **gratuito** e o alerta é um canal de baixo volume mas
   contínuo — em `MARKETING` cada envio custa ~8× um `UTILITY`.
2. Texto livre **aceita quebra de linha**, então o layout bonito da §5 sai inteiro, sem depender do
   corpo do template.
3. Tira a dependência dura da aprovação: o canal já funciona hoje.

Fora da janela o texto livre falha com `131047` e o template assume — que é exatamente o caso do
alerta às 3h da manhã. Os **dois** erros vão para `incident_notifications.error_message` quando
ambos falham: sem o erro do texto livre não dá para distinguir "janela fechou" de "token errado".

---

## 1. Modelo de dados

Migration: `supabase/migrations/20260923100000_incidentes_monitoramento.sql` (+ `_rollback.sql`).
Todas as tabelas: `RLS enabled`, **zero** policy para `anon`/`authenticated`, policy
`FOR ALL TO service_role USING (true)`, leitura do painel só por RPC `SECURITY DEFINER` com
`is_admin_staff()` no corpo, `search_path` fixo, e `revoke all on function ... from public, anon`
**antes** do `grant execute ... to authenticated` (pitfall já documentado no CLAUDE.md).

### 1.1 `incident_events` — o evento cru, sanitizado
`id`, `received_at`, `source` (`n8n_error|n8n_silent|edge_function|db_job|sync|frontend|provisioning|integration`),
`component`, `environment`, `workflow_id`, `workflow_name`, `execution_id`, `execution_url`,
`failed_node`, `failed_node_type`, `error_name`, `error_message`, `error_description`,
`error_stack`, `http_code`, `request_id`, `owner_id`, `context jsonb`, `incident_id`.

Acrescentei ao plano original: `workflow_name` (o n8n já manda e sem ele o painel só mostra id),
`environment` e `integration` como `source` (§3.6).

### 1.2 `incidents` — o agrupamento
`id`, `fingerprint`, `source`, `component`, `status` (`open|acknowledged|resolved`),
`first_seen`, `last_seen`, `event_count`, `affected_tenants uuid[]`, `owner_id`,
`ai_summary`, `ai_probable_cause`, `ai_origin`, `ai_severity` (`critica|alta|media|baixa`),
`ai_impact`, `ai_fix_n8n`, `ai_fix_system`, `ai_confidence numeric`, `ai_model`, `analyzed_at`,
`last_notified_at`, `notified_count`, `notified_at_event_count`, `resolved_at`, `resolved_by`, `notes`.

- `notified_at_event_count` é meu acréscimo: sem ele não dá para aplicar a regra "ou a cada 20
  ocorrências" sem recontar tudo.
- **Unicidade enquanto aberto:** `create unique index on incidents (fingerprint) where status <> 'resolved'`
  (índice parcial — a mesma técnica do card ativo único de `crm_client`). Reabrir um incidente
  resolvido cria linha nova, o que é o desejado para medir recaída.

### 1.3 `incident_catalog` — erros conhecidos, você estende
`id`, `pattern` (regex ou substring), `match_type` (`substring|regex`), `source`, `component`,
`causa`, `acao`, `severidade_sugerida`, `is_active`, `created_at`.

Semente inicial (10 linhas, conforme §4 do seu plano): `insufficient_quota`,
`rate_limit_exceeded` / 429, `invalid_api_key` / 401, instância WhatsApp desconectada,
erro de conexão Redis/Supabase, timeout, `Cannot read properties of undefined` em expressão n8n,
JSON inválido, `42501` / `violates row-level security`, falha ao decifrar token.
Os códigos já existentes em `_shared/openai-admin.ts` entram como padrões diretos:
`openai_unreachable`, `openai_admin_key_rejected`, `openai_endpoint_not_found`,
`openai_rate_limited`, `openai_service_account_without_key`.

### 1.4 `alert_recipients` e `incident_notifications`
`alert_recipients`: `id`, `nome`, `telefone`, `instance_id` (remetente — FK `instances`),
`min_severity` (`critica|alta|media|baixa`), `is_active`, `window_start time`, `window_end time`,
`timezone` (default `America/Sao_Paulo`), `created_at`.
**Semente: uma única linha** — nome `Bruno`, telefone `5537920001025`, `instance_id` =
`meta-488512407686498`, `min_severity='baixa'`, janela `00:00–23:59`. Zero número no código.

`incident_notifications`: `id`, `incident_id`, `recipient_id`, `kind` (`individual|resumo|recorrencia`),
`sent_at`, `status` (`sent|failed|skipped_window|skipped_ratelimit`), `template_name`,
`wamid`, `error_code`, `error_message`. É a prova de entrega e a base do rate limit.

### 1.5 Fingerprint
`md5(source || '|' || component || '|' || coalesce(failed_node, route, '') || '|' || normalize(message))`,
em função `public.incident_fingerprint(...)` `IMMUTABLE`. `normalize` troca por placeholder, nesta
ordem: UUIDs → `<uuid>`; e-mails → `<email>`; telefones (10-15 dígitos) → `<phone>`; ISO
timestamps e datas → `<date>`; caminhos absolutos → `<path>`; hexadecimais ≥ 8 → `<hex>`;
qualquer número restante → `<n>`; espaços colapsados; `lower()`.
Isso é o que faz "o mesmo erro com dados diferentes" cair em um incidente só (teste §7.1).

### 1.6 Sanitização — a regra que não tem exceção
Função `public.sanitize_incident_text(text)` + gêmea `_shared/sanitize-incident.ts`
(mesma lista, precisa ficar em sincronia, igual ao par `professional-schedule.ts`):
mascara `sk-[A-Za-z0-9_-]{16,}`, `sbp_`, `eyJ` (JWT), `Bearer <...>`, `EAAx` (token Meta),
`apikey`/`api_key`/`token`/`password`/`secret`/`authorization` seguidos de valor,
e-mail, telefone de 10-15 dígitos, e trunca em 1000 caracteres.
A sanitização é feita **no servidor**, na entrada — nunca confiando no n8n (§2).
`context jsonb` passa por allowlist de chaves; chave fora da lista é descartada, não mascarada.
**Nunca entra:** corpo de mensagem de paciente, nome de paciente, chave, token, e **custo real do
provedor** (regra do markup: nem no alerta).

---

## 2. Lado n8n — `n8n-error-ingest`

Edge function nova, autenticada por **`x-api-key` = `N8N_ERROR_INGEST_KEY`** (segredo novo, valor
na §"O que depende de você"). Não reusa `SCHEDULING_API_KEY` de propósito: o ingest é escrito por
um workflow que você edita à mão e não deve carregar a chave que dá acesso a agenda/CRM.

- Limite de corpo: **64 KB**; acima disso → `413` com `code: payload_too_large`.
- Validação: `source` ∈ `{error_trigger, silent}`; `workflow_id` obrigatório; o resto opcional.
- Sanitização server-side de `error_message`, `error_description`, `nodes_executed`.
- `owner_id` pela mesma cadeia do `api-token-usage`: `instances.workflow_code` →
  `instances.workflow_id` → `ia_config.workflow_id`. Não achou → `owner_id = null` e
  `component = 'n8n:' || coalesce(workflow_name, workflow_id)`; o incidente **não** é descartado.
- Contrato de erro: `_shared/api-errors.ts` (`{success, error, message, code, details?}`).
- Resposta de sucesso: `{success: true, incident_id, event_id, is_new}` — assim você vê no n8n se
  agrupou ou abriu incidente novo.

**Payload aceito** — exatamente o que você especificou, mais dois campos que eu peço:

```json
{
  "source": "error_trigger",
  "workflow_id": "...",
  "workflow_name": "...",
  "execution_id": "...",
  "execution_url": "...",
  "mode": "trigger",
  "failed_node": "...",
  "failed_node_type": "...",
  "error_message": "...",
  "error_description": "...",
  "http_code": 500,
  "nodes_executed": [{"node": "...", "status": "..."}],

  "error_name": "NodeApiError",
  "started_at": "2026-09-23T14:05:00.000Z"
}
```

`error_name` e `started_at` são os **dois campos extras** que pedi (§"O que depende de você"):
`error_name` melhora muito o fingerprint (separa `NodeApiError` de `NodeOperationError` com a
mesma frase) e `started_at` permite medir atraso sem depender da hora de chegada.

### 2.1 Detector de erro silencioso, sem o monitor de consumo
Você vai desativar o monitor de consumo de tokens. Se o detector silencioso vive dentro dele, ele
morre junto. Substituto que **não depende do n8n**: cron novo `n8n-silent-sweep`
(`*/15 * * * *`) que chama a API do n8n
(`GET /api/v1/executions?status=success&workflowId=...`, header `X-N8N-API-KEY`) para a janela dos
últimos 20 minutos, e para cada execução "bem-sucedida" inspeciona `data.resultData.runData`
procurando nó com `error`. Achou → POSTa no próprio `n8n-error-ingest` com `source: "silent"`.
**Isso exige um segredo novo `N8N_API_KEY`** (Personal Access Token do n8n, em
Settings → n8n API). Se você preferir não criar esse token, a alternativa é manter um nó
"IF erro no nó X → HTTP Request" dentro de cada workflow, o que é manual e esquecível.
**Decisão sua.**

---

## 3. Lado plataforma

### 3.1 Edge functions — `_shared/report-incident.ts`
`reportIncident({source, component, route, method, httpCode, error, requestId, ownerId, context})`:
- roda **fora do caminho de resposta**: `queueMicrotask(() => fetch(...).catch(() => {}))`.
  Nada de `await`. Erro do próprio reporter é engolido por definição.
- `error_stack`: só as **3 primeiras linhas**.
- chama a RPC `record_incident_event` com a service key (já disponível no env das functions).

Pontos de chamada:
- `_shared/api-errors.ts`: dentro de `unexpectedErrorResponse` (§90) e `dbErrorResponse` (§62).
  `apiError` (§30) **não** reporta por padrão — ele é usado para erro de validação do cliente
  (campo faltando, ação desconhecida) e viraria ruído; ganha um parâmetro opcional `{report: true}`
  para os casos que valem.
- os `catch` existentes das 131 functions que têm catch: **não** vou editar uma por uma nesta
  etapa. A cobertura vem de graça pelos dois helpers acima, que é por onde 100% das `api-*` já
  respondem erro. As functions que respondem erro sem os helpers (levantamento na execução) entram
  em um segundo lote, com a lista no PR.

> ⚠️ **Impacto de deploy:** mexer em `_shared/api-errors.ts` obriga **redeploy de todas as
> functions que importam `_shared`** (o bundler do Deno inclui `_shared` transitivamente).
> São ~130 deploys. Isso **afeta produção** e por isso não acontece sem seu OK, conforme sua regra.
> Alternativa mais barata para a Etapa 1: instrumentar só as ~20 functions de maior risco
> e deixar o resto para uma janela de deploy combinada. **Decisão sua (22/09): é esta.**

#### Lista da Etapa 1 — as 20 (levantada 22/09/2026, aguardando seu OK)

O critério é um só: **quando isto quebra, quem descobre?** Se a resposta for "o cliente,
horas depois, reclamando", entra. Se for "aparece na tela na hora", fica para depois.

| # | Function | Dispara por | Se quebra em silêncio |
|---|----------|-------------|------------------------|
| **Entrada de mensagem — o pior lugar para falhar em silêncio** ||||
| 1 | `webhook-queue-receiver` | Meta/UAZAPI | a mensagem do paciente nem entra na fila. Nada na tela indica isso |
| 2 | `webhook-queue-processor` | cron `* * * * *` | fila enche, inbox congela no passado |
| 3 | `webhook-handle-message` | processor | mensagem gravada mas sem CRM/IA/automação; ou nem gravada |
| 4 | `meta-webhook` | Meta | idem 1, no canal oficial |
| 5 | `instagram-webhook` | Meta/IG | Direct para de chegar (já aconteceu 3× este mês) |
| **Saída de mensagem** ||||
| 6 | `evolution-send-message` | front + automações | é o funil por onde TODO envio passa |
| 7 | `meta-send-message` | `evolution-send-message` | envio oficial falha; erro da Meta hoje só aparece no log |
| **Automações por cron — ninguém está olhando quando quebram** ||||
| 8 | `campaign-dispatch` | cron `* * * * *` | campanha trava no meio; cliente só vê no relatório |
| 9 | `appointment-confirmation-cron` | cron `*/10` | confirmação de agenda para; paciente não é lembrado |
| 10 | `delivery-automation-worker` | cron `* * * * *` | automação de entrega para |
| 11 | `delivery-automation-respond` | webhook | o paciente aperta o botão e nada acontece |
| 12 | `auto-close-worker` | cron `*/5` | conversa nunca fecha; fila incha |
| 13 | `conversation-summary-worker` | cron `* * * * *` | resumo some sem aviso |
| 14 | `scheduler-notifications` | cron `*/10` | lembrete de agendamento não sai |
| **Dinheiro e plataforma** ||||
| 15 | `api-token-usage` | n8n | **já está quebrado desde 22/09 17:10 e só descobrimos por sondagem manual** |
| 16 | `openai-provision-worker` | cron `*/5` | conta nova fica sem chave própria |
| 17 | `sync-openai-usage` | cron `20 * * * *` | custo real para de ser medido; margem vira chute |
| **A IA e o paciente** ||||
| 18 | `api-scheduling` | n8n | a IA não consegue agendar e responde como se tivesse conseguido |
| 19 | `api-availability` | n8n | a IA oferece horário errado ou nenhum |
| 20 | `api-public-booking` | **paciente**, sem login | a única que um estranho chama; erro dela é erro na cara do paciente |

**Lote 2** (entram depois, sem urgência): `webhook-handle-status`,
`instagram-send-message`, `api-crm`, `api-send-message`, `api-get-media`,
`api-contacts`, `api-services`, `api-professionals`, `instagram-refresh-token`,
`recurrence-campaign-generator`, `account-emails-cron`, `uzapi-health-check`.

**Fora da lista de propósito:** as 11 `*-sandbox` (ambiente de teste, erro ali é esperado)
e `test-openai-token` (é um probe manual).

Como o `_shared` é inlinado pelo bundler, instrumentar estas 20 = **20 deploys**, não 130.

### 3.2 pg_cron — watcher
Cron novo `cron-health-watch` (`5 * * * *`) lendo `cron.job_run_details` dos 26 jobs
inventariados, e reportando três coisas:
1. `status <> 'succeeded'` na última hora → `source: db_job`, severidade sugerida `alta`.
2. job que **não rodou** na janela esperada (derivada do `schedule` do `cron.job`) → `alta`.
3. `duration` > 3× a média das últimas 50 execuções do mesmo job → `media`.

Jobs de referência já inventariados: `openai-usage-sync-hourly` (jobid 42, `20 * * * *`),
`openai-usage-sync-daily` (43, `40 4 * * *`), `openai-alerts-scan` (44, `30 * * * *`),
`delivery-automation-worker` (`* * * * *`), `uzapi-health-check` (`*/10`),
`cleanup-pg-net-responses` (`*/15`), `process-auto-follow-up` (`*/2`),
`cleanup-tickets-daily` (`0 3 * * *`).

### 3.3 Syncs, filas e provisionamento
- `sync-openai-usage` e `calibrate-cache-ratio`: já gravam em `openai_sync_runs`
  (`status`, `error_code`, `error_message`). O watcher lê `status <> 'ok'` e reporta —
  sem tocar no código dessas functions.
- Fila de provisionamento: linha com `profiles.openai_provision_error` preenchido →
  `source: provisioning`, severidade `alta`.
- `automation_send_queue` com 3 falhas (a regra de "Rejeitada" que já existe) → `media`.
- `conversation_summary_queue` e `campaign-dispatch-worker` travados → `media`.
- **Ponte com o que já existe:** `openai_alerts` (migration `20260922300000`, kinds
  `sync_failure|zero_usage|daily_anomaly`) **não** é duplicado nem migrado. O watcher lê linhas
  novas de `openai_alerts` e abre incidente correspondente, mapeando `severity 'critical'→'alta'`
  e `'warning'→'media'`. `openai_alerts` continua sendo a fonte da verdade do custo; `incidents`
  passa a ser a fonte única do *aviso*. E a regra permanece: **alerta nunca corta**.

### 3.4 Erro de permissão em produção (`42501`)
`describeDbError` já classifica erro do Postgres. O reporter marca
`error_name = 'rls_violation'` quando o código é `42501` ou a mensagem contém
`violates row-level security`, e o fingerprint passa a ignorar o texto da linha —
agrupando por `component + tabela`. Severidade mínima **alta**, porque, como você disse, isso é
quase sempre regressão de correção de segurança. O painel mostra esses incidentes com selo próprio
("Permissão"), que é exatamente o que hoje só aparece rodando script à mão.

### 3.5 Front — `frontend-error-ingest`
- `src/components/ErrorBoundary.tsx`: `componentDidCatch` (linhas 37-68) passa a reportar —
  **mantendo** os dois silenciamentos atuais: `isDomAutocompleteError` e `isChunkError`
  (esse último é bundle velho, não bug; já auto-recarrega e viraria ruído puro).
- `src/main.tsx:91-107`: o handler de `unhandledrejection` também reporta.
- Envia: rota (`location.pathname` **sem** query string — a query carrega `?d=<base64 contato>` do
  link público), `navigator.userAgent`, versão do build, 3 primeiras linhas do stack.
  **Sem** `owner_id`, sem e-mail, sem nome.
- Rate limit por sessão: **5 eventos**, contador em `sessionStorage`.
- **Bloqueio técnico:** hoje o front **não expõe versão de build** — `vite.config.ts` não tem
  `define`. Preciso adicionar `__APP_VERSION__` (`git rev-parse --short HEAD` no build) antes.
  Sem isso, "o cliente está com bundle velho" continua indistinguível de bug real (foi a causa
  raiz dos casos Bruno/Aline/Lucilene, `eb26698`).
- A function é chamada com a anon key (é o front), então ela valida **origem** e aplica rate limit
  por IP; nada de `service_role` no browser.

### 3.6 Integrações externas
`source: integration`, `component` = `openai|gemini|meta|uazapi|gcal`. Já existem códigos prontos
para reusar: `_shared/openai-admin.ts` (`openai_rate_limited`, `openai_admin_key_rejected`, ...),
o `try/catch` de 15s do `meta-send-message` (linhas 324-335), `uzapi-health-check`.
Regras de severidade: sem crédito / 401 → **crítica** (para a IA de todos os clientes);
429 → **alta**; timeout isolado → **media**.

### 3.7 Fontes extras que encontrei e vou incluir (você não listou)
1. **`webhook-queue-receiver` / `webhook-handle-message`** — é a porta de entrada de toda mensagem;
   falha aqui = cliente sem atendimento. Severidade **crítica**.
2. **Instância desconectada** (`instances.status <> 'connected'`) por mais de 10 min — hoje o
   `uzapi-health-check` sabe, mas ninguém é avisado. **Crítica** (é literalmente "cliente sem
   atendimento").
3. **Template Meta virando `REJECTED`** — quebra confirmação de agenda e campanha em silêncio.
   **Alta**.
4. **Qualidade Meta caindo para `RED` / tier rebaixado** — `meta-quality-status` já lê;
   virar alerta. **Alta**.
5. **Fila de resumo/automação parada** (§3.3). **Média**.

---

## 4. Análise por IA

Function `incident-analyze`, chamada pelo cron `incident-analyze-scan` (`*/5 * * * *`) para
incidentes `analyzed_at is null`, mais um reprocesso quando `event_count` cruza 10× o valor da
última análise.

- Modelo: **`gpt-4.1-mini`**, `reasoning` baixo, `response_format: json_schema` (saída estruturada
  obrigatória, sem parse de texto livre).
- Contexto enviado: origem, componente, mensagem e descrição **já sanitizadas**, 3 linhas de stack,
  código HTTP, sequência de nós ou rota, histórico do fingerprint (quantas vezes, desde quando) e
  as linhas de `incident_catalog` que casaram com o padrão.
- Preenche `ai_summary`, `ai_probable_cause`, `ai_origin`, `ai_severity`, `ai_impact`,
  `ai_fix_n8n`, `ai_fix_system`, `ai_confidence`, `ai_model`.
- **`ai_origin` é obrigatório**: arquivo+linha, nó do workflow, job, ou integração externa. O schema
  torna o campo `required` e, quando a IA não consegue afirmar, ela deve escrever as **duas
  hipóteses mais prováveis e o que olhar para confirmar** — instrução explícita no prompt e
  validada no servidor (se vier vazio, `ai_confidence = 0` e o painel mostra "origem não
  determinada").
- Severidade segue **exatamente** as suas regras: crítica = cliente sem atendimento / dado em risco
  / cobrança quebrada; alta = função importante fora com contorno; média = falha com fallback
  funcionando; baixa = ruído. A severidade do `incident_catalog` **vence** a da IA quando há match
  (catálogo é seu, IA é palpite).
- Custo: gravado em `token_usage_log` com `source='system'`, `sistema='system'` e
  `owner_id` = conta da plataforma (Clinbia) — é consumo interno, **não** é rateado para cliente
  nenhum e **não** entra em relatório de cliente.

---

## 5. Envio e agrupamento — `alert-notify`

Cron `alert-dispatch` (`*/2 * * * *`) + resumo (`0 */2 * * *`).

| situação | regra |
|---|---|
| incidente novo `critica` ou `alta` | envio imediato, template 1 |
| incidente novo `media` ou `baixa` | entra no resumo de 2h; **não envia se não houver nada** |
| incidente aberto que continua | novo aviso só se `now() - last_notified_at >= 1h` **ou** `event_count - notified_at_event_count >= 20`; `{{3}}` = `"continua acontecendo: N ocorrências"` |
| fora da janela do destinatário | `status: skipped_window`, fica no painel; entra no primeiro envio dentro da janela |
| acima do rate limit | `status: skipped_ratelimit` + **uma** mensagem de resumo dizendo quantos ficaram no painel |

Rate limit em `llm_platform_settings` (mesmo lugar das chaves de desligar os alertas de custo):
`alert_max_per_hour` (default **10**), `alert_summary_cron_enabled`, `alert_notify_enabled`.
Contagem sobre `incident_notifications` da última hora com `status='sent'`.
**Desligar o envio nunca desliga a gravação** — o painel continua completo.

---

## 6. Página do Super Admin

**Decisão pendente sobre o nome.** Você escreveu "página chamada de **Alertas**" na abertura e
"página **Monitoramento**" na §6 — e **já existe** uma aba `monitoramento` em `/admin`
(`ADMIN_PAGES`, `src/lib/adminPermissions.ts`), que é o quadro de tickets por agente.
**Minha proposta: aba nova `alertas`**, para não colidir. Confirma?

- `src/pages/Admin.tsx`: `ADMIN_PAGES` ganha `{value:'alertas', label:'Alertas', icon: BellRing}`;
  `renderSection()` (linhas 106-138) ganha o `case`. A visibilidade já é automática
  (`visiblePages` = `ADMIN_PAGES.filter(p => can(p,'view'))`, linhas 55-58) e a permissão entra em
  `DEFAULT_ADMIN_PERMISSIONS` como `none` — ou seja, **só super admin vê** até você liberar
  para alguém.
- Componentes: `src/components/admin/alertas/` — `AlertasSection` (lista + filtros de origem,
  gravidade, status, componente, clínica, período), `IncidentDetail` (análise, eventos
  sanitizados, links para a execução do n8n e para o log da function, botões **Reconhecer** e
  **Resolver** com nota), `AlertasIndicators` (abertos por gravidade, top 5 da semana,
  componentes que mais falham).
- RPCs (padrão dos RPCs admin: `SECURITY DEFINER` + `if not public.is_admin_staff() then raise
  exception 'forbidden'`, retorno `jsonb`): `admin_list_incidents`, `admin_get_incident`,
  `admin_ack_incident`, `admin_resolve_incident`, `admin_get_incident_metrics`,
  `admin_upsert_catalog_entry`, `admin_list_alert_recipients` / `admin_upsert_alert_recipient`.
- `useQuery` com `refetchInterval: 60_000`, igual `AdminDashboard.tsx:60`.

---

## 7. Testes e entrega

**7.1 Testes com evento simulado** (vitest, `src/test/monitoring/` + SQL em
`supabase/tests/security/`):
1. mesmo erro com UUID, telefone e timestamp diferentes → **1** incidente, `event_count = 3`;
2. payload com `sk-...`, JWT `eyJ...`, e-mail, telefone e corpo de mensagem → **nada disso**
   aparece em `incident_events` nem em `incident_notifications`;
3. reenvio: 59 min → não envia; 61 min → envia; +20 ocorrências em 10 min → envia;
4. resumo de 2h com zero incidentes → **nenhuma** mensagem;
5. 11º envio na mesma hora → `skipped_ratelimit` + uma mensagem de resumo.

**7.2 Teste real ponta a ponta** (com você): você força um erro em workflow de teste e eu forço um
erro em uma edge function de teste; as duas mensagens têm que chegar no seu WhatsApp.
**Pré-requisito:** os dois templates `APPROVED`.

**7.3 Documentação:** `docs/` (este arquivo vira o registro), `CLAUDE.md`, aba do manual de suporte
(`src/pages/Suporte.tsx`) — **não**, na verdade: o manual é do cliente e essa página é só do super
admin, então o manual **não** muda e `support-knowledge.ts` **não** muda. Registro fica em `docs/`
+ `CLAUDE.md` + `memory/`. (Corrigindo o item 4 do seu plano: incluir no manual exporia a
existência do monitoramento interno para o cliente final.)

---

## O que depende de você

1. **Nome da página:** `alertas` (nova) — confirmando que **não** é a aba `monitoramento` que já
   existe?
2. **Aprovar os 2 templates** da §0.3 na conexão Bruno Admin. Se a Meta recusar `UTILITY`,
   reenviar como `MARKETING`.
3. **`N8N_ERROR_INGEST_KEY`** (gerada agora, 32 bytes):
   `91d5de17aaa6ab1306402bdbafc98b4ca0b56e8860374ecc85fed130168ababb`
   Vai para os secrets do Supabase (`npx supabase secrets set`) e para o header `x-api-key` do nó
   HTTP Request do seu workflow MONITOR DE ERROS.
4. **Detector silencioso:** cria o `N8N_API_KEY` (Personal Access Token do n8n) para eu fazer a
   varredura periódica, ou prefere o nó manual dentro de cada workflow? (§2.1)
5. **Dois campos extras no payload do n8n:** `error_name` e `started_at` (§2).
6. **Deploy de ~130 functions** por causa do `_shared/api-errors.ts`, ou Etapa 1 só nas ~20
   functions de maior risco? (§3.1) — isso **afeta produção**, por isso não sigo sem seu OK.
