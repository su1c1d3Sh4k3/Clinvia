# Plano — projeto e chave OpenAI por conta + consumo real no Super Admin

Aberto em 22/09/2026. Status: **aprovado pelo user**, com a ordem de execução dele
(segurança primeiro, depois auditoria de RLS, depois o resto da etapa).

Já aplicado em produção: migrations `20260922130000` (colunas + `llm_platform_settings` +
markup global 0.30), `20260922131000` (uso/custo por projeto) e `20260922132000` (fila com
`provisioning_enabled = false`). As 4 chaves de cliente foram **re-encriptadas** (ver 0.1).
Pendentes de gatilho externo: `20260922133000` (revoke — espera o deploy do front) e
`20260922134000` (`openai_key_source = 'customer'` — espera o user terminar a exclusão de
clientes).

Regra que governa a etapa inteira: **nada retroativo**. Nenhum projeto/chave para conta
existente, nenhum backfill, nenhuma reconciliação sobre o histórico, nenhuma linha antiga de
`token_usage_log` alterada. Tudo que atinge conta existente fica pronto e **desligado**.

---

## 0. Dois achados que mudam o desenho

### 0.1 A chave do cliente está exposta hoje (grave)
`profiles` tem a policy **`Users can view all profiles` = SELECT USING (true)** para o role
`authenticated`. Qualquer usuário logado de qualquer tenant lê a linha de `profiles` de todos
os outros — e `openai_token` está gravado em **texto puro** (4 chaves `sk-proj-…` de clientes
reais: fabriciasouzaclinic, consultoriodracintialtda, atendimento@clinicaautoestima e uma
quarta conta). Guardar aí a chave criada pela plataforma multiplicaria o problema.

Correção proposta (cirúrgica, na parte 1 das migrations): privilégio de **coluna**.
`revoke select (openai_token, openai_api_key_id, openai_service_account_id) on profiles from
authenticated, anon`. A policy de linha continua como está (revisar o escopo dela é assunto
separado — ela também expõe e-mail, empresa e custos de todos os tenants).

Pré-requisito no front: `src/components/ChatArea.tsx:214` faz `.select("*")` em `profiles` e
passaria a dar *permission denied* — trocar por lista explícita de colunas **antes** de
aplicar. `AdminClients.tsx:284` também lê `openai_token` direto e passa a ler pela edge
function nova.

#### A criptografia era um no-op silencioso (achado em 22/09/2026, corrigido)
`_shared/token-tracker.ts` tem `encryptToken`/`decryptToken` com prefixo `enc:` desde
sempre, e `admin-update-profile` já chamava `encryptToken` antes de gravar — **mas o secret
`OPENAI_TOKEN_ENCRYPTION_KEY` nunca foi criado**. Sem ele, `getEncryptionKey()` devolve
`null`, `encryptToken` devolve `null`, o `if (encrypted)` não entra e o token é gravado em
**texto puro**. É por isso que as 4 chaves estavam cruas: não foi legado anterior ao
recurso, era o recurso desligado.

Correção aplicada: secret criado (também guardado no `.env`, porque perder essa chave é
perder as chaves OpenAI dos clientes) e as 4 linhas convertidas para `enc:` por reparo
pontual (`supabase/.temp/_oa_reencrypt.mjs`, mesmo formato AES-256-GCM da edge: chave =
SHA-256 do secret, `enc:` + base64(iv‖ciphertext‖tag)), com round-trip verificado antes de
cada UPDATE. O SHA-256 da chave local foi comparado com o digest do `secrets list` para
garantir que o runtime das edge functions descriptografa o que foi gravado. Daqui pra
frente todo salvamento já nasce `enc:` — não há ação manual do Super Admin.

Quem consome o valor é só `getOpenAIToken`, que descriptografa; e falha de decriptação cai
no token padrão da plataforma (sem apagão, só desloca o faturamento). Nenhuma função nem
view do banco devolve a coluna (`admin_get_dashboard_metrics` só lê `openai_token_invalid`).

### 0.2 `spend_limit` por projeto — endpoint confirmado
Correção do user (eu havia dito que não estava na referência; estava). Confirmado na doc de
22/09/2026, em Admin > Organization > Projects > Spend limit:
- **Organização:** `POST https://api.openai.com/v1/organization/spend_limit`.
- **Projeto:** `POST https://api.openai.com/v1/organization/projects/{project_id}/spend_limit`,
  body `{ "threshold_amount": <centavos>, "currency": "USD", "interval": "month" }`.

Uso direto, sem sondagem. O tratamento de erro fica de pé: resposta diferente de 2xx grava
`openai_provision_error` (o projeto e a chave continuam válidos) e o limite segue vivo no
relatório — o painel mostra "% consumido" comparando o custo real com
`openai_spend_limit_usd` e a sincronização horária alerta a partir de 80%.

---

## 1. Migrations

| arquivo | conteúdo | estado |
|---|---|---|
| `20260922130000_openai_key_source_and_markup.sql` | 9 colunas novas em `profiles` (`openai_key_source` com CHECK platform/customer, `openai_project_id` + índice único, `openai_service_account_id`, `openai_api_key_id`, `openai_spend_limit_usd`, `openai_provisioned_at`, `openai_provision_error`, `openai_spend_alert_level`, `openai_spend_alert_sent_at`); singleton `llm_platform_settings` (`default_markup 0.30`, `default_spend_limit_usd 200`, `provisioning_enabled false`, `spend_alert_threshold 0.80`, `spend_alert_email`); **markup global 0.25 → 0.30** em `llm_model_prices` (default incluído) | **aplicada** |
| `20260922133000_profiles_revoke_secret_columns.sql` | `revoke select` de `openai_token`, `openai_api_key_id` e `openai_service_account_id` para `authenticated` e `anon` | **espera o deploy do front** |
| `20260922134000_openai_key_source_customer_backfill.sql` | as contas com token próprio viram `openai_key_source = 'customer'` (idempotente) | **espera a exclusão de clientes** |
| `20260922131000_openai_project_usage.sql` | `openai_project_usage_daily (day, project_id, model, …)` = tokens reais; `openai_project_costs_daily (day, project_id, line_item, cost_usd)` = **USD faturado**; RPC `admin_get_openai_account_usage(profile_id)` com o mês corrente em SP, guardada por `admin_can('clientes','view')` | **aplicada** |
| `20260922132000_openai_provision_queue.sql` | fila `openai_provision_queue`, trigger `zz_profiles_enqueue_openai_provision` (AFTER INSERT — só conta nova) e `claim_openai_provision_jobs()` que **retorna vazio enquanto `provisioning_enabled = false`** | **aplicada** (claim devolveu 0 jobs na verificação) |

Duas tabelas de consumo porque as APIs têm granularidade diferente: a Usage API separa por
modelo, a Costs API por `line_item`. O "Custo real OpenAI" sai da **Costs API** — é o valor
faturado, não o nosso cálculo por tabela de preço.

## 2. Regra de cobrança (nova)

| situação | cálculo | selo na tela |
|---|---|---|
| `openai_key_source = 'platform'` | custo real da Costs API do projeto × (1 + markup) | "real" |
| conta na chave compartilhada (`null`) | estimativa do `token_usage_log` (cache calibrado + markup) | **"estimado"** |
| `openai_key_source = 'customer'` | mostra o consumo, mas markup 0 e `billable = false` | "chave do cliente" |

`billable` passa a ser decidido por `openai_key_source`, não pela presença do token —
alteração em `api-token-usage`, `api-token-usage-sandbox` e `_shared/token-cost.ts`
(redeploy das duas fns; o bundler inlina o `_shared`).

## 3. Edge functions

1. **`provision-openai-project`** (service role; secret novo `OPENAI_ADMIN_KEY_WRITE`)
   1. idempotente: se `openai_project_id` já existe, sai com `already_provisioned`;
   2. `POST /v1/organization/projects` → `{ name: "Clinbia - <empresa> - <id curto>" }`;
   3. `POST /v1/organization/projects/{id}/service_accounts` → chave em `api_key.value`;
   4. tenta o spend limit do projeto (ver 0.2), valor de `llm_platform_settings`;
   5. grava `openai_token = enc:…`, `openai_key_source = 'platform'`, ids, limite e
      `openai_provisioned_at`. Falha → `openai_provision_error` e a fila reprocessa (5
      tentativas). Nunca loga a chave.
   - Sem `OPENAI_ADMIN_KEY_WRITE` → erro claro `openai_admin_write_key_missing`.
   - `OPENAI_ADMIN_KEY` atual passa a ser **somente leitura** (calibração + coleta de uso).
2. **`openai-provision-worker`** (cron `*/5`): `claim_openai_provision_jobs()` → chama a
   função acima. Desligado por `provisioning_enabled = false`.
3. **`sync-openai-usage`** (cron: 1×/dia para o dia anterior + 1×/hora para o dia corrente):
   `GET /v1/organization/usage/completions` (`group_by=project_id,model`, `bucket_width=1d`)
   e `GET /v1/organization/costs` (`group_by=project_id,line_item`), com paginação
   `next_page`; upsert nas duas tabelas. **Busca só a partir de hoje** — nada retroativo.
   A calibração por modelo (`calibrate-cache-ratio`) continua como está.
4. **`get-account-openai-key`** (`x-api-key`, padrão do `api-token-usage`): recebe o id da
   conta, devolve `{ openai_api_key, openai_project_id }` **só** se
   `openai_key_source = 'platform'`. Sem log da chave. É o que o n8n chama ao criar a
   credencial do workflow do cliente.
5. **`admin-openai-account`** (JWT + `admin_can('clientes', …)`): **já no ar** com `get`
   (estado da conta + chave **mascarada**, `view`) e `reveal` (chave em claro, `edit`, com
   log de quem revelou). Faltam `set_spend_limit` (reenvia o POST) e `archive_project`
   (`POST /v1/organization/projects/{id}/archive`, **só na exclusão da conta**, com
   confirmação; suspensão não arquiva). A re-encriptação não é ação de painel — já foi feita
   (ver 0.1) e todo salvamento novo nasce `enc:`.

## 4. Super Admin — card "Consumo de IA" na página do cliente

Mês corrente (fuso SP), via `admin_get_openai_account_usage`:
- **Consumo Clinbia (US$ e R$)** = custo real × (1 + markup) — R$ pelo `latest_usd_brl_rate`.
- **Custo real OpenAI (US$ e R$)**.
- Tokens: input, cacheado (com %), output, nº de requisições.
- "Atualizado em <hora>" com aviso de que a API da OpenAI tem atraso.
- Limite mensal do projeto e % consumido (barra).
- "Token OpenAI Customizado" mascarado (`sk-…XXXX`) + origem (plataforma / cliente) +
  revelar/copiar para super admin. Editar manualmente ⇒ grava `openai_key_source =
  'customer'` com aviso de que a conta **sai do faturamento da plataforma**.
- Conta sem projeto (ou `customer`): valor estimado do `token_usage_log` com selo
  **"estimado"** + botão **"Provisionar projeto OpenAI"** (uma conta por vez).

## 5. Teste ponta a ponta
Com UMA conta de teste nova indicada pelo user: projeto criado, chave salva mascarada e
encriptada, limite aplicado (ou o erro registrado conforme 0.2), algumas chamadas pela IA e
o consumo aparecendo no card depois da sincronização horária.

## 6. Documentação (fecha a etapa)
`src/pages/Suporte.tsx` + guia correspondente e `_shared/support-knowledge.ts`
(+ `npx supabase functions deploy support-ai-chat`): chave por conta, markup 30%, e a
diferença entre custo real e estimado.

## 7. Fora do escopo (não conflitar)
Gemini e as funções do sistema (`_shared/token-tracker.ts`, `support-ai-chat`) continuam na
chave compartilhada — o consumo delas **não** aparece no projeto da conta. Isso é a Etapa 2,
junto com a sub-notificação de tokens do `token-tracker`.

---

## Contexto: o que já foi aplicado antes deste plano
- `08d7a06` — trigger fantasma de tokens dropado, 45.296 linhas arquivadas, acumuladores
  recalculados e `reset_monthly_tokens` agendado.
- `f824714` — gêmeo de áudio dropado + 19 linhas arquivadas; `gpt-4-turbo` cadastrado
  (10/null/30); view `v_token_coverage_daily`.
- `20260921161000_token_cost_backfill.sql` — **cancelado pelo user** (backfill por
  estimativa). Fica no repositório sem aplicar.
