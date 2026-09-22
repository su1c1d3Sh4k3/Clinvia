# Plano — projeto e chave OpenAI por conta + consumo real no Super Admin

Aberto em 22/09/2026. **Revisão 2** (22/09/2026, após o fechamento da Parte 1 de segurança e
os 6 ajustes de escopo pedidos pelo user). Status: **aguardando o OK do user** para aplicar as
3 migrations do delta.

O pré-requisito de segurança está **cumprido**: `20260922133000` (revoke das colunas de
segredo) e `20260922250000` (financial_access) foram aplicadas e verificadas em produção
(`d16ebfe`), com o front publicado pelo user. `profiles.openai_token` não é mais legível pelo
role `authenticated` — 48 das 51 colunas seguem liberadas, as 3 secretas dão `42501` até para
o dono da própria linha, e `select *` em `profiles` dá `42501`. Só `service_role` lê a chave.

Regra que governa a etapa inteira: **nada retroativo e nada automático sem interruptor**.
Nenhum backfill de `token_usage_log`, nenhuma reconciliação de histórico, e
`llm_platform_settings.provisioning_enabled` continua `false` até o último arquivo da etapa.

---

## 0. Achados que mudam o desenho

### 0.1 A chave do cliente estava exposta (RESOLVIDO)
`profiles` tinha `SELECT USING (true)` para `authenticated` e `openai_token` em **texto
puro**. Corrigido por privilégio de **coluna** (`20260922133000`), não por policy — a policy
de linha continua permissiva e isso é assunto da Fase 2 (ver `docs/security/ESTADO_ATUAL.md`).

A criptografia era um **no-op silencioso**: `encryptToken` existia e era chamada, mas o secret
`OPENAI_TOKEN_ENCRYPTION_KEY` nunca havia sido criado ⇒ `getEncryptionKey()` devolvia `null`,
`encryptToken` devolvia `null` e o `if (encrypted)` não entrava. Secret criado (e guardado no
`.env`, porque perdê-lo é perder as chaves OpenAI dos clientes) e as chaves convertidas para
`enc:` com round-trip verificado. Daqui pra frente todo salvamento nasce `enc:`.

### 0.2 `spend_limit` por projeto — endpoint confirmado
- **Organização:** `POST https://api.openai.com/v1/organization/spend_limit`.
- **Projeto:** `POST https://api.openai.com/v1/organization/projects/{project_id}/spend_limit`,
  body `{ "threshold_amount": <centavos>, "currency": "USD", "interval": "month" }`.

Resposta diferente de 2xx grava `openai_provision_error` (projeto e chave continuam válidos) e
o limite segue vivo no relatório: o painel compara o custo real com `openai_spend_limit_usd`.

### 0.3 A aprovação NÃO cria a conta por trigger — e o trigger atual erra em 3 pontos (NOVO)
Medido no código real em 22/09/2026:

- O cadastro público (`src/pages/Auth.tsx`) grava em **`pending_signups`**, e **não** cria
  linha em `profiles`. Não existe `profiles.status = 'pendente'` em produção: as 8 linhas
  estão todas em `ativo`.
- A linha de `profiles` nasce dentro da edge function **`approve-client`**, num
  `upsert(..., { onConflict: 'id' })` com `status: 'ativo'`. Ou seja: na rota feliz, o
  `AFTER INSERT` da `20260922132000` **já coincide** com o momento da aprovação.

Mas ele erra em três pontos, e é isso que a migration `20260922260000` conserta:

1. `approve-client` **reaproveita o usuário de auth quando o e-mail já existe**. Se a linha de
   `profiles` já existir (corrida com `handle_new_user`, ou reaprovação), o upsert vira
   **UPDATE** e o trigger de INSERT não dispara ⇒ conta aprovada **sem chave, em silêncio**.
2. Reativar uma conta inativa (`inativo → ativo`) não enfileirava nada.
3. O trigger enfileirava **qualquer** linha nova de `profiles`, inclusive as que não são conta
   de cliente — hoje existem em produção uma linha `role = 'super-admin'` e uma
   `role = 'agent'` (`meta-review`). Gastaria projeto na OpenAI para quem não é tenant.

O gatilho passa a ser **"conta de cliente que está ativa"**: `INSERT` que já nasce ativo, ou
`UPDATE` que *acabou* de virar ativo. `role <> 'admin'`, conta com chave/projeto e
`openai_key_source = 'customer'` ficam de fora.

### 0.4 `billable` pela presença do token é um furo de faturamento (NOVO)
`api-token-usage/index.ts:328` decide hoje:
`billable: !(typeof prof?.openai_token === 'string' && prof.openai_token.trim())`.

No momento em que a plataforma gravar a chave provisionada em `openai_token`, **a conta viraria
`billable = false`** e a Clinbia pararia de faturar justamente as contas cuja fatura ela paga.
Mesmo erro em `api-token-usage-sandbox/index.ts:205`. A regra passa a ser
`billable = openai_key_source !== 'customer'`. Isso **precisa entrar junto** com o
provisionamento, não depois.

---

## 1. Migrations

### Já aplicadas (não mexer)

| arquivo | conteúdo |
|---|---|
| `20260922130000_openai_key_source_and_markup.sql` | 9 colunas em `profiles` (`openai_key_source` CHECK platform/customer, `openai_project_id` + índice único, `openai_service_account_id`, `openai_api_key_id`, `openai_spend_limit_usd`, `openai_provisioned_at`, `openai_provision_error`, `openai_spend_alert_level`, `openai_spend_alert_sent_at`); singleton `llm_platform_settings`; markup global 0.25 → 0.30 |
| `20260922131000_openai_project_usage.sql` | `openai_project_usage_daily` (tokens reais por dia/projeto/modelo) e `openai_project_costs_daily` (**USD faturado** por dia/projeto/line_item); RPC `admin_get_openai_account_usage` |
| `20260922132000_openai_provision_queue.sql` | fila `openai_provision_queue`, trigger `zz_profiles_enqueue_openai_provision` e `claim_openai_provision_jobs()` (devolve vazio enquanto `provisioning_enabled = false`) |
| `20260922133000_profiles_revoke_secret_columns.sql` | revoke de coluna das 3 colunas de segredo — **aplicada e verificada** em 22/09/2026 |

Estado real medido em produção: `llm_platform_settings` = `default_markup 0.30`,
`default_spend_limit_usd 200`, `spend_alert_threshold 0.80`, `provisioning_enabled **false**`.
Fila vazia. Nenhuma conta com `openai_project_id`. Uma conta com token (ver §2).

### Novas — aguardando o OK do user

| arquivo | conteúdo | risco em produção |
|---|---|---|
| `20260922260000_openai_enqueue_on_approval.sql` | reescreve `enqueue_openai_provision()` e troca o trigger para `after insert or update of status`, com o recorte do §0.3 | **nenhum efeito hoje**: não enfileira conta existente e o worker segue desligado. Só muda o comportamento de aprovações futuras |
| `20260922261000_openai_account_usage_rpc_v2.sql` | `admin_get_openai_account_usage` v2: `synced_at` NULL em vez de `-infinity`, e passa a devolver `is_estimated`, `spend_alert_threshold` e `spend_alert_level` | **nenhum efeito hoje**: nenhuma conta tem projeto, a RPC devolve zeros como já devolve. Exige DROP+CREATE (muda as colunas de saída) e o front novo no mesmo commit |
| `20260922262000_openai_provisioning_enable.sql` | liga `provisioning_enabled = true` | **este é o único que muda comportamento real.** Aplicar só no fim, depois do teste ponta a ponta |

| `20260922134000_openai_key_source_customer_backfill.sql` | marca `openai_key_source = 'customer'` quem já tem token próprio | **decidido: 0 linhas.** O único token era da `Bruno Admin` (`3e21175c`) e ele foi limpo antes (decisão do user, ver §2) ⇒ a migration entra como rede de segurança para tokens futuros |

Cada uma tem `_rollback.sql` ao lado.

---

## 2. Inventário das contas (a lista que você pediu)

8 linhas em `profiles`, todas `status = 'ativo'`. Nenhuma tem projeto OpenAI.

### Candidatas a provisionar (contas de cliente)

| empresa | e-mail | status | dados | consumo 30d (chave compartilhada) |
|---|---|---|---|---|
| PELE DERMATOLOGIA | fayruss.costa@yahoo.com | ativo | 13 colab · 3 conexões · 7.122 contatos | **27.920 reqs** (último 22/09 14:40) |
| Contourline Equipamentos Médicos e Estéticos | jessica.oliveira@contourline.com.br | ativo | 6 colab · 1 conexão · 1.039 contatos | 432 reqs (último 22/09 10:58) |
| Contourline | almeidaegio@gmail.com | ativo | 1 colab · 0 conexão · 231 contatos | — |
| Ciência que Conecta | erica@ericagiacomelli.com | ativo | 1 colab · 0 conexão · 0 contatos | — |
| Clinbia | clinbia.ai@gmail.com | ativo | 1 colab · 1 conexão · 2 contatos | — |
| `Bruno Admin` (`3e21175c`, sem empresa/e-mail) | — | ativo | 4 colab · 324 contatos | 5 reqs (último 16/09 21:17) |

**Decisões do user (22/09/2026), que revisam o que este plano recomendava:**
- `Clinbia` **entra** no provisionamento, como as demais.
- `Bruno Admin` **entra também**: o `openai_token` próprio foi **limpo** e a conta é provisionada
  como plataforma, com `profiles.markup = 0` — é conta interna e ele quer ver o custo real no
  painel, sem margem. (Este plano recomendava o contrário, marcá-la `customer`; a decisão do
  user vence.) Consequência de ordem: limpando o token antes, a `20260922134000` roda em 0
  linhas, que é justamente o estado final desejado (`platform`, não `customer`).

### Fora da lista, com o motivo

| linha | por que não entra |
|---|---|
| `Admin` (`23da6832`, `role = super-admin`) | não é tenant |
| `meta-review` (`d38b48ca`, `role = agent`) | conta de revisão da Meta, zero dados |

### Protocolo do provisionamento em lote (depois do seu OK)
Uma conta por vez, `provision-openai-project` chamada com o `profileId`, na ordem da tabela
acima (a maior primeiro, para o erro aparecer na conta que importa). Idempotente: se
`openai_project_id` já existir, sai com `already_provisioned` e não cria nada. Relatório por
conta com projeto criado, id da chave, limite aplicado e erro se houver. Paro no primeiro erro
e te aviso antes de seguir.

---

## 3. Regra de cobrança

| situação | cálculo | selo na tela |
|---|---|---|
| `openai_key_source = 'platform'` | custo real da Costs API do projeto × (1 + markup 30%) | "real" |
| conta na chave compartilhada (`null`) | estimativa do `token_usage_log` (cache calibrado + markup) | **"estimado"** |
| `openai_key_source = 'customer'` | mostra o consumo, mas markup 0 e `billable = false` | "chave do cliente" |

`billable` passa a ser decidido por `openai_key_source` (ver §0.4) — alteração em
`api-token-usage` e `api-token-usage-sandbox`, com redeploy das duas.

---

## 4. Edge functions

1. **`provision-openai-project`** (service role; chave de admin da organização)
   1. idempotente: `openai_project_id` já preenchido ⇒ `already_provisioned`;
      `openai_key_source = 'customer'` ⇒ `skipped_customer_key`;
   2. `POST /v1/organization/projects` → `{ name: "Clinbia - <empresa> - <id curto>" }`
      (empresa = `company_name`, caindo para `full_name`, depois o local part do e-mail;
      `<id curto>` = 8 primeiros caracteres do `profiles.id`, que é o que dá unicidade);
   3. `POST /v1/organization/projects/{id}/service_accounts` com o **mesmo nome** → a chave vem
      em `api_key.value` e **só nessa resposta**;
   4. tenta o spend limit do projeto (§0.2) com `llm_platform_settings.default_spend_limit_usd`;
   5. grava `openai_token = enc:…`, `openai_key_source = 'platform'`, os três ids, o limite e
      `openai_provisioned_at`. Falha ⇒ `openai_provision_error` e a fila reprocessa (5
      tentativas). **Nunca loga a chave.**
   - **Resolução da chave de admin (decisão do user, 22/09):** usa `OPENAI_ADMIN_KEY_WRITE`
     quando o secret existir; se não existir, cai em `OPENAI_ADMIN_KEY` (a admin key de acesso
     total que está cadastrada hoje) e **loga um aviso** de que está usando a chave única de
     leitura/escrita. Nenhuma das duas presente ⇒ `openai_admin_key_missing`, sem tentar.
     O `admin_key_source` (`write` | `fallback_shared`) volta na resposta e vai para o relatório,
     para o user saber quando a separação das duas chaves já valeu.
2. **`openai-provision-worker`** (cron `*/5`): `claim_openai_provision_jobs()` → chama a
   função acima → marca `done`/`failed`/`skipped`. Inerte enquanto
   `provisioning_enabled = false`.
3. **`sync-openai-usage`** (cron 1×/dia para o dia anterior + 1×/hora para o dia corrente):
   `GET /v1/organization/usage/completions` (`group_by=project_id,model`, `bucket_width=1d`) e
   `GET /v1/organization/costs` (`group_by=project_id,line_item`), paginando por `next_page`;
   upsert nas duas tabelas. **Busca só a partir de hoje** — nada retroativo. Ao cruzar
   `spend_alert_threshold` (80%), grava `openai_spend_alert_level` e manda o e-mail uma única
   vez por patamar.
4. **`get-account-openai-key`** (`x-api-key`, padrão do `api-token-usage`): recebe o id da
   conta e devolve `{ openai_api_key, openai_project_id }` **só** se
   `openai_key_source = 'platform'`. Sem log da chave.
5. **`admin-openai-account`** (JWT + `admin_can('clientes', …)`): **já no ar** com `get`
   (estado + chave mascarada, `view`) e `reveal` (chave em claro, `edit`, com log de quem
   revelou). Entram `provision` (botão de uma conta), `set_spend_limit` e `archive_project`
   (`POST /v1/organization/projects/{id}/archive`, **só na exclusão da conta**, com
   confirmação; suspensão não arquiva).

### Credencial do n8n — o que fica manual
O workflow de cada cliente no n8n continua apontando para a credencial antiga. A troca é
**manual, feita por você**: ao fim do provisionamento eu entrego a lista
`empresa → nome da credencial sugerido → project_id`, e enquanto a troca não acontecer aquela
conta continua consumindo a chave compartilhada e o card mostra **"estimado"**. O
`get-account-openai-key` existe para o n8n buscar a chave sem que ela passe por você.

---

## 5. Super Admin — card "Consumo de IA" na página do cliente

Mês corrente (fuso SP), via `admin_get_openai_account_usage` v2, ao lado do
`TokenUsageCharts` (estimativa) e do `OpenAITokenManager` (chave) que já existem em
`AdminClients.tsx`:

- **Gasto Clinbia (US$ e R$)** = custo real × 1,30 — R$ pelo `latest_usd_brl_rate`.
- **Gasto real OpenAI (US$ e R$)** — Costs API do projeto daquela conta.
- Tokens: input, cacheado (com %), output, nº de requisições.
- Limite mensal (padrão **US$ 200**) e % consumido, com a barra virando alerta em **80%**.
- **"Atualizado em <hora>"**, com aviso de que a API da OpenAI tem atraso; "nunca sincronizado"
  quando `synced_at` é NULL.
- "Token OpenAI Customizado" **mascarado** (`sk-proj-…WXYZ`) + origem (plataforma / cliente) +
  **revelar/copiar só para super admin**. Editar manualmente ⇒ grava
  `openai_key_source = 'customer'` com aviso de que a conta **sai do faturamento da
  plataforma**.
- `is_estimated = true` ⇒ selo **"estimado"** + botão **"Provisionar projeto OpenAI"** (uma
  conta por vez).

---

## 6. Ordem de execução e onde eu paro

| # | passo | depende de você? |
|---|---|---|
| 1 | **este documento + as 3 migrations** | **FEITO — OK em 22/09, com as 3 decisões do §2 e do §4.1** |
| 2 | secret de escrita da OpenAI | **opcional agora**: sem `OPENAI_ADMIN_KEY_WRITE` a função cai em `OPENAI_ADMIN_KEY` com aviso |
| 3 | aplicar `260000` + `261000` + `134000` e verificar | não |
| 4 | escrever as 4 edge functions + ajustar `billable` (§0.4) e deployar | não |
| 5 | front: card "Consumo de IA" + botão provisionar, num commit só | **SIM — o deploy do front é seu** |
| 6 | teste ponta a ponta com UMA conta de teste nova aprovada do zero | não (mas te mostro o resultado) |
| 7 | aplicar `262000` (liga o provisionamento automático) | **SIM — confirmação explícita** |
| 8 | provisionar as contas de hoje, uma por uma, com relatório | **SIM — o OK da lista do §2** |
| 9 | entregar os nomes das credenciais para você trocar no n8n | **SIM — a troca é manual** |
| 10 | docs: `src/pages/Suporte.tsx` + `_shared/support-knowledge.ts` (+ deploy `support-ai-chat`) | não |

---

## 7. Fora do escopo (não conflitar)
Gemini e as funções do sistema (`_shared/token-tracker.ts`, `support-ai-chat`, resumo
automático) continuam na chave compartilhada — o consumo delas **não** aparece no projeto da
conta. Isso é a Etapa 2, junto com a sub-notificação de tokens do `token-tracker`.

---

## Contexto: o que já foi aplicado antes deste plano
- `9caae05` / `d16ebfe` — Parte 1 de segurança encerrada; `docs/security/ESTADO_ATUAL.md` é a
  fonte da verdade do que ficou aplicado, pronto-e-travado e não-iniciado.
- `08d7a06` — trigger fantasma de tokens dropado, 45.296 linhas arquivadas, acumuladores
  recalculados e `reset_monthly_tokens` agendado.
- `f824714` — gêmeo de áudio dropado + 19 linhas arquivadas; `gpt-4-turbo` cadastrado; view
  `v_token_coverage_daily`.
- `20260921161000_token_cost_backfill.sql` — **cancelado pelo user** (backfill por estimativa:
  estimado ≈US$66 contra fatura real ≈US$136). Fica no repositório sem aplicar.
