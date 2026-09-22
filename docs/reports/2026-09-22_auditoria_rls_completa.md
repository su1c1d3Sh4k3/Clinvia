# Auditoria de RLS e de funções SECURITY DEFINER — schema `public`

Data: 22/09/2026. Escopo pedido: toda tabela do `public` com RLS desligada ou com policy de
SELECT/UPDATE/DELETE que não filtra por usuário/tenant; funções SECURITY DEFINER expostas a
`anon`/`authenticated` que recebem um id arbitrário e devolvem dados de outro tenant; plano de
correção por tabela, ordenado por gravidade. **Nada foi aplicado.**

## Como a varredura foi feita

| Varredura | Arquivo | O que mediu |
|---|---|---|
| A | `supabase/.temp/_rls_a_secret_cols.sql` | colunas de credencial legíveis por anon/authenticated |
| B | `_rls_b_cred_policies.sql` | policies exatas das tabelas com credencial |
| C | `_rls_c_helpers.sql` | corpo de `is_admin`/`is_supervisor`/`get_owner_id`/... |
| D | `_rls_d_tabelas.sql` | inventário das 139 tabelas por estado de RLS |
| E | `_rls_e_abertas.sql` | tamanho e colunas das tabelas com RLS OFF + grant |
| F/G | `_rls_f_policies.sql`, `_rls_g_risco.sql` | classificação de todas as policies alcançáveis por anon/authenticated |
| H | `_rls_h_detalhe.sql` | PERMISSIVE × RESTRICTIVE das suspeitas |
| I | `_rls_i_grants.sql` | grants reais por tabela |
| J | `_rls_j_helpers2.sql` | corpo de `is_staff`/`is_agent`/`is_internal_chat_participant` |
| K | `_rls_k_volume.sql` | `count(*)` real (o `n_live_tup` mente sem ANALYZE) |
| L/M | `_rls_l_secdef.sql`, `_rls_m_corpos.sql` | SECURITY DEFINER executáveis por anon/authenticated |

Dois fatos que valem para tudo o que segue:

1. **Toda tabela do `public` tem `GRANT SELECT/INSERT/UPDATE/DELETE` para `anon` E
   `authenticated`** (padrão do Supabase). Logo a policy é o ÚNICO portão: policy permissiva
   com `USING (true)` e `roles = public` é acessível com a **chave anônima que está no bundle
   do front**, sem login.
2. **`is_admin()`, `is_supervisor()`, `is_agent()` e `is_staff()` NÃO filtram tenant.**
   `is_staff()` é o pior: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())` — ou seja,
   **todo dono de conta é "staff"**.

## Estado geral das tabelas (varredura D)

- **A) RLS OFF + grant para anon/authenticated — 3 tabelas** (itens #3, #6, #12 abaixo)
- **B) RLS OFF sem grant — 0**
- **C) RLS ligada sem nenhuma policy — 12 tabelas** → só `service_role` chega. **Seguras por
  desenho**, nenhuma ação: `audio_usage_log_phantom_archive`, `cache_ permanent_memory`,
  `conversation_summary_queue`, `conversation_view_logs`, `copilot`,
  `llm_cache_calibration`, `llm_platform_settings`, `llm_provider_usage_daily`,
  `openai_project_costs_daily`, `openai_project_usage_daily`, `openai_provision_queue`,
  `token_usage_log_phantom_archive`
- **D) RLS ligada com policy — 124 tabelas** → 102 corretamente ancoradas em
  `user_id = get_owner_id()`; as demais estão listadas abaixo

Confirmado SEGURO (colunas de credencial atrás de `user_id = get_owner_id()`):
`instances.apikey` / `instances.meta_access_token`, `instagram_instances.access_token`,
`professional_google_calendars.access_token`/`refresh_token`, `pending_signups.confirm_token`
(só super-admin lê).

---

# Plano de correção, ordenado por gravidade

## #0 — `cleanup_team_member_data(target_user_id uuid)` — DESTRUTIVA, ABERTA PARA `anon`

SECURITY DEFINER, `EXECUTE` concedido a **anon e authenticated**, sem nenhuma verificação:

```sql
UPDATE conversations SET assigned_agent_id = NULL WHERE assigned_agent_id = target_user_id;
DELETE FROM team_members WHERE auth_user_id = target_user_id;
DELETE FROM profiles     WHERE id = target_user_id;   -- apaga a conta
```

Qualquer pessoa com a chave anônima (que é pública, está no JS do app) pode apagar a linha de
`profiles` e de `team_members` de **qualquer** conta. Combinada com a policy
`profiles SELECT USING (true)`, os ids são obtidos em uma requisição.

- **Quem depende:** só a edge function `delete-team-member`, que chama com `service_role`
  (`supabaseAdmin`) — e `service_role` ignora GRANT de outros roles.
- **Correção:** `revoke execute on function public.cleanup_team_member_data(uuid) from anon, authenticated;`
- **Risco de aplicar:** nenhum. **Recomendo aplicar agora, isolado.**

## #1 — `profiles` — `"Users can view all profiles" USING (true)`

Já conhecido do item 1. 15 linhas: e-mail, `company_name`, `full_name`, acumuladores de custo e
token de todo tenant, legíveis por qualquer usuário logado. A migration `20260922133000` fecha as
**colunas de segredo**; a **linha** continua aberta.

- **Quem depende no front:** `ContactDetailsDialog.tsx:54` (lê `profiles.name` de outro usuário
  via `assigned_agent_id`), `useSupportInbox.ts:37` (`id, company_name, full_name, email` de uma
  lista de outros usuários), `useAdminUser.ts:45`, `AdminAuth.tsx:96,150`,
  `TokenUsageCharts.tsx` (painel admin).
- **Correção proposta:** trocar o `USING (true)` por
  `id = auth.uid() OR id = get_owner_id() OR is_admin_staff()`, e migrar os 2 usos legítimos
  cross-tenant para RPC/edge: o nome do agente em `ContactDetailsDialog` sai de `team_members`
  (já tem policy por empresa) e o `useSupportInbox` passa a usar uma RPC
  `support_inbox_profiles(uuid[])` com `is_admin_staff()` dentro.
- **Ordem:** depois de você publicar o front e eu aplicar `20260922133000`.

## #2 — `appointment_confirmation_sessions` — `ALL USING (true)` para `public` (inclui `anon`)

Policy `acs_service_role` é **PERMISSIVE**, `roles = public`, `USING true WITH CHECK true`, em
`cmd = ALL`. **9.925 linhas.** Qualquer um com a chave anônima lê, altera e **apaga** as sessões
de confirmação de agendamento de todos os tenants (contato, agendamento, conversa, fluxo).

- **Quem depende:** zero leitura no front (`grep` em `src/` não retorna nada). Os consumidores
  são `appointment-confirmation-cron` e `-respond`, com `service_role`.
- **Correção:** `drop policy "acs_service_role"` (o `service_role` não precisa de policy) e, se
  quiser manter leitura para o dono, criar `USING (user_id = get_owner_id())` — a tabela tem
  `user_id`.

## #3 — `contacts_merge_backup_20260901` — RLS DESLIGADA + grant para `anon`

169 linhas; a coluna `loser_row` é o **JSONB inteiro de cada contato deletado** na mesclagem
(nome, telefone, anotações, NPS). Legível com a chave pública, sem login.

- **Quem depende:** nada (tabela de backup de uma migração de 01/09).
- **Correção:** `alter table ... enable row level security;` sem policy (só `service_role`).

## #4 — `groups` e `group_members` — `SELECT USING (true)` para `public` + `UPDATE USING (true)`

249 grupos e **4.219 membros** de 8 contas diferentes. `group_members` tem `number`, `push_name`
e `profile_pic_url` — **telefones de pacientes**, legíveis por `anon`. E o `UPDATE USING (true)`
deixa qualquer usuário logado renomear/esconder/alterar grupo de outra clínica.

- **Quem depende:** `GroupInfoModal`, `group-member-pics`, aba Grupos do inbox — sempre dentro
  do próprio tenant. Ambas as tabelas têm `user_id`.
- **Correção:** trocar as 3 policies (`SELECT`, `UPDATE`, `INSERT`) por
  `user_id = get_owner_id()` (no INSERT, `WITH CHECK`).

## #5 — `team_members` — `ALL USING is_admin()` (cego a tenant)

`is_admin()` não filtra empresa. O admin de qualquer clínica faz SELECT, **UPDATE e DELETE** nas
linhas de `team_members` de todas as outras, incluindo `expo_push_token` e `fcm_device_token`.
Não é só leitura: é escrita e exclusão cross-tenant.

- **Quem depende:** `/equipe` (CRUD de membros), `usePermissions`, `useStaff`.
- **Correção:** `using (is_admin() AND user_id = get_my_owner_id())` — mesmo padrão que a policy
  de supervisor já usa corretamente. Opcionalmente revogar `select` das 2 colunas de push token
  para `authenticated` (só `usePushNotifications` escreve, via RPC `register_fcm_token`).

## #6 — `crm_client_channel_split_audit` — RLS DESLIGADA + grant para `anon`

177 linhas de `card_id, contact_id, user_id, instance_id, instagram_instance_id`. Não tem PII
direta, mas mapeia contatos e instâncias por tenant.

- **Quem depende:** nada (auditoria de migração).
- **Correção:** ligar RLS sem policy.

## #7 — `response_times` — `ALL USING (true)` para `authenticated`

**155.132 linhas.** A policy `System can manage response_times` é `ALL/true`: qualquer usuário
logado pode **apagar as métricas de tempo de resposta de todos os tenants**. O dado em si é
pouco sensível; o problema é o `DELETE`/`UPDATE` irrestrito.

- **Quem depende:** zero no front (`grep` em `src/` não retorna nada). Tabela não tem `user_id`.
- **Correção:** `drop policy "System can manage response_times"` +
  `drop policy "Authenticated users can view response_times"`; se algum relatório voltar a
  precisar, ler por RPC ancorada na conversa (`conversation_id`).

## #8 — 6 RPCs `admin_get_*` de custo/token — IDOR de dados financeiros

`admin_get_profile_tokens`, `admin_get_token_years`, `admin_get_token_usage_history`,
`admin_get_token_monthly_history`, `admin_get_cost_daily_history`, `admin_get_cost_monthly_history`.
Todas SECURITY DEFINER, `EXECUTE` para **anon e authenticated**, recebem `p_user_id` e filtram
apenas `WHERE p.id = p_user_id`. Passando o id de outra conta (obtido pelo #1), qualquer um lê o
consumo e o custo dela. É exatamente a base do sistema de revenda que estamos montando.

- **Quem depende:** `src/components/admin/TokenUsageCharts.tsx` (painel Super Admin).
- **Correção:** manter o `EXECUTE` e adicionar no corpo, na primeira linha,
  `if not is_admin_staff() then raise exception 'forbidden'; end if;` (o painel só é aberto por
  admin de plataforma, então nada quebra).

## #9 — RPCs de métrica com `p_owner`/`p_user_id` sem âncora — IDOR de dados da clínica

`get_appointment_metrics_for_owner`, `get_attendance_metrics_for_owner`,
`get_account_usage_report`, `get_avg_sentiment_score`, `compute_crm_stage_counts`,
`get_meta_usage_24h`, `get_professional_nps`(*), `get_satisfaction_dashboard`(*) — recebem o id do
dono e devolvem os números dele. `(*)` estas duas o corpo já tem alguma âncora; as outras não.

- **Quem depende:** dashboards do front passam `ownerId = useOwnerId()`; `get_account_usage_report`
  é só da `account-emails-cron` (service role).
- **Correção:** guarda no corpo — `if p_owner <> get_owner_id() and not is_admin_staff() then
  raise exception 'forbidden'; end if;` — e, na `get_account_usage_report`,
  `revoke execute from anon, authenticated`.

## #10 — RPCs de escrita/worker abertas a `anon`

| Função | O que dá para fazer | Quem chama de verdade |
|---|---|---|
| `track_token_usage` / `track_audio_usage` | inflar o consumo e o custo de qualquer conta (grava em `token_usage_log` e soma em `profiles`) | `_shared/token-tracker.ts` (service role) |
| `send_push_notification(p_user_id, título, corpo, url)` | push com texto e link arbitrários para os dispositivos de qualquer conta (phishing dentro do app) | triggers internos |
| `add_nps_entry(p_contact_id, ...)` | escrever nota/feedback de NPS em qualquer contato | `webhook-handle-message`, `appointment-confirmation-respond` (service role) |
| `pick_campaign_contacts`, `campaign_close_entries`, `monitoring_register_match` | mexer no estado de campanha de qualquer tenant | crons (service role) |
| `claim_conversation_summaries`, `finish_conversation_summary`, `fail_conversation_summary`, `apply_archived_message_status`, `recompute_resolved_head` | escrever resumo/status arbitrário | crons (service role) |
| `create_default_crm_funnels`, `create_default_queues_for_user` | criar funis/filas em qualquer conta | signup (service role) |
| `check_auth_email_exists(p_email)` | enumerar quais e-mails têm conta | `create-team-member` (service role) |
| `get_last_messages(uuid[])` | conteúdo da última mensagem de conversas cujo uuid seja conhecido | o front usa a **outra** RPC (`get_last_messages_for_conversations`) |
| `cleanup_team_member_data` | ver #0 | `delete-team-member` (service role) |

- **Correção:** `revoke execute ... from anon, authenticated` em todas — nenhuma é chamada pelo
  front. Exceção a verificar antes: `send_push_notification` é invocada por triggers; se o
  trigger for SECURITY DEFINER com owner `postgres`, o revoke não o afeta (confirmar caso a caso
  antes de aplicar).

## #11 — `team_costs` — `SELECT USING is_staff()`

`is_staff()` inclui "existe linha em `profiles` com meu id" → qualquer dono de conta lê os custos
de equipe de todos os tenants. Hoje a tabela tem **0 linhas**, então o impacto prático é nulo — mas
a policy fica armada para quando o recurso for usado.

- **Correção:** `drop policy "Staff can view all team costs"` (a policy `team_costs_all` com
  `user_id = get_owner_id()` já cobre o uso legítimo).

## #12 — Menores / aceitáveis

| Tabela / objeto | Situação | Ação |
|---|---|---|
| `opportunities` | `is_admin() OR is_supervisor()` cego a tenant, 17 linhas; `useOpportunities.ts` é **código morto** (nenhum componente em `src/` o importa) | deletar o hook e fechar a tabela, ou ancorar em `user_id` |
| `notifications` | `INSERT WITH CHECK (true)`, 23.719 linhas; o SELECT é ancorado. Dá para forjar notificação para qualquer conta | `WITH CHECK (user_id = get_owner_id())` |
| `dados_atendimento` | `SELECT USING (true)`, **0 linhas**, sem uso no front | ancorar em `user_id` ou dropar a tabela |
| `_reminder_log` | RLS OFF + anon, 0 linhas | ligar RLS sem policy |
| `llm_model_prices` | `SELECT true` para `authenticated`: expõe o preço de custo do provedor, que é a base do nosso markup | restringir a `is_admin_staff()` |
| `service_catalog_*`, `service_applications`, `system_updates`, `login_design` | catálogo/global, leitura pública **intencional** | nenhuma |
| `conversations`, `queues`, `internal_*` | caíram na classificação por usarem RESTRICTIVE ou helper próprio; verificados **corretos** (`conversations_all` ancora em `get_owner_id()`; `inserir_participantes` exige `internal_chats.user_id` do próprio tenant) | nenhuma |

---

## Sequência sugerida

1. **#0 agora** (1 linha, sem dependência de front, risco zero).
2. Você publica o front → aplico `20260922133000` (revoke das colunas de segredo).
3. #2, #3, #4, #6, #7, #11, #12 — nenhuma tem dependência no front; uma migration só.
4. #5 (`team_members`) — precisa de teste em `/equipe` depois.
5. #8, #9, #10 — recriação das funções com guarda + revokes.
6. #1 (`profiles`) — exige as duas mudanças de front (`ContactDetailsDialog`, `useSupportInbox`).
