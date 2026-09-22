# Estado atual da correção de segurança / RLS — Clinbia

Documento de retomada. Fechado em **22/09/2026**, ao encerrar a primeira etapa do
"Plano de correção definitiva de segurança".

Fontes da verdade que acompanham este arquivo:

- `docs/reports/2026-09-22_auditoria_rls_completa.md` (commit `332f7fd`) — as 13 falhas, de `#0` a `#12`.
- `docs/reports/2026-09-22_garantia_nao_impacto.md` (commit `76f1fd0`) — provas de que o backend não é
  alcançado por mudança de policy.
- `docs/reports/2026-09-22_incidente_storage_exposicao_publica.md` — incidente do Storage (Fase 6).
- `supabase/tests/security/` — arnês e monitoramento versionados (ver `README.md` de lá).

Regra de execução do user, válida para tudo daqui pra frente: **nada vai para produção sem
(a) mapa de quem usa o objeto no front / edge functions / n8n, (b) teste automatizado de acesso
antes e depois, (c) script de rollback pronto.** E: *nenhuma mudança que quebre o sistema; se for
afetar produção, avisar antes.*

---

## 1. Aplicado em produção

Todas as migrations abaixo foram aplicadas com `npx supabase db query --linked --file` (o
`db push` não funciona neste projeto: o histórico divergiu). Todas têm `_rollback.sql` ao lado.

| # | Item do plano | Migration | Commit | Data (UTC) | Verificação |
|---|---|---|---|---|---|
| 1 | 0.1 — RPC destrutiva aberta ao anon (`cleanup_team_member_data`) | `20260922150000_fase0_1_revoke_cleanup_team_member_data.sql` | `58ec4a5` | 22/09 | arnês da fase 0 |
| 2 | 0.2 lote 1 — isolamento de `groups`, `group_members`, `appointment_confirmation_sessions`, `response_times` (#4, #2, #7) | `20260922151000_fase0_lote1_isolamento_groups_acs_response_times.sql` | `58ec4a5` | 22/09 13:29Z | `fase_0/` — vazamento 230→0, 3980→0, 255→0, 155141→0; tenant próprio intacto; anon 0 |
| 3 | Fase 3 (parte) — RPC `admin_get_support_profiles(uuid[])` para tirar o `select("*")` de `profiles` do front | `20260922153000_fase3_rpc_admin_get_support_profiles.sql` | `6d681f3` | 22/09 | super-admin 3/3, tenant comum 0, anon sem EXECUTE |
| 4 | Item 2 — escopo de tenant em `storage.objects` (45 policies abertas → 4 por tenant) | `20260922200000_storage_objects_tenant_scope.sql` | `a8c9b0b` | 22/09 ~15:45Z | anon 0/215, A↔B 0, 7 escritas cruzadas 42501, 13 próprias OK, 3 URLs públicas seguem 200 |
| 5 | 0.5 — escalonamento a super-admin pelo UPDATE da própria linha de `profiles` | `20260922220000_profiles_revoke_privilege_columns.sql` | `0dce094` | 22/09 ~16:30Z | `item_0_5_profiles_update/` — 5 ataques 42501, 6 caminhos legítimos OK |
| 6 | 0.5b — o mesmo escalonamento via DELETE + INSERT da própria linha | `20260922240000_profiles_lock_insert_delete.sql` | `a9befde` | 22/09 ~16:50Z | `item_0_5b_profiles_insert_delete/` — 4 ataques 42501, upsert do `updateCompany` OK |
| 7 | **Lote 0.3** — RLS de `#3` (backup de contatos e auditoria de split), `#6` (`opportunities`, `notifications`), `#11` (`dados_atendimento`, `team_costs`, `_reminder_log`), `#12` (`llm_model_prices`) | `20260922210000_lote_0_3_rls.sql` | `d97e593` | 22/09 ~17:30Z | `lote_0_3/verify.sql` (abaixo) |
| 8 | **Fase 1** — super admin passa a ser `public.admin_users`, e a tabela deixa de ser escrivível pelo navegador | `20260922230000_super_admin_via_admin_users.sql` | `f5cf213` + `0432d77` | 22/09 ~17:30Z | `fase_1_admin_users/verify.sql` (abaixo) |
| 9 | **0.4** — `send_push_notification` deixa de ter EXECUTE para PUBLIC/anon/authenticated | `20260922260000_send_push_notification_revoke.sql` | `67feae7` | 22/09 ~17:30Z | `item_0_4/verify.sql` (abaixo) |
| 10 | **Colunas de segredo de `profiles`** (chave/projeto OpenAI do cliente legível por qualquer logado) | `20260922133000_profiles_revoke_secret_columns.sql` | `d16ebfe` | 22/09 | `revoke select on profiles` + `grant select (47 colunas)`; margem e segredos fora do grant |
| 11 | **financial_access** só pelo servidor (RPC `set_financial_access`) | `20260922250000_financial_access_rpc.sql` | `d16ebfe` | 22/09 | toggle de Configurações OK; `update (financial_access)` revogado de `authenticated` |
| 12 | **Item 2 (leitura)** — `profiles` deixa de ser legível por TODO logado (`using (true)`) e passa a ser escopada por tenant | `20260922290000_profiles_select_por_tenant.sql` | `161c8d6` | 22/09 ~19:10Z | `item_0_6_profiles_select/verify.sql` + conferência na tela com sessão real de colaborador (abaixo) |

### 1.1 O que cada um dos três últimos fechou

**Lote 0.3** (`lote_0_3/verify.sql`, roda contra o estado real e termina em `rollback`):

- schema `private` criado (USAGE só para `service_role`); `contacts_merge_backup_20260901` e
  `crm_client_channel_split_audit` movidos para lá, com RLS ligada e **zero** grant de front.
  Antes: `anon` lia 144 linhas do backup de contatos (137 de OUTRO tenant) e 177 da auditoria.
- `public._reminder_log` com RLS ligada e revoke (0 linhas hoje).
- `opportunities`: 4 policies cegas → `opportunities_all` com `user_id = public.get_owner_id()`.
  Antes o tenant A **lia e alterava** as 15 oportunidades de B (o UPDATE afetava 15 linhas).
- `notifications`: `notifications_insert` era `with check (true)` ⇒ qualquer logado forjava
  notificação na conta de outro. Agora `with check (user_id = public.get_owner_id())`.
- `dados_atendimento` (3 policies → 1 por tenant) e `team_costs` (drop de
  `"Staff can view all team costs"`).
- `llm_model_prices`: leitura do **custo do provedor** passa a exigir `public.is_admin_staff()`.
- Pós-apply: 4 ataques + `anon` bloqueados em 42501, leituras legítimas intactas,
  `service_role` ainda lendo 144 linhas do backup e 8 preços.

**Fase 1** (`fase_1_admin_users/verify.sql`):

- `admin_users.is_super_admin` criada, super admin atual semeado (a migration **aborta** se não
  semear nenhum ativo), `public.is_super_admin()` reescrita para ler `admin_users` —
  **não lê mais `profiles.role`**.
- Repontados: 4 policies (`pending_signups`, `system_updates`, `token_monthly_history`,
  `token_usage_log`), a policy de INSERT do bucket `media`, e os 3 RPCs que liam
  `profiles.role` do CHAMADOR (`admin_get_pending_profiles`, `admin_get_inactive_profiles`,
  `admin_get_team_members`).
- `revoke all on admin_users from anon` + `revoke insert, update, delete, truncate ... from
  authenticated` (o painel só faz SELECT; criar/editar/desativar vai pela edge fn
  `admin-create-user` em service_role).
- Pós-apply: 1 super admin ativo; `is_super_admin()` true para o SA e false para tenant;
  os 3 RPCs respondem para o SA (pending 4, team members 4) e dão `P0001` para tenant;
  tenant lê 0 linhas de `admin_users`, `anon` toma 42501; **8 de 8 ataques de escrita
  (INSERT com `is_super_admin=true`, UPDATE de `is_super_admin`, DELETE do super admin,
  UPDATE de `is_active`) em 42501 nas duas personas**.
- `profiles.role='super-admin'` **mantém o valor** (só deixa de valer), então `AdminAuth.tsx` e
  `useAdminUser.ts` seguem funcionando sem republicar o front. Trocar essas checagens é follow-up.
- Consequência aceita: **criar super admin novo agora exige migration deliberada.**

**0.4** (`item_0_4/verify.sql`):

- `send_push_notification(uuid,text,text,text,text,text)` é SECURITY DEFINER e tinha EXECUTE para
  **PUBLIC, anon, authenticated**. Chamadores: **zero** no banco (nenhum `prosrc`, nenhum trigger),
  zero no repo (o único `PERFORM` está no bloco comentado da própria
  `20251217_add_push_notification_helper.sql`), zero em `src/` e nas edge functions.
- As GUCs `app.settings.supabase_url` e `app.settings.service_role_key` **não estão configuradas**
  ⇒ hoje a função é no-op (o `exception when others` engole a falha do `http_post`). Bastava
  configurar as GUCs para virar phishing in-app disparado por anônimo.
- Correção: revoke de public/anon/authenticated, **sem drop**, `service_role` mantido.
  Pós-apply: EXECUTE só para `postgres` e `service_role`; anon e authenticated em 42501;
  `service_role` executa.
- Divergência real encontrada e **não corrigida**: o banco tem `search_path=public` e a migration
  do repo declara `public, extensions`.

**Item 2 / leitura de `profiles`** (`item_0_6_profiles_select/`):

- O furo: `policy "Users can view all profiles" | SELECT | authenticated | using (true)`. As 6
  policies de `profiles` são OR, então `profiles_all` (`id = auth.uid()`) **não restringia nada**.
  Medido no arnês: TODA persona — dono, colaborador, dono de outro tenant e até **conta criada
  segundos antes** — via as 10 linhas com e-mail, empresa, telefone, role, status, `tokens_total`,
  `approximate_cost_total`, `audio_cost_*`, `financial_access` e os metadados do projeto OpenAI.
- Policy nova: `using (id = auth.uid() or id = public.get_owner_id() or public.is_super_admin())`,
  mais `revoke select on profiles from anon` (o grant de 47 colunas do `anon` era inerte, mas
  existia).
- `get_owner_id()` na policy é **obrigatório**: colaborador NÃO tem linha própria em `profiles`
  (12/12 membros da PELE com `auth_user_id` não têm profile) e 7 pontos do front leem a linha do
  **DONO** por `ownerId`. Policy só de `id = auth.uid()` esvaziaria Configurações para todo
  colaborador.
- Nada precisou virar RPC: o painel admin já ia por `admin_get_*_profiles` (SECURITY DEFINER com
  guard) + edge fn `admin-get-avatars`; as 25 edge functions que tocam `profiles` usam
  `service_role` (não passam por RLS); das 25 funções do banco que leem `profiles`, 24 são SECURITY
  DEFINER e a única INVOKER (`get_profile_name`) está sem chamadores.
- Pós-apply: dono / colaborador / outro tenant / conta nova = **1 linha**; super admin = 10;
  `anon` = 42501; `service_role` = 10.
- **Conferência na tela pela rota real do navegador** (sessão de colaborador criada por
  `generate_link` + `/auth/v1/verify`, sem enviar e-mail, descartada no fim), agente ADRIELLY e
  supervisora DAYANA da PELE: Configurações>Empresa, Minha Conta, Recorrência, Branding do
  orçamento e AutoCloseSettings **todas com dados**. Isolamento: listar `profiles` devolve só a
  linha do dono; pedir outro tenant devolve `[]`; pedir `markup` devolve 42501. Rollback não foi
  necessário.

### 1.2 Monitoramento

Depois dos três applies, nas duas janelas:

```
bash supabase/tests/security/monitor/monitor_42501.sh 1      -> {"result":[]}
bash supabase/tests/security/monitor/monitor_storage_rls.sh 1 -> {"result":[]}
```

Zero `42501` / `permission denied` / `new row violates row-level security` de tráfego real.
A janela de 3h que cobriu todo o lote do Storage (item 2) também voltou vazia.

Monitor específico da leitura de `profiles`:

```
bash supabase/tests/security/monitor/monitor_profiles_select.sh 1
```

Dois sinais: (1) `permission denied` em `profiles` nos `postgres_logs` — esperado só quando alguém
pede coluna sem grant (margem/segredo); (2) status de `GET /rest/v1/profiles` nos `edge_logs` — o
sinal de regressão é **200 com corpo vazio** (tela que ficou vazia). Baseline medida: os **406**
dessa rota são pré-existentes (semântica do PostgREST para `.single()`/`.maybeSingle()` sem linha
única) — janela de 6h ANTES do apply deu `406×1095 / 200×948`, proporção comparável à de depois, ou
seja não é efeito da policy. Os únicos `permission denied` e HTTP 403 da janela foram as sondas de
blindagem da própria verificação.

### 1.3 Faxina aprovada pelo user

- Conta de teste da auditoria removida: `audit_sec_1789741978_164123@gmail.com` /
  `52943194-5253-4dca-8c73-ad4d15af8274`. Era self-tenant criado em 18/09 com **só linhas de
  semente** (49). Removida via `admin_delete_tenant_data(uuid, false)` + delete em `profiles` e
  `auth.users`. `profiles` caiu de 9 para 8 linhas.
- `meta-review@clinbia.ai` **fica** (decisão do user). Correção de um erro de relatório anterior:
  não é linha de `profiles`, é **colaborador em `team_members`** (`7f75aca7-…`) do tenant
  `3e21175c-b183-4041-b375-eacb292e8d41`.

---

## 2. Pronto e NÃO aplicado (esperando o user)

Nenhuma migration de segurança está mais nessa fila: as duas que estavam travadas em publicação de
front (`20260922133000` colunas de segredo e `20260922250000` financial_access) foram aplicadas em
22/09 e estão na tabela da seção 1 (linhas 10 e 11).

Já commitado e **aguardando publicação do front**, sem migration atrelada:

- `752f97f` — helper único `conversationMediaPath()` em `src/lib/fileTypes.ts` (+ teste). Corrige
  `DealConversationModal`, que apontava para o bucket `chat-media` (**inexistente** — o do chat
  interno é `chat_media`) ⇒ todo anexo de conversa no card do CRM falhava desde sempre.
- `6d681f3` — 22 trocas de `select("*")` por colunas explícitas + `src/lib/dbColumns.ts`.
  Efeito colateral visível: o selo do atendente em `ContactDetailsDialog` volta a aparecer (lia
  `profiles`, que não tem coluna `name`; `assigned_agent_id` é FK de `team_members`).

---

## 3. Não iniciado — ordem combinada para retomar

### Lote (a) — tirar a `apikey` da UAZAPI do navegador
6 queries alimentam 8 chamadas navegador→UAZAPI: `ChatArea.tsx:539/553/579`,
`GroupInfoModal.tsx:74` (por prop), `useFetchProfilePictures.ts:102/132`, `NewMessageModal.tsx:304`,
`IAConfig.tsx:535`, `WhatsAppImportModal.tsx:82`. Mais 2 pontos pedem `apikey` explicitamente
(`WhatsAppImportModal.tsx:42`, `IAConfig.tsx:171`).
Armadilha mapeada: **queryKey compartilhada** — `["connected-instances"]` serve
ForwardMessageModal + NewMessageModal + InstanceSelectorModal, e quem monta primeiro define a
queryFn das três; mesma coisa em `["instances"]` / `["instagram-instances"]`.
Só depois disso o revoke das colunas de segredo de `instances` / `instagram_instances` /
`professional_google_calendars` / `team_members` (14 + 5 + 1 + 2 `select("*")`) pode entrar.

### Lote (b) — signed URLs e os buckets públicos
**Os 16 buckets são `public=true`**; `media` tem 72.754 objetos; as URLs públicas estão
**persistidas em colunas** (`messages.media_url`, `contacts.profile_pic_url`, `client_documents`,
`deal-attachments`) e são baixadas pela Meta/UAZAPI no envio de mídia e pelo n8n (`api-get-media`).
Trocar os 20 `getPublicUrl` por `createSignedUrl` **quebra mídia salva e envio** ⇒ precisa de lote
próprio, com front publicado antes.
Pendência dentro deste lote: **1.512 objetos de `media` não são atribuíveis a tenant pelo path**
(1.367 em `media/meta-pending-<fone>/`, 137 na raiz, 8 outros). Hoje ficam invisíveis para
`authenticated` na RLS, mas o chat os lê por URL pública, que não passa por policy — e
`media/meta-pending-<fone>/` **expõe o telefone do paciente no nome da pasta**.
`company-branding` é público de propósito (`?v=ts` no cabeçalho do orçamento) e não tem dado de
paciente.

### Fase 2 — tabela por tabela
O que sobrou da auditoria fora dos lotes já fechados. Regra: uma tabela por vez, com arnês antes/
depois. Lembrar que `copilot` tem RLS on e **zero policies** ⇒ já devolve vazio hoje
(pré-existente, não é regressão).

Dois resíduos de `profiles` registrados pelo user para entrarem aqui (decisão dele, nesta passagem
**não** foram tocados):

1. Limpeza cosmética das 3 policies redundantes de UPDATE (`Users can update own profile` ×
   `Users can update their own profile` × `profiles_all`) e da `Allow anonymous signup insert`,
   que é inerte (`anon` não tem grant de INSERT em coluna nenhuma).
2. Proposta a trazer: colaborador precisa mesmo enxergar `tokens_total`,
   `approximate_cost_total` e `audio_cost_*` da linha do dono, ou essas colunas deveriam ficar só
   para o dono e o super admin? Medido hoje: um agente lê `tokens_total = 248.198.430` e
   `approximate_cost_total = 171,48` da PELE.

### Rotação de segredos
Inclui `SCHEDULING_API_KEY`. **Derruba todas as `api-*` do n8n no ato** ⇒ exige janela com aceite
de chave antiga + nova em paralelo.

### `verify_jwt` nas edge functions
Levantar quais funções estão com `verify_jwt = false` sem precisar, e fechar.

### Suíte de testes no repositório
Transformar o arnês de `supabase/tests/security/` em execução repetível (hoje é um conjunto de
scripts rodados à mão). Já está versionado e sem segredo.

### `alter default privileges ... revoke all` + check de CI
Tabela nova passa a nascer invisível para o front ⇒ só junto com o check de CI e a regra no
CLAUDE.md (a regra já está lá, ver seção 4).

### Log de auditoria
Registrar quem leu/alterou o quê nas tabelas sensíveis.

### Revisão das demais camadas
Edge functions, n8n, webhooks e crons — a auditoria cobriu `public` e `storage`.

### Decisões já tomadas que mudam o plano original do user
- **0.6 "desabilitar signup público": NÃO desabilitar.** O auto-cadastro está vivo
  (`Auth.tsx` → `pending_signups` → edge fn `signup-confirm`). Só endurecer as policies.
- **0.7 "buckets privados"**: quebra toda imagem por URL pública ⇒ virou o lote (b).

---

## 4. Regras que passaram a valer para todo código novo

Registradas também no `CLAUDE.md` do projeto:

1. **Nenhuma policy `using (true)`** (nem `with check (true)`) para `anon`/`authenticated`.
   Toda tabela de tenant ancora em `public.get_owner_id()`.
2. **Segredo nunca em coluna legível pelo front.** Chave/token só sai por edge function, e
   mascarado quando for exibição.
3. **Toda RPC SECURITY DEFINER com checagem de tenant no corpo e `search_path` fixo.**
4. **Super admin é `public.admin_users`** (`is_super_admin`/`is_active`), não `profiles.role`.
5. `revoke` de coluna só funciona **depois** do `revoke` de tabela (ver pitfalls abaixo).

---

## 5. Fatos técnicos comprovados (não reinvestigar)

- **`service_role` e `postgres` têm `rolbypassrls=true`; `anon`/`authenticated` não.** Toda edge
  function, cron, webhook e API do n8n usa service key ⇒ **nenhuma mudança de policy alcança o
  backend**. `BYPASSRLS` também vence `force row level security`.
- **139 tabelas e 233 funções SECURITY DEFINER são todas do dono `postgres`** (com bypass) ⇒
  `revoke execute ... from authenticated` numa RPC não afeta chamada interna de trigger ou de
  outra função; só fecha a chamada direta do navegador.
- **Toda tabela em `public` tem grant default para `anon` E `authenticated`** (padrão Supabase) ⇒
  a policy é o único portão; `using (true)` com `roles = public` é alcançável com a anon key do
  bundle, **sem login**.
- Policies permissivas fazem OR; RESTRICTIVE fazem AND (`conversations`/`queues` só parecem
  furadas porque o escopo de agente é RESTRICTIVE).
- `is_staff()` = `exists (select 1 from profiles where id = auth.uid())` ⇒ **todo dono de conta é
  "staff"**; `is_admin()/is_supervisor()/is_agent()` não filtram tenant. Ainda não corrigido.
- **`revoke <priv> (coluna) on tabela from role` é silenciosamente inócuo** enquanto existir o
  `grant <priv> on tabela to role`. Ordem correta: `revoke <priv> on <tabela> from <role>` e
  **depois** `grant <priv> (<colunas permitidas>) on <tabela> to <role>`.
  `information_schema.column_privileges` lista todas as colunas justamente por isso — **não serve
  de prova**.
- **RLS não gera erro em UPDATE/DELETE**: sem policy permissiva casando, a instrução afeta
  **0 linhas** e retorna sucesso. Só INSERT / `with check` levanta `42501`. Para exigir 42501 em
  UPDATE/DELETE, a trava tem de ser **privilégio (grant)**, não policy.
- **"Bloqueado" não é prova** — conferir o `sqlerrm`. Dois casos do 0.5b pareciam seguros e o
  bloqueio vinha da RLS de `revenue_categories` dentro do trigger
  `on_profile_created_add_financial_categories`: proteção acidental, que sumiria se aquela policy
  mudasse.
- Chamar função sem EXECUTE **aborta a transação inteira** (42501) ⇒ testar com
  `has_function_privilege('anon', p.oid, 'EXECUTE')`, nunca chamando.
- `pg_get_functiondef()` estoura `42809` ao cruzar agregados ⇒ filtrar `p.prokind in ('f','p')`
  ou usar `p.prosrc`.
- `pg_stat_user_tables.n_live_tup` mente sem `ANALYZE` ⇒ sempre `count(*)`.
- `npx supabase db query --linked` roda como **`postgres`**, não como `service_role`.
- `supabase db push` **falha** neste projeto (histórico divergido) ⇒ aplicar com `db query --file`.
- SQL inline começando com `--` quebra o parse de argumento do CLI ⇒ sempre `--file`.
- A ordem das chaves no JSON do `supabase db query` **não** é a ordem do `SELECT` ⇒ emitir uma
  única coluna de texto chamada `info`.
- `src/integrations/supabase/types.ts` é **vazio de propósito** ⇒ conferir colunas reais em
  `information_schema` antes de escrever qualquer probe (custou um `42703` em `notifications`).
- Personas reais do arnês: A = PELE DERMATOLOGIA `e697878e-29c9-4b7e-88bb-869f4f2c76af`
  (7112 contatos), B = Clínica Auto Estima `06dfdd91-9fcd-4737-aa5b-08df0549f77a` (1687).
  Super admin: `23da6832-ca42-4d5b-a59b-1aad8a6f3964`.
- `supabase/.temp/_front_surface.json` = **96 tabelas + 65 RPCs** que o navegador toca.
  **Zero uso no front** (mudar é invisível): `appointment_confirmation_sessions`, `response_times`,
  `team_costs`, `dados_atendimento`, `llm_model_prices`, `contacts_merge_backup_20260901`,
  `crm_client_channel_split_audit`, `_reminder_log`.
  **3 RPCs que o front chama e não podem levar revoke** (precisam de guard no corpo):
  `create_default_crm_funnels`, `count_future_appointments`, `get_last_inbound_timestamps`.

---

## 6. Resíduos conhecidos

- `profiles.role` continua com `'super-admin'` gravado (inerte). As checagens de front
  (`AdminAuth.tsx`, `useAdminUser.ts`) ainda leem esse valor antes de `admin_users` — trocar é
  follow-up, e até lá não se pode limpar a coluna.
- `send_push_notification`: divergência de `search_path` entre banco (`public`) e repo
  (`public, extensions`).
- `is_staff()` e amigos sem filtro de tenant (item da Fase 2).
- `copilot`: RLS on, zero policies.
