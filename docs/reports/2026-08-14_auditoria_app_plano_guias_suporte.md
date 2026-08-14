# Auditoria completa do app + Plano dos Guias de Suporte

**Data:** 2026-08-14
**Contexto:** Fase 1 do projeto "Página Suporte completa". Este relatório consolida (A) a auditoria funcional de todas as áreas do sistema, (B) a lista de inconsistências/bugs encontrados (com verificação de veracidade em código/banco) e (C) o plano detalhado de cada guia de suporte, seguindo a estrutura já validada do guia de Campanhas (commit f7e6e65 + ae71753).

**Fases:**
1. **Fase 1 (este documento):** auditoria + plano — CONCLUÍDA
2. **Fase 2:** correção dos bugs confirmados (aguarda aprovação do usuário)
3. **Fase 3:** implementação dos guias, um por um

---

## PARTE A — Auditoria funcional por área

### A1. Dashboard (`/` aba dashboard — `src/components/dashboard/`)
- **6 abas:** Visão Geral, CRM, Monitoramento, Agendamentos, Satisfação, Campanhas.
- **CRM:** hoje = RPC `get_crm_stage_counts()` ao vivo; datas passadas = `crm_stage_daily_snapshots` (pg_cron 23:59 BRT).
- **Monitoramento:** boards por estágio CRM, convs open/pending unidas client-side com cards ativos; last-sender por `last_customer_message_at` vs `last_message_at`; janela 24h Meta/IG; status online via RPC `get_team_online_status()` (heartbeat `active_sessions` < 2min).
- **Agendamentos:** ocupação, NPS por profissional (RPC `get_professional_nps`), Mensagens Automáticas (fila `automation_send_queue` + RPCs `get_automation_schedule`/`get_automation_template_messages`), Vendas↔Agendamentos.
- **Satisfação:** RPC `get_satisfaction_dashboard` (cards, últimas avaliações c/ profissional+aplicação, atendentes, templates via `template_sends`).
- **Campanhas:** `CampaignExpandableCard` com barra de envios + `CampaignContactsTable` compartilhada (RPC frozen-aware `get_campaign_contact_report`).

### A2. Inbox (`/` — `src/components/chat/`, `src/pages/Index.tsx`)
- Lista de conversas (filtros fila/status/busca), ChatArea (render via `MessageList.tsx`), sidebar direita `AIIntelligenceSidebar` (crm_client + `NegotiationQuickModal`).
- Envio sempre via `evolution-send-message` (delega a `meta-send-message` p/ instâncias Meta). Meta não tem editar/apagar (ocultos via `hideEditDelete`).
- Conversa resolvida = mensagens arquivadas em `conversations.messages_history` — qualquer view de histórico DEVE usar `useMessages`.
- Gates de encaminhamento IA (webhook-handle-message): conv pending + `contacts.ia_on` + `ia_config.ia_on` + `instances.ia_on_wpp` + fila = 'Atendimento IA'.

### A3. CRM (`/crm` — `NewKanbanBoard`) + Clientes (`/contacts`)
- Funil único, 15 estágios fixos, 1 card ativo por contato (índice único parcial). Estágios terminais: Ganho, Perdido, Sem Contato, Sem Interesse, Finalizado (viram histórico; triggers DB forçam is_active=false e resolvem tickets).
- Sync bidirecional estágio↔fila via triggers (`sync_queue_from_crm_stage` / `sync_crm_stage_from_queue`).
- Perfil do cliente: modal 9 abas (Cadastro, Vendas, Procedimentos, Agendamentos, Atendimentos, Histórico, Avaliação, Resumos, Negociações).
- `contacts.client_stage` automático por trigger em sales (contato/lead/cliente); `contacts.ia_on` manual-only.

### A4. Serviços (`/products-services`) + Equipe (`/equipe`)
- Hierarquia: services_category (standard/direct) → service_name → service_applications (templates) → services_client (dados do usuário). Categorias do usuário (user_id NULL = global).
- Vínculo profissional↔serviço vive em `services_client.professionals` (UUID[]).
- Equipe: abas Equipes|Permissões (admin-only); papéis admin/supervisor/agent; RLS team-aware via `get_owner_id()`.

### A5. Agenda (`/scheduling`) + Recorrência
- SchedulingCalendar (HOUR_HEIGHT 120/80 mobile, hover-card, visão solo por profissional, gauges ocupação+NPS no header), AppointmentModal (contato obrigatório, pagamento no create, seletor de campanha), horário individual por dia (`use_daily_schedule`/`work_hours_daily` + helper `getWorkHoursForDay` duplicado front/edge), importação de agendamentos (wizard 5 passos), link público `/agendar`.
- Criação de agendamento auto-cria/vincula venda (trigger `link_or_create_sale_on_appointment`); conclusão NÃO cria venda.
- Confirmações automáticas: 3 fluxos (confirm_24h, reminder_2h, feedback_24h) via `appointment-confirmation-cron` + fila `automation_send_queue` (Meta).
- **Recorrência:** ainda scaffold — regras em aprovação (guia ficará vazio conforme pedido).

### A6. IA (`/ia-config`) + Conexões (`/whatsapp-connection`) + Configurações (`/settings`)
- IA: 3 abas (Empresa/F.A.Q/Configurações); Workflow ID propaga p/ instâncias; gates de roteamento n8n (5 condições).
- Conexões: abas externas Conexões|Templates (condicionais por provider), UAZAPI vs Meta Cloud vs Instagram; `meta-verify-connection` no mount; Mensagens API não oficial (UAZAPI).
- Configurações: Perfil/Empresa/Segurança/Sistema/Automações (instância primária de disparos).

---

## PARTE B — Inconsistências e bugs

Cada item foi VERIFICADO no código/banco antes de entrar aqui. Itens alarmantes reportados pelos agentes de auditoria que se provaram falsos estão na seção B3.

### B1. Confirmados — candidatos à Fase 2

| # | Severidade | Área | Problema | Evidência |
|---|-----------|------|----------|-----------|
| AUD-01 | Média | IA | **UI de follow-up morta no IAConfig**: campos fup1-3 (+times/messages/followup_business_hours) definidos na interface/defaults (IAConfig.tsx:48-117) mas NENHUM controle é renderizado — usuário não consegue configurar follow-up pela UI, embora o motor (RPC `get_followup_pending_contacts` + api-followup-pending) esteja ativo | IAConfig.tsx:48-117 sem JSX correspondente |
| AUD-02 | Média | Agenda | **Seletor de campanha ausente na edição de agendamento**: `!appointmentToEdit &&` (AppointmentModal.tsx:694 e 901) esconde o seletor — impossível corrigir vínculo de campanha depois de criado | AppointmentModal.tsx:694/901 |
| AUD-03 | Média | Inbox | **Duplicação de renderização de mensagem**: `MessageList.tsx` e `MessageBubble.tsx` têm cada um seu próprio `HighlightText` (negrito/itálico) e parsing de template (`*Template enviado: name*`) — correções de formatação precisam ser feitas 2x e já divergiram no passado | src/components/chat/MessageList.tsx vs MessageBubble.tsx |
| AUD-04 | Baixa | CRM | **TERMINAL_STAGES hardcoded em 4 lugares**: crm-client.ts (front), api-crm, api-public-booking, api-scheduling — adicionar estágio terminal exige tocar os 4 | grep `TERMINAL_STAGES`/`terminals` |
| AUD-05 | Baixa | Agenda | **Legado sem horário individual por dia**: `check-availability`, `bia-tools` e `useReportData` não usam `getWorkHoursForDay` (só horário global) — decidido deixar como legado em 0711a28, registrar como dívida | supabase/functions/check-availability, bia-tools |
| AUD-06 | Baixa | Agenda | **Import wizard não checa ausências/GCal**: importação não valida overlap com ausências nem eventos Google Calendar (regra confirmada pelo usuário em ee8bc4a como aceitável — manter como known-limitation, não bug) | importAppointments.ts |
| AUD-07 | Baixa | Conexões | **Corpos UAZAPI duplicados**: `DEFAULT_UAZAPI_BODIES` existe em `_shared/uazapi-automation-messages.ts` e espelhado no front (`AutomaticMessages.tsx`) — risco de dessincronizar | ambos os arquivos |
| AUD-08 | Baixa | Conexões | **Aba externa não persiste na URL ao trocar manualmente**: deep-link `?tab=` funciona, mas navegar entre abas não atualiza o param (refresh volta à primeira aba) | Connections.tsx `outerTab` state |
| AUD-09 | Baixa | CRM | **Código morto**: `CRMIntegrationSidebar.tsx` (CRM antigo) não é usado em lugar nenhum — candidato a remoção | import graph |
| AUD-10 | Alta (segurança, pré-existente) | Meta | **HMAC do meta-webhook ainda desativado** ("for diagnostics") — reativar validação de assinatura | supabase/functions/meta-webhook |
| AUD-11 | Baixa | Campanhas | **frozen_reason sem cores distintas** (P4 pendente do 19268a5) | CampaignContactsTable |

### B2. Regras de negócio a documentar nos guias (não são bugs, mas surpreendem usuários)
- Mover card para estágio terminal ENCERRA os tickets abertos do contato (regra do usuário).
- Concluir agendamento não cria venda (a venda nasce na criação, trigger).
- Campanha: 1 entrada por contato SEMPRE; resultado congelado no 1º desfecho; conversa OPEN é intocável.
- `contacts.ia_on` é manual-only; bloqueio de IA depende de conv pending + fila Atendimento IA.
- Link público só mostra Avaliação + serviços comprados pendentes, sem preços.
- Página só lista categorias que já têm services_client — categoria nova aparece após a 1ª aplicação.

### B3. Falsos positivos verificados e DESCARTADOS
- ~~"Vazamento RLS em notifications/monitoramento/sales"~~ — pg_policies conferido (`supabase/.temp/audit_rls_check.sql`): todas as tabelas têm policies team-aware (`get_owner_id()`/joins em team_members). Queries do front sem `.eq(owner)` são seguras.
- ~~"formatPhoneDisplay indefinida em IAConfig"~~ — definida em IAConfig.tsx:573.
- ~~"Gauge de ocupação sumiu do SchedulingCalendar"~~ — existe (linhas 150-216).
- ~~"Hooks do FinancialDashboard deletados"~~ — useFinancial.ts existe e é usado por 16 arquivos.

---

## PARTE C — Plano dos guias (Fase 3)

**Estrutura padrão (igual CampaignsGuide):** hero + LearnChips → SubNav sticky → TopicSections com Callouts (dica/atencao/pratica/evite) + StepByStep → simuladores interativos → botões "Me mostre na prática" (driver.js via `?tour=<id>` + `data-tour` na página real) → FAQ (accordion).

**Arquivos:** um guia por arquivo em `src/components/suporte/<Nome>Guide.tsx`; simuladores novos em `simulators.tsx` (ou `simulators-<area>.tsx` se crescer); tours em `src/lib/suporteTours.ts` (TOURS map); abas em `Suporte.tsx`.

**Ordem das abas (espelha a sidebar):** Dashboard, Inbox, CRM, Serviços, Clientes, Equipe, Agenda, Recorrência (vazia), Campanhas ✅, IA, Conexões, Configurações.

### C1. DashboardGuide
- **Tópicos:** o-que-e, visao-geral, crm-metricas (snapshot diário vs ao vivo), monitoramento (semáforo última mensagem/janela 24h/online), agendamentos (ocupação, NPS, mensagens automáticas — o que significa Agendada/Enviada/Entregue/Rejeitada), satisfacao, campanhas-dash, faq.
- **Simulador:** MiniMonitorSimulator — card de conversa mock alternando quem falou por último + janela 24h expirando.
- **Tours:** `dashboard-abas` (data-tour em cada TabsTrigger), `monitoramento-card`.

### C2. InboxGuide
- **Tópicos:** o-que-e, filas-e-status (open/pending/resolved + o que cada um dispara), atendendo (assumir, responder, resolver), ia-no-inbox (os 5 gates explicados em linguagem simples), sidebar-inteligencia (negociação rápida), midias-e-acoes (o que Meta não permite: editar/apagar), historico (mensagens arquivadas ao resolver), faq.
- **Simulador:** ConversationFlowSimulator — timeline pending→open→resolved mostrando o que acontece com IA/CRM em cada transição.
- **Tours:** `inbox-atender` (lista, chat, botão resolver, sidebar IA) — data-tour em Index/ChatArea.

### C3. CrmGuide
- **Tópicos:** o-que-e, estagios (15, grupos IA/humano/terminais), sync-fila (mover card muda fila e vice-versa), terminais (encerram tickets! Callout atencao), um-card-ativo, negociacoes (serviços, valores), client-stage (contato/lead/cliente automático), faq.
- **Simulador:** StageSyncSimulator — arrastar card mock entre 4 colunas e ver a fila mudar junto; TerminalStageSimulator — mover p/ Sem Interesse pede motivo e resolve ticket.
- **Tours:** `crm-board` (colunas, card, menu mover).

### C4. ServicosGuide
- **Tópicos:** o-que-e, hierarquia (categoria→serviço→aplicação→meu catálogo), tipos-categoria (standard vs direct), adicionando (AddByCategoryModal passo a passo), profissionais-vinculados, precos (onde o preço é usado: venda/negociação/link público NÃO mostra), faq.
- **Simulador:** HierarchyExplorer — árvore clicável categoria→serviço→aplicação.
- **Tours:** `servicos-adicionar`.

### C5. ClientesGuide
- **Tópicos:** o-que-e, cadastro-e-numeros (últimos 8 dígitos, Meta vs UAZAPI), client-stage-badges, perfil-9-abas, ia-por-contato (toggle manual), nps-vs-sentimento, tags, faq.
- **Simulador:** ClientStageSimulator — simular vendas (Avaliação vs outra categoria) e ver o badge mudar.
- **Tours:** `clientes-perfil`.

### C6. EquipeGuide
- **Tópicos:** o-que-e, papeis (admin/supervisor/agent — tabela do que cada um vê), convidando, permissoes-finas, sessoes-online, faq.
- **Simulador:** RoleMatrixExplorer — selecionar papel e ver sidebar/ações liberadas.
- **Tours:** `equipe-permissoes`.

### C7. AgendaGuide (maior guia depois de Campanhas)
- **Tópicos:** o-que-e, calendario (navegação, solo, hover-card), criando-agendamento (contato obrigatório, pagamento, campanha), horarios-profissional (global vs por dia), venda-automatica (Callout pratica: criar agendamento cria venda pendente), confirmacoes-automaticas (3 fluxos + fila Meta + switches de template), importacao (5 passos + regras), link-publico (o que o cliente vê), status-e-crm (concluído→Ganho, cancelado/no-show→alerta na venda), faq.
- **Simulador:** ConfirmationFlowSimulator — timeline 24h antes → 2h antes → 24h depois com as mensagens mock; DailyScheduleDemo — switch horário individual.
- **Tours:** `agenda-criar` (botão novo, modal), `agenda-config-profissional`.

### C8. RecorrenciaGuide — ABA VAZIA
- Placeholder: "Guia em construção — as regras de Recorrência estão em aprovação." (card com ícone, sem tópicos).

### C9. CampaignsGuide — ✅ pronto (f7e6e65/ae71753), sem retrabalho.

### C10. IaGuide
- **Tópicos:** o-que-e, quando-a-ia-responde (os 5 gates como checklist visual), configurando-empresa (campos que alimentam o prompt), faq-da-ia (frequent_questions), workflow-id, delay-e-voz, ia-e-crm (fila IA ↔ estágios IA), desligando (por contato/instância/global), faq.
- **Simulador:** IaGateSimulator — 5 toggles (conv pending, contato, global, instância, fila) e um semáforo "IA responde?" que só acende com todos verdes. É o simulador mais importante do app (dúvida nº1 dos clientes).
- **Tours:** `ia-config-tabs`.

### C11. ConexoesGuide
- **Tópicos:** o-que-e, provedores (UAZAPI vs Meta oficial vs Instagram — tabela comparativa), conectando-uazapi (QR code), conectando-meta (embedded signup + verificação), templates-meta (aprovação, categorias, edição 1x/24h), mensagens-nao-oficiais (corpos UAZAPI), qualidade-meta (rating/tier/janela — link cruzado c/ guia Campanhas), restricoes (display name DECLINED), faq.
- **Simulador:** ProviderComparisonTable interativa; QualityTierDemo (reaproveita conceito do MetaQualityPanel).
- **Tours:** `conexoes-instancia`, `conexoes-templates`.

### C12. ConfiguracoesGuide
- **Tópicos:** o-que-e, perfil-e-empresa, seguranca, automacoes (instância primária de disparos — Callout atencao sobre UAZAPI como primária), sistema, faq.
- **Tours:** `settings-automacoes`.

### Ordem de implementação (Fase 3)
1. Suporte.tsx: registrar as 11 novas abas (Recorrência já vazia) — 1 commit
2. IaGuide (maior valor: dúvida nº1) → 3. InboxGuide → 4. CrmGuide → 5. AgendaGuide → 6. DashboardGuide → 7. ClientesGuide → 8. ServicosGuide → 9. ConexoesGuide → 10. EquipeGuide → 11. ConfiguracoesGuide
- Cada guia = 1 commit próprio (guia + simuladores + tours + data-tour na página real), deploy contínuo via Vercel.

---

## Próximos passos
1. **Usuário aprovar/ajustar** a lista B1 (o que entra na Fase 2) e o plano C.
2. **Fase 2:** corrigir AUD-01, AUD-02, AUD-03 (unificar render), AUD-10 (HMAC) e os demais aprovados.
3. **Fase 3:** implementar guias na ordem acima.
