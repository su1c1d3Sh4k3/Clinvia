# Plano de implementação — Campanhas: congelamento de Estágio/Atendente, barra de resize e novos cards

Data: 2026-08-14 · Status: **AGUARDANDO RESPOSTAS — nenhum código alterado**

## 1. Como funciona hoje (leitura completa realizada)

### Tabela `campaign_contacts` (colunas atuais)
`id, campaign_id, user_id, contact_id, raw_data, status, error, sent_at, picked_at, message_id, created_at, message_status`
- `status`: pending | sending | sent | failed | invalid | skipped (status de **envio**)
- `message_status`: snapshot de entrega (delivered/read/failed) mantido por trigger (423f505)

### Colunas da tabela de contatos (CampaignContactsTable.tsx — compartilhada dash + /campanhas)
| Coluna | Fonte | Comportamento |
|---|---|---|
| Status | `cc.status` + refino por `message_status` (Enviada/Entregue/Rejeitada) | persistido |
| Respondida | RPC `get_campaign_contact_responses` | calculado ao vivo |
| Agendamento | RPC `get_campaign_contact_appointments` (appointment `created_at > sent_at`, cancelados contam) → badge Agendado/Pendente | calculado ao vivo |
| Estágio | RPC `get_campaign_contact_crm_info` → card **ativo** de `crm_client` | **AO VIVO** (muda quando o ticket muda) |
| Atendente | mesma RPC → fila 'Atendimento IA' → "IA", senão `team_members.name` da conversa open/pending mais recente | **AO VIVO** (some quando a conversa é resolvida — LEFT JOIN só pega open/pending) |

### Cards de resultado (CampaignCard.tsx:259 e CampaignExpandableCard.tsx:~170)
Grid `grid-cols-2 md:grid-cols-4`: enviadas / entregues / rejeitadas / respondidas — fonte RPC `get_campaign_dashboard_stats` (já tem `converted_count` calculado mas **não exibido**: appointments entre scheduled_at e valid_until).

### Scroll da tabela
`CampaignContactsTable.tsx:236` → `<div className="max-h-64 overflow-y-auto overflow-x-auto">` (altura fixa 16rem).

### Fatos críticos descobertos
1. **`appointments` NÃO tem coluna de autor** (`created_by` não existe). Não há como saber hoje *quem* criou um agendamento. Pontos de criação: AppointmentModal (humano logado), `api-scheduling` (IA/n8n), `api-public-booking` (o próprio cliente pelo link), importação de planilha, Google Calendar webhook.
2. **`conversations` NÃO tem `resolved_by`** — só `resolved_at` e `assigned_agent_id`. Resolução acontece em: useUpdateTicketStatus (humano no inbox), trigger `crm_terminal_resolve_tickets` (mover card p/ estágio terminal), cron de confirmação, api-crm.
3. Estágio/Atendente são 100% calculados ao vivo — **congelar exige colunas persistidas** em `campaign_contacts`.

## 2. Proposta de implementação

### 2.1 Migration
```sql
ALTER TABLE campaign_contacts
  ADD COLUMN frozen_stage  text,          -- 'Agendado' | 'Finalizado'
  ADD COLUMN frozen_agent  text,          -- nome congelado (ou 'IA')
  ADD COLUMN frozen_reason text,          -- 'scheduled' (verde) | 'resolved' (laranja)
  ADD COLUMN frozen_at     timestamptz;

ALTER TABLE appointments
  ADD COLUMN created_by uuid REFERENCES team_members(id),  -- humano
  ADD COLUMN created_via text;                             -- 'manual'|'ia'|'public_link'|'import'|'gcal'
```

### 2.2 Triggers (freeze automático no banco — funciona p/ qualquer origem)
- **`trg_campaign_freeze_on_appointment`** (AFTER INSERT em appointments, type='appointment'): localiza `campaign_contacts` do contato com `status='sent'`, `sent_at < NEW.created_at`, `frozen_stage IS NULL` → grava `frozen_stage='Agendado'`, `frozen_agent=<autor>`, `frozen_reason='scheduled'`.
- **`trg_campaign_freeze_on_resolve`** (AFTER UPDATE em conversations quando status→'resolved'): mesmas condições → `frozen_stage='Finalizado'`, `frozen_agent=<atendente da conversa ou 'IA'>`, `frozen_reason='resolved'`.
- Guard `frozen_stage IS NULL` garante o "fixado, não sofre mais alteração" (primeiro evento vence — ver pergunta Q3).

### 2.3 RPCs
- `get_campaign_contact_crm_info`: retorna também `frozen_stage/frozen_agent/frozen_reason`; front usa o congelado quando existir, senão o ao vivo (outras campanhas do mesmo contato sem freeze continuam ao vivo — atende o requisito "só naquela campanha").
- `get_campaign_dashboard_stats`: + `scheduled_count` (freeze ou mesmo critério da coluna Agendamento) e `resolved_count`.

### 2.4 Frontend
- **CampaignContactsTable**: Estágio congelado = badge fixa; Atendente `frozen_reason='scheduled'` → nome **verde** (`text-emerald-600 font-semibold`), `'resolved'` → **laranja** (`text-orange-500 font-semibold`); coluna Agendamento inalterada; filtros Estágio/Atendente passam a considerar o valor efetivo (congelado ou vivo).
- **Barra de resize** (item c): substituir `max-h-64` por altura em state (default 256px) + handle arrastável na base da tabela (`cursor-ns-resize`, GripHorizontal, min 160px / max ~70vh) — mouse + touch.
- **Cards** (item d): grid vira `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` nos DOIS cards (CampaignCard + CampaignExpandableCard): + "agendados" (verde) e "resolvidos" (laranja).
- `useCampaigns.ts` / `useCampaignDashboard.ts`: tipos + campos novos.
- Pontos de escrita de `created_by/created_via`: AppointmentModal, api-scheduling, api-public-booking, importAppointments, gcal-webhook.

### 2.5 Arquivos afetados
Migration nova + `campaign-dispatch` (nada), `api-scheduling`, `api-public-booking` (deploy), `src/components/campaigns/CampaignContactsTable.tsx`, `CampaignCard.tsx`, `dashboard/campanhas/CampaignExpandableCard.tsx`, `src/hooks/useCampaigns.ts`, `useCampaignDashboard.ts`, `src/components/scheduling/AppointmentModal.tsx`, `src/lib/importAppointments.ts`.

## 3. PERGUNTAS — responda antes de eu tocar em código

**Q1 — Coluna "Status Pendente→Agendado":** hoje a tabela tem DUAS colunas: **Status** (de envio: Pendente/Enviada/Entregue/Rejeitada) e **Agendamento** (badge Pendente/Agendado — que JÁ muda sozinha quando agenda). Você quer:
   a) manter como está (a coluna Agendamento já faz isso), ou
   b) que a coluna **Status** de envio também passe a mostrar "Agendado" (substituindo Entregue/Enviada)?

**Q2 — Quem é "o atendente que realizou o agendamento"?** `appointments` não registra autor. Vou criar `created_by/created_via`. O que congelar em cada origem?
   - Agendamento criado pela **IA** (n8n/api-scheduling) → congelar "IA"?
   - Cliente agenda sozinho pelo **link público** → congelar o quê? ("Cliente"? "Link público"?)
   - **Importação** de planilha / **Google Calendar** → contam? (sugestão: importação NÃO congela; GCal não tem contato, ignorado)
   - Agendamento manual na agenda → nome do team_member logado (óbvio).

**Q3 — Precedência entre os dois congelamentos:** se o contato **agenda** e depois a conversa é **resolvida** (ou o inverso), qual vale? Minha sugestão: **o primeiro evento congela em definitivo** (é o que "fixado" implica). Alternativa: Agendado sempre sobrepõe Finalizado (agendar é o objetivo da campanha). Qual regra?

**Q4 — Qual conversa dispara o "Finalizado"?** Qualquer conversa do contato resolvida após o envio? Ou apenas a conversa que recebeu a mensagem da campanha? (Sugestão: qualquer conversa do contato resolvida após `sent_at` — mais simples e cobre o caso normal.)

**Q5 — Resolvida pela IA:** conversa na fila Atendimento IA resolvida → congelar Atendente como "IA" em laranja?

**Q6 — Retroativo:** aplico backfill nas campanhas já disparadas (dá pra reconstruir Agendado via appointments `created_at > sent_at` — mas SEM autor, ficaria "—" verde; e Finalizado via `resolved_at`)? Ou congelamento só vale para eventos a partir do deploy?

**Q7 — Contato duplicado na mesma campanha** (permitido desde e616c7c): congela TODAS as entradas dele naquela campanha, correto?

**Q8 — Definição dos 2 cards novos:**
   - "agendados" = contatos com appointment após envio (mesmo critério da coluna Agendamento, cancelados contam)?
   - "resolvidos" = contatos congelados como Finalizado, ou TODOS os enviados com conversa resolvida (mesmo que depois tenham agendado)? Se um contato agendou E resolveu, conta nos dois cards?

**Q9 — Resize da tabela:** a altura escolhida deve ser lembrada (localStorage, vale p/ todas as campanhas) ou volta ao padrão a cada expandir?
