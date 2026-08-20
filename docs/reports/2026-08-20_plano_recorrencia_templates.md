# Plano — Recorrência com templates e campanhas automáticas diárias

Data: 2026-08-20
Status: **APROVAÇÃO PENDENTE** — nenhuma etapa executada ainda. Executar etapa por etapa, com deploy completo ao fim de cada fase.

---

## 1. Objetivo

Transformar o sistema de recorrência para que:
1. Serviços já criados possam ser **editados** (incluindo a aba Recorrência, hoje inexistente na edição).
2. As mensagens de recorrência 1/2/3 tenham **formato de template** com variáveis pré-definidas, porque clientes de API oficial (Meta) precisam enviá-las como template aprovado.
3. As abordagens de recorrência sejam disparadas por **campanhas criadas automaticamente todos os dias** ("a recorrência segue exatamente a mesma lógica dos disparos"), reaproveitando todo o pipeline de campanhas (tag, takeover, freeze, campaign_prompt, métricas, n8n com o MESMO payload).

## 2. Decisões do usuário (USER RULES — todas confirmadas)

| # | Decisão |
|---|---------|
| R1 | Ao salvar serviço com recorrência (tenant com API oficial), os templates Meta são **criados e submetidos imediatamente** — a recorrência não é imediata, então há tempo hábil para aprovação. |
| R2 | Um conjunto de templates **por serviço** (cada cliente/serviço submete os seus individualmente). |
| R3 | Custo de template MARKETING = responsabilidade do cliente aprovar ou não. |
| R4 | Variáveis do editor: **Nome da Clínica, Serviço, Aplicação, Preço, Profissional**. Preço = preço **cadastrado** (`services_client.price`), nunca o da venda. Profissional = o do **agendamento original** que gerou a recorrência. |
| R5 | **Desconto NÃO é variável**: é campo fixo em **%**, abaixo de "Tempo (dias)", **um por mensagem de recorrência (1/2/3)** — decisão 2026-08-20; alimenta o campo de desconto que as campanhas já têm (`campaigns.discount_pct`, tipo promotion — aplicado em preço via `_shared/campaign-discount.ts` e injetado no prompt da IA). Cada campanha diária usa o desconto da sua mensagem. |
| R6 | Badge de status ao lado do nome do serviço (só API oficial): **template aprovado / aprovação pendente / aprovação negada**. |
| R7 | Campanhas geradas **TODOS os dias**, mesmo com 1 contato — a ideia é não acumular todo mundo no mesmo dia. |
| R8 | Agrupamento: container pai **`Recorrencia - <data>`** (organização por dia); dentro dele, uma campanha individual por serviço+mensagem: **`Recorrencia - <serviço> - Msg<N> - <data>`** — essa campanha individual é o template disparado e a tag anexada ao cliente. |
| R9 | Template Meta pendente/negado no dia do disparo: **campanha é criada mas NÃO dispara**, com alerta "campanha interrompida devido a não aprovação do template da Meta". UAZAPI não tem esse problema. |
| R10 | Tenant só UAZAPI: mensagens vão como **texto livre com variáveis substituídas**, sem fluxo de aprovação (mesmo editor). |
| R11 | Campanha de recorrência **derruba campanha ativa** do contato (takeover normal se aplica). |
| R12 | Métricas aparecem na aba **Recorrência** da dash (não em Campanhas). O pipeline escreve o status da abordagem de volta em `recurrence_tracking`. |
| R13 | n8n age exatamente como hoje com campanhas, **incluindo o mesmo payload** (`bd_data.campaign_prompt` etc.). |
| R14 | Instância de envio: em **Configurações > Automações**, além da categoria "Envios Automáticos" (existente), criar categoria **"Recorrência"** para o cliente escolher a instância; padrão = prioriza Meta e a mais antiga (mesma regra de hoje). |
| R15 | Serviços pré-definidos com mensagens texto-livre atuais: **não migrar** — serão refeitos em breve. |
| R16 | Método de trabalho: **plano completo primeiro (este documento), depois execução etapa por etapa.** |
| R17 | Incluir também a variável **Nome do Cliente** (`{{nome_cliente}}`). |
| R18 | Horário de disparo: cada campanha inicia em **horário aleatório dentro de 1 hora** a partir da hora escolhida (padrão 9h ⇒ entre 9h e 10h; escolheu 17 ⇒ entre 17h e 18h). Configurável via **botão de engrenagem na página /recurrence** → modal com: hora do disparo + instância que dispara (mesma config da aba Automações / `is_recurrence_primary`). |
| R19 | **Cada fase inclui testes automatizados (vitest)**; só avançar para a próxima fase quando TODOS os testes passarem. |

## 3. Estado atual (código verificado)

- **Mensagens**: `services_client.msg_recurrence_1..3` (texto livre) + `time_recurrence_1..3` (dias). Editadas só na criação (`AddByCategoryModal` → `RecurrenceTab`). `EditApplicationModal` NÃO tem aba Recorrência.
- **Tracking**: `recurrence_tracking` populada pelo trigger `fn_create_recurrence_on_appointment` (appointment waiting/completed de serviço com recorrência; datas = procedure_date + time_recurrence_N). `api-recurrence-due` (x-api-key) entrega vencimentos ao n8n, excluindo `scheduled=true`.
- **Campanhas Meta**: só template existente APPROVED (`variable_map` por `{{n}}`); UAZAPI = texto livre. `campaign-dispatch-worker` (1min), takeover T-1h, tag por instância, freeze, `campaign_prompt`.
- **Criação de template**: `meta-template-manage` action `create` já submete ao Graph (`POST /{waba}/message_templates`, exemplos auto-gerados p/ `{{n}}`) e salva em `message_templates` com status PENDING; status auto-sincroniza do Graph no list (f768252).
- **Named vars → {{n}}**: padrão já existe (templates de sistema, 4189f8f): editor com `{{nome_var}}` convertido para `{{n}}` + `message_templates.variable_map`.
- **Instância primária**: `instances.is_automation_primary` + `AutomationSettings.tsx` (RadioGroup, AUTO = Meta→mais antiga via `pickAutomationInstance`).
- **Dash Recorrência**: aba criada em 00fb73d (`useRecorrenciaDashboard`, `RecurrenceMonthCard` por mês).

## 4. Modelagem proposta

### 4.1 Banco (1 migration por fase que precisar)

**`services_client`** (novas colunas):
- `recurrence_discount_pct_1/2/3 numeric NULL` — campo fixo Desconto (%) por mensagem na aba Recorrência (R5).

**`message_templates`** (novas colunas — reaproveita sync de status existente):
- `service_client_id uuid NULL REFERENCES services_client(id) ON DELETE SET NULL`
- `recurrence_msg_number smallint NULL` (1..3)
- Índice parcial `uq_recurrence_template` ON (service_client_id, recurrence_msg_number, instance_id) WHERE service_client_id IS NOT NULL — 1 template ativo por serviço+mensagem+instância.
- Naming Meta: `rec_<8 primeiros hex do service_client_id>_msg<N>_v<K>` (lowercase/underscore, `v<K>` incrementa a cada resubmissão pós-edição — Meta não permite reusar nome com conteúdo pendente/negado em alguns fluxos; editar template APPROVED usa action `edit` existente respeitando limites 1/24h, 10/30d).

**`instances`**:
- `is_recurrence_primary boolean NOT NULL DEFAULT false` + índice único parcial por user (espelho de `is_automation_primary`, migration 20260723120000).

**`profiles`** (owner):
- `recurrence_dispatch_hour smallint NOT NULL DEFAULT 9` (0..23) — hora base do disparo (R18); o gerador sorteia `scheduled_at` entre `hora:00` e `hora+1:00` BRT por campanha.

**`campaigns`** (novas colunas):
- `recurrence_date date NULL` — dia do container pai (`Recorrencia - <data>` é **agrupamento visual por essa coluna**, não uma linha no DB).
- `recurrence_service_client_id uuid NULL`, `recurrence_msg_number smallint NULL` — vínculo da campanha filha.
- `blocked_reason text NULL` — 'template_not_approved' quando criada-mas-não-disparada (R9); status próprio (ex.: `status='blocked'`) para o worker ignorar.

**`recurrence_tracking`** (writeback R12):
- `approach_1_status/approach_2_status/approach_3_status text NULL` (`sent|delivered|failed|blocked|responded|scheduled` — derivado do desfecho em `campaign_contacts`) + `approach_N_campaign_id uuid NULL`.

### 4.2 Variáveis do editor (named vars → `{{n}}` + `variable_map`)

| Variável (chip) | Placeholder | Fonte |
|---|---|---|
| Nome da Clínica | `{{nome_clinica}}` | `ia_config.name` → fallback `profiles.company_name` |
| Serviço | `{{servico}}` | `service_name.name` do `services_client` |
| Aplicação | `{{aplicacao}}` | nome da aplicação (`services_client.application_name`/template) |
| Preço | `{{preco}}` | `services_client.price` formatado R$ (preço cadastrado, R4) |
| Profissional | `{{profissional}}` | profissional do appointment original (via `recurrence_tracking.appointment_id`) |
| Nome do Cliente | `{{nome_cliente}}` | `contacts.push_name`/nome do contato (R17 — resolveVariable de campanhas já suporta) |

Resolução em runtime: snapshot por contato em `campaign_contacts.raw_data` (mesmo mecanismo `resolveVariable` atual) — o gerador diário preenche `vars` por entry, então Meta e UAZAPI usam o mesmíssimo caminho do dispatch de hoje.

## 5. Fases de execução

### Fase 1 — Edição de serviço + novo editor de recorrência
- `EditApplicationModal` ganha aba **Recorrência** (mesmo `RecurrenceTab`), carregando valores atuais do `services_client`.
- `RecurrenceTab` reformulado: editor por mensagem com **chips de variáveis** clicáveis (inserem `{{nome_var}}` no cursor), preview com valores de exemplo, validação (variável desconhecida = erro).
- Campo **Desconto (%)** fixo abaixo de "Tempo (dias)" → `services_client.recurrence_discount_pct`.
- Migration: coluna `recurrence_discount_pct`.
- Manual: `ServicosGuide` atualizado.

### Fase 2 — Criação/submissão automática de templates Meta + badges
- Migration: colunas em `message_templates` + índice parcial.
- Edge fn nova **`recurrence-template-sync`** (JWT, team-aware): recebe `service_client_id`; para cada mensagem preenchida e cada instância Meta conectada do owner: converte named vars → `{{n}}` + `variable_map`, submete via lógica do `meta-template-manage` create (categoria **MARKETING**, pt_BR), salva vínculo. Chamada no save de Add/Edit (criar/alterar mensagem ⇒ re-submissão `v<K+1>`; sem instância Meta ⇒ no-op).
- Badges no `ServiceApplicationsTable`/listagem: "template aprovado" (verde) / "aprovação pendente" (âmbar) / "aprovação negada" (vermelho) — pior status entre os 1-3 templates; só exibido se tenant tem instância Meta. Status revalida via sync existente do Graph.
- Manual: `ServicosGuide`.

### Fase 3 — Configurações de Recorrência (instância + horário)
- Migration: `instances.is_recurrence_primary` (índice único parcial) + `profiles.recurrence_dispatch_hour`.
- `AutomationSettings.tsx`: segunda seção "Recorrência" (mesmo RadioGroup; AUTO = Meta → mais antiga, mesma regra do `pickAutomationInstance`); helper `pickRecurrenceInstance` em `_shared/automation-instance.ts`; componente da seção extraído para reuso no modal.
- Página **/recurrence**: botão engrenagem no header → modal "Configurações de Recorrência" com (a) hora do disparo (select 0-23, texto explicando "sorteado entre Xh e X+1h", padrão 9) e (b) seletor de instância (mesmo componente da aba Automações) (R18).
- Manual: `ConfiguracoesGuide` + guia de Recorrência.

### Fase 4 — Cron gerador diário de campanhas de recorrência
- Migration: colunas em `campaigns` + `recurrence_tracking`.
- Edge fn **`recurrence-campaign-generator`** + pg_cron diário (madrugada BRT): por owner, coleta abordagens vencendo hoje em `recurrence_tracking` (excluindo `scheduled=true` e status terminais), agrupa por (serviço, msg N), e cria campanhas `Recorrencia - <serviço> - Msg<N> - <dd/MM/yyyy>` com: instância de R14/R18; `scheduled_at` = horário **aleatório** entre `recurrence_dispatch_hour` e a hora seguinte BRT, sorteado por campanha (R18); `discount_pct` = `recurrence_discount_pct`; `campaign_prompt` gerado (mesmo gerador do campaign-manage); tag; entries com `vars` snapshot; Meta ⇒ template vinculado; UAZAPI ⇒ texto livre renderizado.
- Gate R9: template não-APPROVED ⇒ campanha nasce `blocked` + `blocked_reason` (não entra no worker); revalidação no ciclo seguinte pode liberar? **Não** — R9 diz "criada mas não disparada": fica bloqueada com alerta; contatos entram na campanha do dia em que o template aprovar (gerador só considera abordagens ainda sem desfecho).
- Dispatch/takeover/freeze/tag/n8n: **zero código novo** — `campaign-dispatch-worker` e `campaign-takeover` tratam as campanhas de recorrência como qualquer outra (R11, R13).
- Writeback: trigger ou passo no worker gravando `approach_N_status`/`approach_N_campaign_id` a partir de `campaign_contacts` (frozen_reason/message_status).
- `api-recurrence-due` mantido (n8n) — avaliar depreciação futura com o usuário.

### Fase 5 — Dash Recorrência: containers por dia + alertas
- Aba Recorrência da dash ganha seção "Campanhas de Recorrência": **container pai por dia** (`Recorrencia - <data>`, expansível) listando as campanhas filhas do dia com stats (`get_campaign_dashboard_stats` + `CampaignContactsTable` reusados).
- Campanha `blocked` ⇒ alerta vermelho "Campanha interrompida devido a não aprovação do template da Meta".
- Métricas de recorrência NÃO aparecem na aba Campanhas (filtrar `recurrence_date IS NULL` lá).
- Manual: `DashboardGuide` (tópico recorrencia-dash) + `RecorrenciaGuide` (hoje placeholder — boa hora de preenchê-lo).

### Fase 6 — Fechamento
- Revisão do manual de suporte completo (Serviços/Configurações/Dashboard/Recorrência), memória do projeto, e ritual de deploy final.

## 6. Riscos e mitigação

- **Limites Meta de template** (100 por WABA em contas não verificadas; nomes únicos): naming determinístico + reuso por serviço; alertar no save se o Graph recusar por limite.
- **Categoria MARKETING pode ser reclassificada pela Meta** na aprovação: exibir categoria real retornada; custo é decisão do cliente (R3).
- **Campanha diária com 0 contatos**: gerador simplesmente não cria nada naquele dia (sem containers vazios).
- **Aba Campanhas**: precisa filtrar recorrência em TODAS as queries (page /campanhas, dash, KPIs) — checklist na Fase 5.
- **Trigger `fn_create_recurrence_on_appointment`**: não muda; o gerador só lê `recurrence_tracking`.

## 7. Sistema de testes (R19 — gate entre fases)

Testes em **vitest** (`npm test`, config `vitest.config.ts`), organizados em `src/test/recurrence/` (um arquivo por fase: `fase1-*.test.ts(x)` etc). Só avançar de fase com TODOS os testes verdes (incluindo os das fases anteriores — regressão).

- **Fase 1**: parser/validador de variáveis do editor (chips válidos, variável desconhecida = erro, inserção no cursor); serialização do `RecurrenceData` com `recurrence_discount_pct`; render do `RecurrenceTab` (campos + campo Desconto abaixo de Tempo).
- **Fase 2**: conversão named vars → `{{n}}` + `variable_map` (todas as 6 variáveis, ordem estável, texto sem variáveis); geração do nome do template (`rec_<id8>_msg<N>_v<K>`, regex Meta `^[a-z0-9_]+$`); derivação do badge (pior status entre 1-3 templates).
- **Fase 3**: `pickRecurrenceInstance` (prioriza `is_recurrence_primary` → Meta → mais antiga); cálculo do `scheduled_at` aleatório (hora X ⇒ sempre em [X:00, X+1:00) BRT, distribuição dentro da janela); render do modal de configurações.
- **Fase 4**: agrupamento de abordagens por (serviço, msg N); montagem das entries com `vars` snapshot; gate de template não-APPROVED ⇒ `blocked` + `blocked_reason`; writeback de `approach_N_status` a partir de desfechos simulados de `campaign_contacts`; exclusão de `scheduled=true`.
- **Fase 5**: agrupamento das campanhas por `recurrence_date` (container pai); filtro `recurrence_date IS NULL` na aba Campanhas; derivação do alerta de campanha bloqueada.
- Lógica de edge functions testável é extraída para módulos puros (padrão `_shared/`) importáveis pelo vitest; SQL de migrations verificado com scripts `verify_*.sql` em `supabase/.temp/` após aplicar.

## 8. Pendências menores

1. Horário do cron gerador: 05:00 BRT (disparo real segue `scheduled_at` sorteado — R18).
2. Depreciar `api-recurrence-due` quando o pipeline novo estabilizar.
