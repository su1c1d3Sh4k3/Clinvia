# Garantia de não-impacto — plano de segurança (Clinvia)

> Pedido do user: *"Quero que garanta que NADA vai ser impactado no que está rodando hoje e que essas alterações não quebrem nada nos clientes que hoje já estão utilizando a plataforma. Antes de qualquer coisa garanta isso."*
>
> **Nada foi aplicado em produção para produzir este documento.** Todas as provas abaixo são leitura de catálogo, varredura de código-fonte ou transação terminada em `rollback`.

---

## 1. Por que mudança de policy não alcança o que roda hoje

O sistema em produção tem três classes de consumidor do banco:

| Consumidor | Credencial | Papel Postgres | Afetado por RLS? |
|---|---|---|---|
| Edge functions (127), crons, webhooks, n8n | service key | `service_role` | **NÃO** |
| Migrations / CLI | `postgres` | `postgres` | **NÃO** |
| Navegador do cliente (bundle) | anon key + JWT do login | `anon` / `authenticated` | SIM |

Prova (`supabase/.temp/_safe_a_roles.sql`, executado no banco de produção):

```
anon          | super=false | bypassrls=false
authenticated | super=false | bypassrls=false
postgres      | super=false | bypassrls=true
service_role  | super=false | bypassrls=true
supabase_admin| super=true  | bypassrls=true
```

`BYPASSRLS` ignora policy **e ignora `force row level security`**. Logo:

- Nenhuma policy nova pode quebrar edge function, cron, webhook de entrada de mensagem, disparo de campanha, follow-up, confirmação de agendamento ou qualquer chamada do n8n. Todos usam service key.
- O `force row level security` previsto na Fase 2 é inócuo para `service_role`/`postgres` — ele só fecha o dono da tabela, e o dono é `postgres`, que tem bypass.

Complemento (`supabase/.temp/_safe_b_owners.sql`):

```
tabelas por dono          | postgres | 139
funcoes secdef por dono   | postgres | 233
```

Todas as 233 funções `SECURITY DEFINER` rodam como `postgres` (com bypass). Portanto `revoke execute ... from authenticated` numa RPC **não afeta chamadas internas** de outra função/trigger — só fecha a chamada direta feita pelo navegador.

**Conclusão 1:** o raio de alcance de toda a Fase 1 e Fase 2 é exclusivamente o navegador do usuário logado. Backend, automações e integrações são matematicamente imunes.

---

## 2. Mecanismo de teste antes/depois em dados reais, sem persistir nada

Regra (b) do plano do user ("teste automatizado de acesso antes/depois") está implementada como arnês em transação revertida:

```sql
begin;
create temp table _res(...);
grant all on _res to authenticated, anon, service_role;   -- o arnês troca de role
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid do tenant>","role":"authenticated"}';
-- MEDE ANTES
reset role;
-- DDL CANDIDATA (policies novas)
set local role authenticated; ... -- MEDE DEPOIS
set local role service_role;  ... -- CONTROLE: edge functions
set local role anon;          ... -- CONTROLE: chave pública do bundle
rollback;
```

Personas reais levantadas em `_safe_c_personas.sql`:

- **A** = PELE DERMATOLOGIA `e697878e-29c9-4b7e-88bb-869f4f2c76af` (7.112 contatos, 19 grupos)
- **B** = Clínica Auto Estima `06dfdd91-9fcd-4737-aa5b-08df0549f77a` (1.687 contatos, 8 grupos)

### Resultado do primeiro lote candidato (`_safe_d_harness_groups.sql`)

Tabelas: `groups`, `group_members`, `appointment_confirmation_sessions`, `response_times` (itens #4, #2 e #7 da auditoria).

```
ANTES   :: A vê grupos do próprio tenant            = 19
ANTES   :: A vê grupos de OUTROS tenants            = 230
ANTES   :: A vê membros de grupo de OUTROS          = 3980
ANTES   :: A vê sessões de confirmação de OUTROS    = 255
ANTES   :: A vê response_times (global)             = 155141

DEPOIS  :: A vê grupos do próprio tenant            = 19     <-- inalterado
DEPOIS  :: A vê grupos de OUTROS tenants            = 0
DEPOIS  :: A vê membros do próprio tenant           = 239    <-- inalterado
DEPOIS  :: A vê membros de grupo de OUTROS          = 0
DEPOIS  :: A vê sessões do próprio tenant           = 9684   <-- preservado
DEPOIS  :: A vê sessões de confirmação de OUTROS    = 0
DEPOIS  :: A vê response_times (global)             = 0

DEPOIS/service_role :: lê TODOS os grupos           = 249    <-- edge fn intacta
DEPOIS/service_role :: lê TODAS as sessões          = 9939   <-- cron de confirmação intacto
DEPOIS/service_role :: lê TODOS os response_times   = 155141

DEPOIS/anon :: grupos / membros / sessões           = 0 / 0 / 0
```

Leitura: o tenant continua vendo **exatamente o mesmo número de linhas próprias**; o que zera é só o que hoje vaza de outra clínica. Os dois controles confirmam a Conclusão 1 na prática.

### Prova de que nada ficou no banco

`_safe_e_rollback_check.sql` relista as policies das 4 tabelas depois do arnês: as 11 originais continuam lá (`acs_service_role`, `Enable read access for all users` em `groups`, etc.). Produção não foi tocada.

**Conclusão 2:** existe um mecanismo repetível para provar cada lote antes de aplicar. Ele será usado para todos os lotes da Fase 2, sempre com as 5 personas (anon, dono A, agente A, dono B, super admin).

---

## 3. Mapa de quem usa o objeto no front (regra (a) do plano)

Varredura mecânica de `src/` por `.from("X")` e `.rpc("Y")` → `supabase/.temp/_front_surface.json`:

- **96 tabelas** e **65 RPCs** tocadas pelo navegador.

Cruzando com a auditoria:

### 3.1 Sem nenhum uso no front — mudança é invisível para o cliente
`appointment_confirmation_sessions`, `response_times`, `team_costs`, `dados_atendimento`, `llm_model_prices`, `contacts_merge_backup_20260901`, `crm_client_channel_split_audit`, `_reminder_log`.

### 3.2 Usadas pelo front — a policy nova precisa preservar o próprio tenant
`groups`, `group_members` (já provado: 19/239 idênticos), `profiles`, `team_members`, `custom_permissions`, `notifications` (NavigationSidebar), `opportunities` (só o hook morto `useOpportunities.ts`, nenhum componente importa).

### 3.3 Três quase-acidentes evitados
A Fase 0.4 prevê `revoke execute` em 15 RPCs de worker. **Três delas são chamadas pelo navegador** e um revoke cego quebraria produção:

| RPC | Chamador no front |
|---|---|
| `create_default_crm_funnels` | `src/pages/IAConfig.tsx` |
| `count_future_appointments` | `src/hooks/useResponsaveis.ts` |
| `get_last_inbound_timestamps` | `src/components/ConversationsList.tsx` |

Essas três recebem **guard dentro do corpo** (checagem de tenant), não revoke.

### 3.4 Observação pré-existente
`copilot` é lida por `CopilotSettingsModal.tsx`, mas a tabela tem RLS ligado e **zero policies** — hoje já devolve vazio. Problema anterior ao plano, anotado para não ser confundido com regressão.

---

## 4. A armadilha da Fase 3 (revoke de colunas de segredo) — quantificada

Revogar `SELECT` de colunas de token para `authenticated` faz o Postgres devolver `permission denied for table` para **qualquer `select("*")`** naquela tabela — foi exatamente o caso do ChatArea no item 1.

Varredura `supabase/.temp/_safe_f_selects.mjs` nas 5 tabelas com segredo (`instances`, `instagram_instances`, `professional_google_calendars`, `profiles`, `team_members`):

**142 pontos de `.from()`, 22 deles com `select("*")`** — cada um quebraria no instante do revoke:

- `instances` (14): `ForwardMessageModal.tsx:37`, `ChatArea.tsx:294`, `MensagensAutomaticasSection.tsx:257`, `NavigationSidebar.tsx:181`, `NewMessageModal.tsx:143`, `InstancePrimarySelector.tsx:67`, `useCampaigns.ts:311`, `useFetchProfilePictures.ts:92` e `:123`, `useMinhaConta.ts:29` e `:74`, `Connections.tsx:81`, `Templates.tsx:454`, `WhatsAppConnection.tsx:44`
- `instagram_instances` (5): `ChatArea.tsx:308` e `:316`, `NavigationSidebar.tsx:195`, `useMinhaConta.ts:30`, `Connections.tsx:134`
- `professional_google_calendars` (1): `ProfessionalModal.tsx:894`
- `team_members` (2): `TeamSettings.tsx:114`, `Team.tsx:68`

Além disso, dois pontos pedem a coluna de segredo **explicitamente** e precisam ir para edge function: `WhatsAppImportModal.tsx:42` e `IAConfig.tsx:171` (ambos selecionam `apikey`).

`profiles` já não tem nenhum `select("*")` (removido no item 1).

**Sequência obrigatória, igual à do item 1:** trocar os 22 `select("*")` por lista explícita de colunas → commit + push → **o user publica** → só então aplicar o revoke. Nunca na ordem inversa.

---

## 5. Pontos do plano que quebrariam produção se aplicados como escritos

Levantados para decisão do user antes de entrar em execução:

| Fase | Item | Risco real | Mitigação proposta |
|---|---|---|---|
| 0.6 | "confirmar/desabilitar signup público" | O auto-cadastro está **vivo**: `Auth.tsx` → `pending_signups` → edge fn `signup-confirm`. Desabilitar corta a entrada de novos clientes. | Não desabilitar. Manter aberto e endurecer só as policies de `pending_signups`. |
| 0.7 | "buckets de mídia de paciente privados + signed URL" | Trocar bucket para privado quebra **toda imagem já renderizada por URL pública**. `company-branding` é público de propósito (`?v=ts` para furar CDN do cabeçalho de orçamento). | Inventariar bucket por bucket; front migra para `createSignedUrl` e publica **antes** de privatizar. `company-branding` fica público (não tem dado de paciente). |
| 3 | revoke das colunas de token | 22 `select("*")` (seção 4). | Front primeiro, revoke depois. |
| 3 | rotação do `SCHEDULING_API_KEY` | Todas as `api-*` param de responder ao n8n no segundo da rotação. | Janela combinada: aceitar chave antiga **e** nova por um período, atualizar as credenciais Header Auth do n8n, só então derrubar a antiga. |
| 3 | avisar os 4 clientes a rotacionar a chave OpenAI | Comunicação externa. | Texto vai para aprovação do user; nada é enviado sem ele. |
| 5 | `alter default privileges ... revoke all` | Não afeta tabela existente, mas **toda tabela nova nasce invisível para o front** — migration que esquecer o `grant` gera bug silencioso. | Aplicar junto com o check de CI e a regra no CLAUDE.md, nunca antes. |
| 0.4 | revoke em `send_push_notification` | Os chamadores (triggers/funções) não retornaram na varredura `_safe_b_owners.sql` — inconclusivo. | Reconfirmar chamadores antes do revoke. |

---

## 6. Garantia, em uma frase

Toda alteração das Fases 0–2 atinge **somente** o navegador do usuário logado (`anon`/`authenticated`); backend, crons e n8n rodam com `BYPASSRLS` e são imunes. Cada lote entra com (a) mapa de uso no front já extraído mecanicamente, (b) prova numérica antes/depois em dados de produção dentro de transação revertida, e (c) script de rollback. Os únicos passos capazes de quebrar cliente em produção são os cinco da seção 5 — e todos dependem de o front ser publicado primeiro ou de janela combinada.

---

## Artefatos

| Arquivo | O que prova |
|---|---|
| `supabase/.temp/_safe_a_roles.sql` | `service_role`/`postgres` com `BYPASSRLS` |
| `supabase/.temp/_safe_b_owners.sql` | 139 tabelas e 233 funções SECDEF donas de `postgres` |
| `supabase/.temp/_safe_c_personas.sql` | personas reais para o arnês |
| `supabase/.temp/_safe_d_harness_groups.sql` | antes/depois do lote #4/#2/#7, terminando em `rollback` |
| `supabase/.temp/_safe_e_rollback_check.sql` | nada persistiu |
| `supabase/.temp/_safe_f_selects.mjs` | 142 `.from()` / 22 `select("*")` nas tabelas com segredo |
| `supabase/.temp/_front_surface.json` | 96 tabelas + 65 RPCs que o front usa |
| `docs/reports/2026-09-22_auditoria_rls_completa.md` | as 13 falhas, ordenadas por gravidade |
