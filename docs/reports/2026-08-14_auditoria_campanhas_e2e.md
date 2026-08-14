# Auditoria ponta a ponta — Sistema de Campanhas (2026-08-14)

Escopo: criação → disparo → congelamento → expiração/reenvio, front ao back, incluindo verificação do banco de produção (read-only). Referências: commits `19268a5` (congelamento), `70273fb` (card Em Atendimento + bd_data.campaign), spec `docs/reports/2026-08-14_plano_campanhas_congelamento.md`.

---

## 1. Passo a passo da funcionalidade

### 1.1 Criação (CampaignWizard, 6 steps → campaign-manage `create`)

| Step | Conteúdo | Validações |
|---|---|---|
| 0 Dados | nome, instância, data disparo, validade | lead mínimo 1h (`MIN_LEAD_H=1`); validade > disparo |
| 1 Audiência | CSV/XML, CRM, Tag, Agendamentos, Vendas | ≥1 contato válido; upload dedupa por últimos 8 dígitos |
| 2 Tipo | promoção (serviços + desconto) / notificação | serviços obrigatórios se promoção |
| 3 Mensagem | Meta: template APPROVED existente + mapeamento `{{n}}`→campo; UAZAPI: texto livre `<variável>` | template selecionado + todas vars mapeadas / mensagem não vazia |
| 4 Objetivo | objetivo + switch IA (fila IA/Humano) | objetivo não vazio |
| 5 Revisão | contatos, tempo estimado, custo; avisos tier Meta, display name bloqueado | — |

No submit: `checkCampaignConflicts` (modal takeover T-1h) → aviso 7 dias (`contact_tags` recentes; opções Continuar/Excluir clientes) → POST campaign-manage.

**campaign-manage `create`**: valida datas (lead 1h), `normalizeEntries` (dedupe server-side, 1 entrada/contato — índice `uq_campaign_contact` garante no DB), cria tag (`tags.name = nome da campanha`, sufixo "(n)" em colisão), Meta exige template APPROVED (`resolveExistingTemplate`), gera `ai_prompt` (gpt-4o-mini), status inicial `scheduled`. Reenvio: `resend_from_campaign_id` → `campaign_close_entries` na mãe + delete `contact_tags` + `expired_processed=true` + status→`expired`.

### 1.2 Disparo (cron campaign-dispatch-worker 1min → campaign-dispatch)

1. **promoteCampaigns**: `scheduled` com hora chegada → UAZAPI/`template_mode=none` vira `dispatching` direto; Meta sincroniza template no Graph (APPROVED→`dispatching`; PENDING→`awaiting_template` até 48h; REJECTED→`error`).
2. **dispatchBatch** (lote 4, RPC `pick_campaign_contacts` com SKIP LOCKED + recuperação de `sending` >5min): contato inválido→`invalid`; campanha não mais dispatching→`skipped`; **conversa OPEN do contato→`open_ticket` sem envio**; cria/reusa conversa (grava `conversation_id`); UAZAPI texto livre via evolution-send-message (espaço 30-45s), Meta template via meta-send-message (espaço 30s); sucesso→`sent`+`sent_at`+`message_id`; falha→`failed`+erro+cleanup de conversa vazia; tag no contato; move card CRM p/ fila IA/Humano; loga `template_sends`.
3. **finalizeCampaigns**: sem pending/sending → `dispatched`.

### 1.3 Status por entrada (campaign_contacts)

`pending → sending → sent | failed | invalid | skipped | open_ticket` + snapshot `message_status` (trigger em messages UPDATE OF status / BEFORE DELETE) → tabela exibe Entregue (delivered/read) / Rejeitada (failed) mesmo após conversa resolvida.

### 1.4 Congelamento (1º desfecho vence, nunca regride)

| frozen_reason | Gatilho | Exibição |
|---|---|---|
| `scheduled` | trigger AFTER INSERT appointments com campaign_id (manual/IA/link público) | "Agendado", atendente verde |
| `resolved` | trigger `zz_` no resolve da conversa do envio | "Finalizado", atendente laranja (fila IA→"IA") |
| `moved` | `campaign_takeover_sweep` (nova campanha mesma instância T-1h) | "Movido Para Outra Campanha" |
| `expired` | `campaign_close_entries` (cron expiry horário / reenvio) — **pula contatos com conversa OPEN** | "Campanha Encerrada" |

`frozen_responded` fixado no congelamento via `campaign_contact_responded` (messages vivas + messages_history).

### 1.5 Vínculo agendamento→campanha

- Manual: AppointmentModal — seletor obrigatório quando há campanha ativa; grava `campaign_id/created_by/created_via='manual'`; **edição NÃO toca campaign_id** (payload de UPDATE omite — regra do usuário confirmada).
- IA: api-scheduling campo `instance` → `resolveCampaignForContact` → `created_via='ia'`.
- Link público: token base64 com `instance_id` (gerado em webhook-handle-message e appointment-confirmation-respond) → `resolveActiveCampaign` → `created_via='public_link'`; catálogo soma serviços da campanha.
- Import: `created_via='import'`, nunca vincula. GCal: sem contato/campanha (ausências).

### 1.6 n8n (bd_data.campaign, 70273fb)

Bloco SEMPRE presente; filtra campanha ativa por **instância da conversa** (sent + dispatching/dispatched + valid_until>now); com campanha: campaign_tag/id/name/objective/services/discount_pct/initial_message/scheduled_at+valid_until (SP)/ia_enabled/campaign_prompt; sem: `{campaign_tag:'sem campanha ativa'}`.

### 1.7 Dashboard/relatórios

- `get_campaign_dashboard_stats` (12 colunas) → CampaignStatsGrid 8 cards: enviadas/entregues/rejeitadas/respondidas/sem resposta/agendados/resolvidos/em atendimento (`in_progress = sent sem frozen_at`).
- `get_campaign_contact_report` (frozen-aware) → tabela de contatos com filtros Status/Respondida/Agendamento/Estágio/Atendente + busca.

---

## 2. Verificação no banco de produção (read-only, 2026-08-14)

| Checagem | Resultado |
|---|---|
| Crons `campaign-dispatch-worker` (1min), `campaign-expiry` (hora), `campaign-takeover` (1min) | ✅ ativos |
| Triggers freeze (`trg_campaign_freeze_on_appointment`, `zz_campaign_freeze_on_resolve`) | ✅ existem |
| Triggers snapshot (`trg_campaign_snapshot_msg_status`, `_delete`) | ✅ existem |
| `get_campaign_dashboard_stats` 12 colunas / `get_campaign_contact_report` / helpers (5 fns) | ✅ |
| Duplicata contato/campanha | ✅ 0 |
| `sending` travado / frozen sem reason / dispatching vencida | ✅ 0 |
| 127 sent vivos em campanhas vencidas | ✅ **100% têm conversa OPEN** (regra F2=b — correto) |
| Appointment com campaign_id sem freeze `scheduled` correspondente | ✅ 0 |
| Freeze `scheduled` sem appointment (excluindo backfill) | ✅ 0 |
| Distribuição frozen: 2454 expired / 137 scheduled / 57 resolved / 908 vivos | ✅ consistente |

---

## 3. Problemas encontrados (para decisão)

### P1 — MÉDIO/REAL: dispatch reusa conversa de OUTRA instância (25 ocorrências)
`campaign-dispatch/index.ts:312-329` — `findOrCreateConversation` reusa qualquer conversa pending do contato **sem filtrar por instância** (comentário diz que é intencional p/ evitar duplicata). Consequências comprovadas no banco (25 entradas `sent` com conversa de instância ≠ da campanha):
- Mensagem pode sair pelo número errado (evolution/meta-send-message resolvem a instância PELA CONVERSA);
- Campanha Meta + conversa UAZAPI pendente → meta-send-message rejeita ("Instance is not a Meta Cloud API instance") → entry `failed`;
- `bd_data.campaign` não encontra a campanha nessas conversas (filtra por instância da conversa) → IA responde "sem campanha ativa";
- Trigger de resolve congela normalmente (usa conversation_id), mas o atendimento acontece na instância errada.
**Mesmo pitfall já corrigido na automation_send_queue** (caso Fayruss/PELE). Sugestão: filtrar `.eq('instance_id', campaign.instance_id)` no reuso.

### P2 — BAIXO: resíduo do backfill — campanha "BOTOX VENCIDO DEZ A MARÇO/26"
`expired_processed=TRUE` mas status ficou `dispatched` (backfill marcou processed sem rodar o fluxo) → cron pula para sempre; 831 `contact_tags` da tag dela nunca foram removidos (única campanha com vazamento). Fix: 1 UPDATE (status→expired) + 1 DELETE (contact_tags).

### P3 — BAIXO: 196 entries `pending` presos em campanha `error` ("Density 200")
Campanha errou (template REJECTED/#131037) e os pending nunca serão pegos (pick só olha dispatching) nem congelados (close/takeover não tratam campanhas `error`). Inflam `total_contacts` nas métricas. Sugestão: `campaign_close_entries` (ou delete dos pending) quando campanha vira `error`, + limpeza pontual.

### P4 — BAIXO (UX): `frozen_reason` sem distinção visual
CampaignContactsTable:370-376 — badge do atendente: verde só p/ `scheduled`; `resolved`/`moved`/`expired` todos laranja (o motivo aparece no texto do frozen_stage, então impacto pequeno).

### P5 — BAIXO: edge cases do wizard
- `checkCampaignConflicts` pulado quando edição não altera audiência (cron takeover ainda cobre — tolerado, já validado com usuário);
- aviso 7 dias lê todas as campanhas do usuário (query pesada com volume grande — irrelevante hoje);
- dedupe frontend só no upload de arquivo; demais builders dependem do dedupe server-side + índice único (funciona, comprovado 0 duplicatas).

### P6 — INFO: pontos já conhecidos/aceitos
- meta-webhook HMAC bypassed "for diagnostics" (pendente reativar);
- RPCs antigas mantidas no DB p/ bundles PWA velhos (aceito);
- tokens de link público legados sem instance_id não vinculam campanha (aceito — sistema em desenvolvimento);
- google-calendar-webhook não seta `created_via='gcal'` (só ausências, sem impacto em campanha).

---

## 4. Checklist final

- [x] Wizard 6 steps + validações (lead 1h, template APPROVED, vars mapeadas)
- [x] Conflito T-1h + aviso 7 dias + avisos Meta (tier/display name)
- [x] Dedupe 1 entrada/contato (server + índice único; 0 duplicatas no banco)
- [x] Dispatch: gates open_ticket, invalid, skipped; spacing; cleanup conversa vazia; tag; CRM move
- [x] Todos os 8 status de entrada renderizados na tabela; 7 status de campanha nos cards; ações por status coerentes (editar/excluir/reenviar)
- [x] Snapshot message_status sobrevive ao resolve (triggers presentes)
- [x] Congelamento 4 motivos com triggers/crons ativos; 0 inconsistências appointment↔freeze
- [x] Conversa OPEN intocável (127 vivos vencidos = 100% com conv open)
- [x] Vínculo appointment→campanha nos 4 caminhos (manual/ia/public_link/import) conformes; edição preserva campaign_id
- [x] bd_data.campaign por instância, sempre presente, TZ São Paulo
- [x] Reenvio encerra a mãe (close_entries + tag + expired)
- [x] Dashboard 12 colunas / 8 cards / relatório frozen-aware
- [ ] **P1**: filtro de instância no reuso de conversa do dispatch (correção recomendada)
- [ ] **P2**: data-fix BOTOX VENCIDO (status + tags)
- [ ] **P3**: tratamento de entries pending em campanha `error`
- [ ] P4 (opcional): cores distintas por frozen_reason
