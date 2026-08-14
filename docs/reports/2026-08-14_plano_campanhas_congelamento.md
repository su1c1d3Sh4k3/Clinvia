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

---

# APÊNDICE (Etapa 2) — Exclusividade de campanha por instância, vencimento e congelamento total

Data: 2026-08-14 · Status: **AGUARDANDO RESPOSTAS D1-D5 abaixo**

## Novas regras definidas pelo usuário
1. Cliente ativo em UMA campanha por instância (jamais 2 na mesma instância). Usado em nova campanha da mesma instância → sai da antiga: Respondida fixa "Sem Resposta" (vermelho), Agendamento fixa "Não Agendou", Estágio fixa "Movido Para Outra Campanha", Atendente vazio; a tag da campanha antiga é trocada pela nova (1 tag de campanha ativa por vez, por instância).
2. Vencimento (valid_until): quem está com Respondida pendente → "Sem Resposta" fixo, Agendamento "Não Agendou", Estágio "Campanha Encerrada", Atendente vazio. Campanha vencida = todas as conversas finalizadas, relatório final congelado (não sofre mais alterações).
3. Lead pode estar em N campanhas se forem N instâncias diferentes (1 conversa + 1 tag por instância).
4. Reenviar campanha não vencida → campanha mãe é encerrada automaticamente e a nova abre.
5. Cards do cabeçalho: adicionar "Sem Resposta".

## Plano de implementação (consolidado com a Etapa 1)

### Schema (migration única)
```sql
ALTER TABLE campaign_contacts
  ADD COLUMN conversation_id uuid,       -- conversa que recebeu o template (gravada no disparo)
  ADD COLUMN frozen_at timestamptz,
  ADD COLUMN frozen_reason text,         -- 'scheduled'|'resolved'|'moved'|'expired'
  ADD COLUMN frozen_stage text,          -- Agendado|Finalizado|Movido Para Outra Campanha|Campanha Encerrada
  ADD COLUMN frozen_agent text,          -- nome | 'IA' | 'Usuário Indisponível' | NULL (vazio)
  ADD COLUMN frozen_responded boolean,   -- congela a coluna Respondida
  ADD COLUMN frozen_scheduled boolean;   -- congela a coluna Agendamento

ALTER TABLE appointments
  ADD COLUMN created_by uuid REFERENCES team_members(id),
  ADD COLUMN created_via text;           -- 'manual'|'ia'|'public_link'|'import'|'gcal'
```
Regra geral: entrada congelada (`frozen_at NOT NULL`) NUNCA é recongelada — o primeiro evento vence (agendou/finalizou/movido/vencido).

### Congelamentos (gatilhos)
- **Agendou** (trigger AFTER INSERT appointments): entradas sent não congeladas do contato → 'scheduled': Estágio "Agendado", Atendente verde (created_by → nome; senão "IA"), frozen_scheduled=true.
- **Finalizou** (trigger AFTER UPDATE conversations → resolved): entrada cuja conversation_id = conversa resolvida → 'resolved': Estágio "Finalizado", Atendente laranja (fila IA → "IA"), frozen_responded mantém valor real no momento.
- **Movido** (campaign-manage, na criação/edição de campanha da mesma instância): entradas ativas do contato em outra campanha da MESMA instância → 'moved': "Sem Resposta"/"Não Agendou"/"Movido Para Outra Campanha"/Atendente vazio + troca de tag. Entradas pending (nunca enviadas) são removidas.
- **Vencido** (cron campaign-expiry + encerramento da mãe no reenvio): entradas sent não congeladas → 'expired': "Campanha Encerrada", Atendente vazio, Respondida/Agendamento conforme D3; resolve das conversas da campanha (conversation_id) conforme D2.

### RPCs
- get_campaign_contact_crm_info → + frozen_* (front usa congelado quando existir)
- get_campaign_contact_responses / get_campaign_contact_appointments → respeitam frozen_responded/frozen_scheduled
- get_campaign_dashboard_stats → + scheduled_count, resolved_count, no_response_count

### Dispatch
- campaign-dispatch grava conversation_id na entrada ao enviar.

### Reenvio
- ResendCampaignDialog/campaign-manage: mãe não vencida → aplica rotina de vencimento na mãe (status expired + sweep) antes de criar a nova.

### Frontend
- CampaignContactsTable: Respondida = Sim (verde) | Sem Resposta (vermelho, fixo) | Pendente; Agendamento = Agendado | Não Agendou (fixo) | Pendente; Estágio com os 4 rótulos fixos; Atendente verde/laranja/vazio; filtros usam valor efetivo; barra de resize (sem persistência).
- Cards (CampaignCard + CampaignExpandableCard): enviadas / entregues / rejeitadas / respondidas / sem resposta / agendados / resolvidos.
- Backfill retroativo: Agendado/Finalizado com "Usuário Indisponível"; campanhas já expiradas → sweep 'expired'.

## Dúvidas da Etapa 2 (responder antes de codar)
- **D1** Momento do "Movido": na CRIAÇÃO da nova campanha (wizard salvou) ou só no DISPARO da nova? Se for na criação e a nova for cancelada antes de disparar, o congelamento da antiga permanece?
- **D2** Vencimento força resolve de TODAS as conversas da campanha, inclusive as que estão em atendimento humano ativo naquele momento?
- **D3** Quem RESPONDEU mas não agendou/finalizou até o vencimento: Respondida congela "Sim" (real) e só o Estágio vira "Campanha Encerrada"? Ou tudo vira "Sem Resposta"?
- **D4** Mesma lógica no "Movido": quem já respondeu na campanha antiga congela Respondida "Sim" ou força "Sem Resposta"?
- **D5** Campanha "ativa" p/ regra 1-por-instância = status scheduled/awaiting_template/dispatching/dispatched dentro da validade (cancelled/expired = inativa)?

---

# PLANO FINAL CONSOLIDADO (todas as dúvidas respondidas — 2026-08-14)

## Regras de negócio fechadas
1. **Janela ativa da campanha**: `scheduled_at - 1h` até `valid_until`.
2. **Exclusividade**: 1 campanha ativa por contato POR INSTÂNCIA. Nova campanha na mesma instância derruba a antiga em T-1h do início da nova: entradas não congeladas → 'moved' ("Movido Para Outra Campanha", Não Agendou, Sem Resposta se nunca respondeu, atendente vazio), tag antiga trocada pela nova, conversa pending da antiga resolvida. Entradas pending (nunca enviadas) da antiga são removidas. Wizard avisa: "X clientes desta campanha estão atribuídos a outra campanha — 1h antes do início eles serão encerrados da campanha anterior."
3. **Atendimento aberto é intocável**: conversa status 'open' nunca é resolvida à força nem movida. Na campanha NOVA o contato entra com status "Atendimento Em Aberto" (novo status de campaign_contacts, sem envio, demais colunas vazias). Gate verificado no disparo.
4. **Vencimento** (cron): entradas sent não congeladas e SEM conversa aberta → 'expired' ("Campanha Encerrada", Não Agendou, Sem Resposta se não respondeu, atendente vazio) + resolve das conversas pending da campanha. Entradas com conversa ABERTA ficam ao vivo até o desfecho da conversa (F2=b) — congelam depois por 'scheduled'/'resolved' normalmente; relatório fecha 100% quando a última conversa aberta termina.
5. **Reenvio de campanha não vencida**: campanha mãe é encerrada (mesma rotina do vencimento) antes de criar a nova.
6. **Respondida**: congela "Sim" no momento da resposta ao template (nunca reverte); "Sem Resposta" (vermelho) só no fechamento (moved/expired) de quem nunca respondeu.
7. **Agendamento vinculado a campanha** (`appointments.campaign_id`):
   - Manual (AppointmentModal): contato com tag de campanha ativa → seleção de tag OBRIGATÓRIA (1 tag = default; 2+ = escolher).
   - IA (api-scheduling): novo campo `instance` → resolve campanha ativa do contato naquela instância.
   - Link público: payload do link ganha `instance_id` (assinatura da instância da conversa); api-public-booking resolve campanha + o catálogo passa a incluir os serviços da campanha (campaigns.services) além das regras atuais; link legado sem instance_id = comportamento atual, sem vínculo.
   - Importação de planilha e GCal: NÃO vinculam campanha.
   - Congela 'scheduled' SÓ na campanha vinculada ("Agendado", atendente verde: team_member se manual, senão "IA"; frozen_scheduled=true). Agendamento sem campanha vinculada não congela nada.
8. **Finalizou**: resolve da conversa que recebeu o template (campaign_contacts.conversation_id, gravado no disparo) → 'resolved' ("Finalizado", atendente laranja; fila IA → "IA").
9. **Primeiro congelamento vence, sempre** (scheduled/resolved/moved/expired).
10. **Backfill retroativo**: Agendado/Finalizado com atendente "Usuário Indisponível"; campanhas já expiradas → sweep 'expired'.
11. **Cards** (dash + /campanhas): enviadas / entregues / rejeitadas / respondidas / sem resposta / agendados / resolvidos.
12. **Tabela**: barra de resize na base (sem persistência — cada expandir volta ao padrão); Respondida Sim (verde)/Sem Resposta (vermelho)/Pendente; Agendamento Agendado/Não Agendou/Pendente; Status ganha "Atendimento Em Aberto".

## Ordem de implementação
1. Migration: colunas frozen_* + conversation_id em campaign_contacts; campaign_id/created_by/created_via em appointments; triggers freeze scheduled/resolved; RPCs atualizadas (+no_response/scheduled/resolved counts); backfill.
2. campaign-dispatch: grava conversation_id; gate "Atendimento Em Aberto"; sweep T-1h (moved) no worker.
3. campaign-expiry: sweep 'expired' respeitando conversas abertas.
4. campaign-manage: reenvio encerra mãe; aviso "X clientes em outra campanha" (nova action de checagem p/ wizard).
5. api-scheduling (campo instance) + api-public-booking (instance_id no payload + catálogo da campanha) + AppointmentModal (seletor de tag obrigatório) + importAppointments/gcal sem vínculo.
6. Frontend: CampaignContactsTable (colunas congeladas + cores + resize), cards novos, aviso no wizard.
7. Deploy ritual completo.
