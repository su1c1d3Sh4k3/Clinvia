# Auditoria de Responsividade — Relatório e Plano de Implementação

**Data:** 2026-08-11
**Escopo:** Todas as páginas da aplicação em telas menores — smartphones (360–430px), tablets (768–1024px) e notebooks de tela pequena (~1280px)
**Status:** FASE 1 — análise e plano. Nenhuma alteração de código foi feita ainda.
**Stack:** React 18 + Tailwind CSS (shadcn/ui). Todas as correções propostas usam apenas utilitários Tailwind + hooks existentes (`useIsMobile`), sem novas dependências.

---

## 1. Sumário executivo

A aplicação tem uma **base responsiva razoável** (menu mobile com hambúrguer/overlay, breakpoints em várias páginas, sidebars com `hidden md:block`), mas a auditoria encontrou **~50 problemas** concentrados em 6 padrões recorrentes:

| # | Padrão de problema | Ocorrências | Impacto |
|---|--------------------|-------------|---------|
| P1 | **Modais/Dialogs com `max-w-*` sem fallback mobile** (`max-w-2xl`/`max-w-4xl`/`sm:max-w-[425px]` estouram viewport < 640px) | ~10 modais | Modal cortado/invade bordas |
| P2 | **Tabelas sem `overflow-x-auto`** ou com `min-w`/`w-[%]` que espremem colunas | 4+ tabelas | Dados ilegíveis/invisíveis |
| P3 | **Grids sem breakpoints intermediários** (`grid-cols-3`/`grid-cols-4` fixos, ou saltos `md:`→`xl:`) | ~12 grids | Cards espremidos/ilegíveis |
| P4 | **Interações hover-only** (sidebar da Agenda expande no hover, hover-cards do calendário) | 3 locais | Funcionalidade INACESSÍVEL no touch |
| P5 | **Larguras/alturas fixas em px** (colunas kanban 240px, HOUR_HEIGHT 120px, popovers 300–320px, search 640px) | ~10 locais | Overflow horizontal |
| P6 | **Drag-and-drop HTML5** no kanban CRM (não funciona em touch) | 1 local | Mover cards impossível no celular |

**Onde dói mais (crítico):** Inbox (3 painéis), CRM kanban, Agenda (calendário + sidebar hover), tabela de /contacts, ClientProfileModal (9 abas), CampaignWizard e PublicBooking (página pública = prioridade máxima em mobile).

---

## 2. Achados por página

Severidade: 🔴 Alta (quebra funcionalidade) · 🟠 Média (degrada UX) · 🟢 Baixa (polish)

### 2.1 Inbox (`src/pages/Index.tsx` + chat)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `ClientProfileModal.tsx:82-92` | 9 abas `flex-1` numa linha → ~40px por aba em 360px, ilegível | `TabsList` com `overflow-x-auto flex-nowrap` + `shrink-0` nos triggers (scroll horizontal de abas) |
| 🔴 | `TemplatePickerModal.tsx`, `ForwardMessageModal.tsx`, `NewMessageModal.tsx` | `DialogContent` sem constraint de largura mobile | Padrão `w-[95vw] sm:w-full sm:max-w-lg` |
| 🟠 | `Index.tsx:330` | Sheet de ações `w-[85vw] max-w-[350px]` — margem mínima em 360px | `w-[min(90vw,350px)]` |
| 🟠 | `MessageInput.tsx:265,293` | Popover quick messages/mentions `w-[300px]` fixo | `w-[calc(100vw-2rem)] sm:w-[300px]` |
| 🟠 | `MessageInput.tsx:395` | Emoji picker `w-80` (320px) | `w-[calc(100vw-2rem)] sm:w-80` |
| 🟠 | `ChatHeader.tsx:93-94` | Nome `max-w-[160px] xl:max-w-[240px]` sem degrau `sm` | `max-w-[120px] sm:max-w-[160px] xl:max-w-[240px]` |
| 🟠 | `ConversationsList.tsx:362` | Grid de 4 botões de filtro apertado em 360px | `gap-1 sm:gap-1.5` + revisar tamanho mínimo de toque |
| 🟠 | `ConversationsList.tsx:369` | Dropdown de filtros `w-56` pode sair da tela | `max-w-[90vw]` |
| 🟠 | `AIIntelligenceSidebar.tsx:232` | Expansão hover `w-[320px]` cobre quase toda a tela mobile | `w-[min(320px,calc(100vw-60px))]` + toggle por clique no touch |
| 🟢 | `ChatHeader.tsx:291-304` | Botões 36px (touch target ideal ≥44px) | `h-9 w-9` mantido, revisar espaçamento |
| 🟢 | `AIIntelligenceSidebar.tsx:306` | Nome de serviço sem `truncate` | adicionar `truncate` + `min-w-0` |
| ✅ | `ConversationsList.tsx:337` | `w-full md:w-[360px]` — painel já responsivo | — |
| ✅ | `ClientProfileModal.tsx:110` | Sidebar direita já `hidden md:block` | — |

**Nota estrutural:** o layout de 3 painéis (lista | chat | sidebar IA) já tem tratamento mobile (lista full-width, painel oculto), mas a sidebar IA expandida sobrepõe o chat no touch — precisa virar toggle por clique/sheet.

### 2.2 Dashboard (`src/pages/Dashboard.tsx` + `src/components/dashboard/`)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `CampaignContactsTable.tsx:84-196` | Tabela 5 colunas SEM `overflow-x-auto` (só `overflow-y`) — dados invisíveis em mobile (usada na dash E em /campanhas) | wrapper `overflow-x-auto` + `min-w-[500px]` na table |
| 🟠 | `CampanhasKpiCards.tsx:59` | `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` — salto 3→6, buraco em lg | inserir `lg:grid-cols-4` (ou `lg:grid-cols-6`) |
| 🟠 | `CampaignExpandableCard.tsx:88,111` | Barra de envios `max-w-[280px]`; grid métricas `grid-cols-3` fixo | `max-w-full sm:max-w-[280px]`; `grid-cols-1 sm:grid-cols-3` |
| 🟠 | `OcupacaoSection.tsx:160,167` | `lg:grid-cols-3` sem degrau `md:`; chart height 300 fixo | `md:grid-cols-2 lg:grid-cols-3`; altura condicional via `useIsMobile` |
| 🟠 | Charts recharts (várias seções) | `ResponsiveContainer height={300}` fixo — grande demais em mobile landscape | altura 200 em mobile (`useIsMobile`) |
| 🟢 | `IndicadoresSection.tsx:125` | 7 cards `grid-cols-2 md:grid-cols-4 xl:grid-cols-7` sem degraus | `sm:grid-cols-3 lg:grid-cols-5` intermediários |
| 🟢 | `RankingsSection.tsx:120,160` | Cards `h-[420px]` fixos — scroll excessivo empilhados em mobile | `h-[320px] sm:h-[380px] lg:h-[420px]` |
| 🟢 | `StageStatusCards.tsx:39` | `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` | inserir `sm:grid-cols-3` |
| 🟢 | `StageBoard.tsx:60` (monitoramento) | sem `md:` — salto sm(2)→lg(3) | `md:grid-cols-3` |
| 🟢 | `Dashboard.tsx` | Barra de abas da dash — verificar overflow com muitas abas em mobile | `overflow-x-auto` na TabsList |

### 2.3 CRM (`src/pages/CRM.tsx` + `src/components/crm/`)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `NewKanbanBoard.tsx:248-258` | Colunas `w-[240px]` + drag HTML5: **DnD não funciona em touch**; scroll horizontal pesado no iOS | Fase separada: colunas `w-[85vw] sm:w-[240px]` + `snap-x snap-mandatory`; mover card no mobile via menu/long-press (dropdown "Mover para...") em vez de DnD |
| 🟠 | `LossReasonModal.tsx:85` | `sm:max-w-[425px]` sem largura mobile | `w-[95vw] sm:max-w-[425px]` |
| 🟠 | `DealConversationModal.tsx:233` | `max-w-2xl h-[80vh]` — ok em largura (w-full default), revisar input area em 360px | testar; ajustar paddings |
| 🟢 | `CRM.tsx:11` | Página já usa `px-3 md:px-6` | — |

### 2.4 Agenda (`src/pages/Scheduling.tsx` + `src/components/scheduling/`)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `Scheduling.tsx:467-502` | Sidebar rail expande SÓ com `onMouseEnter` — **inacessível em touch** (tablets 768–1024px sem acesso aos filtros) | detectar touch (`matchMedia("(hover: none)")`) → expandir por clique no rail; manter hover no desktop |
| 🔴 | `SchedulingCalendar.tsx:26,276,288` | `HOUR_HEIGHT=120` + colunas `min-w-[120px]`: dia de 14h = 1680px de altura; 4+ profissionais = scroll horizontal pesado | `HOUR_HEIGHT` responsivo (80 mobile / 120 desktop, tudo deriva de `PX_PER_MIN`); colunas `min-w-[140px]` no touch com snap; visão solo como padrão mobile é alternativa |
| 🔴 | `AppointmentModal.tsx` | DialogContent sem `max-h` + overflow — formulário longo transborda viewport mobile | `max-h-[90vh] overflow-y-auto` + footer sticky |
| 🔴 | `ServiceCascadePicker.tsx:83` | `grid-cols-3` fixo (3 selects lado a lado) — ilegível < 640px (afeta SaleModal, NegotiationQuickModal, AppointmentModal) | `grid-cols-1 sm:grid-cols-3` |
| 🟠 | `Scheduling.tsx:391,425` | Header: busca `w-[40rem]` (640px!), muitos controles — 4-5 linhas em mobile | busca `w-full md:w-[40rem]`; compactar controles com `flex-wrap` ordenado |
| 🟠 | `SchedulingCalendar.tsx:387-464` | Hover-card flutuante `w-64 right-0` sai da tela em coluna estreita; hover não existe no touch | mobile: tap abre o modal direto (comportamento já existe via clique); card flutuante só `md:`; posicionamento `left-1/2 -translate-x-1/2 sm:right-0` |
| 🟢 | `SchedulingCalendar.tsx:174-193` | Nome do profissional `max-w-[60px]` truncado demais | `max-w-[80px] sm:max-w-[120px] md:max-w-none` |
| 🟢 | `SchedulingCalendar.tsx:554-574` | Paginação de profissionais `gap-2` apertado | `gap-1 sm:gap-2` + botões ≥40px |
| ✅ | `Scheduling.tsx:396` | Toggle mobile do sidebar já existe (`isSidebarOpen`) | — |

### 2.5 Contatos (`src/pages/Contacts.tsx`)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `Contacts.tsx:624-644` | Tabela 8+ colunas; já esconde algumas (`hidden sm/md/lg:table-cell`) mas larguras `%` espremem Telefone/Categoria em 480–768px | revisar conjunto mínimo mobile (Nome, Telefone, Ações), larguras `min-w` em vez de `%`, manter `overflow-x-auto` |
| 🟠 | `Contacts.tsx:442-500` | 5+ botões de filtro (canais + categorias) — já tem `flex-wrap`, gap grande | `gap-1 sm:gap-2`; considerar `Select` de categoria em < 640px |
| 🟢 | Etiquetas (ícones + tooltip) | Tooltip é hover-only — no touch o nome da tag não aparece | tooltips Radix respondem a tap; validar em touch real |

### 2.6 Campanhas (`src/pages/Campaigns.tsx` + wizard)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `CampaignWizard.tsx:533` | `sm:max-w-2xl` SEM largura base mobile → em < 640px usa o default e pode estourar | `w-[95vw] sm:w-full sm:max-w-2xl` (manter `max-h-[90vh] overflow-y-auto` ✅ já existe) |
| 🔴 | `CampaignContactsTable.tsx` | (mesma da dash — item 2.2) sem overflow-x | corrigir uma vez, vale para os 2 lugares |
| 🟠 | `CampaignCard.tsx:197` (grid resultados) | `grid-cols-2 sm:grid-cols-4` — 4 col apertado em 640–768px | `grid-cols-2 md:grid-cols-4` (também no CampaignExpandableCard) |
| 🟠 | `MetaQualityPanel.tsx` | Grade de métricas — validar breakpoints das células | inserir degraus `sm:`/`md:` conforme necessário |
| 🟠 | Wizard steps (6 passos + audience builders) | Steps com formulários largos dentro do modal | validar cada step a 360px após corrigir o DialogContent |

### 2.7 Serviços (`src/pages/ProductsServices.tsx` + `src/components/services/`)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `AddByCategoryModal.tsx:251`, `AddServiceModal.tsx:260`, `DirectEntryModal.tsx:135`, `EditApplicationModal.tsx:126`, `AddApplicationModal.tsx:97` | Todos com `max-w-2xl`/`max-w-4xl` sem fallback mobile | padrão global de modal (ver §3.1) |
| 🟢 | `ProductsServices.tsx:119` | Search `max-w-md` | `w-full sm:max-w-md` |

### 2.8 Equipe, Configurações, IA

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🟠 | `Team.tsx:372,532` | Colunas `min-w-[120px]` forçam overflow | `min-w-[80px] sm:min-w-[120px]` |
| 🟢 | `TeamPage.tsx:31-40` | Abas já responsivas (`flex-1`, `text-xs md:text-sm`) | — |
| 🟢 | `Settings.tsx:598` | Grid já `grid-cols-1 md:grid-cols-2` | — |
| 🟠 | `IAConfig.tsx` | Página longa (1500+ linhas, 3 abas) — validar formulários e switches a 360px | varredura dedicada na implementação |
| 🟠 | `Connections.tsx` / `Templates.tsx` / `AutomaticMessages.tsx` | Cards de instância e tabela de templates — validar em 360px | varredura dedicada na implementação |

### 2.9 Páginas públicas (PRIORIDADE MOBILE)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🔴 | `PublicBooking.tsx:306` | Calendário `grid-cols-7 gap-1` — apertado em ≤360px | `gap-0.5 sm:gap-1` + padding reduzido nos dias |
| 🟠 | `PublicBooking.tsx:336` | Horários `grid-cols-4` fixo | `grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2` |
| 🟠 | `PublicBooking.tsx:268` | Profissionais `grid-cols-2` fixo (não aproveita tablet) | `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` |
| 🟠 | `Auth.tsx:337-430` | Signup 12+ elementos em coluna — scroll longo | `space-y-2 md:space-y-3` |
| ✅ | `Auth.tsx:228` | Card `w-full max-w-md` correto | — |

### 2.10 Outras (InternalInbox, Tasks, Sales, Financial, Recurrence)

| Sev | Arquivo:linha | Problema | Correção proposta |
|-----|---------------|----------|-------------------|
| 🟠 | `InternalInbox.tsx:293-298` | Sidebar `hidden lg:flex` — em tablet (768–1024px) abrir chat esconde a lista sem volta fácil | trocar `lg:` por `md:` |
| 🔴 | `SalesTable.tsx:163` | Table dentro de Card sem `overflow-x-auto` | wrapper `overflow-x-auto` |
| 🟠 | `SalesCards.tsx:134` | `grid-cols-2` mobile — cards de valor espremidos | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5` + `p-3 sm:p-4` |
| 🟠 | `Sales.tsx:94,111` | Selects `w-[140px]`/`w-[100px]` fixos | `w-full sm:w-[140px]` |
| 🟠 | `Financial.tsx` | Charts — validar container `max-w-full` | `w-full max-w-full` + altura condicional |
| 🟠 | `Recurrence.tsx:147` | Row de filtros com wrap desordenado 640–768px | grid explícito `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` |
| ✅ | `RecurrenceMonthTable.tsx:62` | Já tem `overflow-x-auto` + colunas `hidden sm/md/lg:table-cell` | — |
| 🟢 | `Tasks.tsx:61-87` | Header ok, apenas polish de gaps | `gap-1` mobile |

**Páginas legadas fora do escopo** (não estão no menu, sem uso ativo): Patients, Queues, QueuesManager, Delivery, Reports, BusinessReports, FollowUp, AutoMessages, Support, Team (rota antiga /team — manter só o essencial), WhatsAppConnectionTeste, DevManager. Não serão adaptadas.

---

## 3. Plano de implementação (passo a passo)

Princípios: mobile-first nos ajustes; nunca alterar visual desktop (mudanças são aditivas com prefixos `sm:`/`md:`/`lg:`); uma etapa = um commit deployável; teste em 360px, 390px, 768px, 1024px e 1280px (DevTools) ao final de cada etapa.

### Etapa 1 — Padrão global de modais (P1) — ~10 arquivos
1. Definir e aplicar o padrão em todos os `DialogContent` com problema:
   - Modal pequeno: `w-[95vw] sm:w-full sm:max-w-md`
   - Modal médio: `w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto`
   - Modal grande: `w-[95vw] sm:max-w-2xl md:max-w-4xl max-h-[90vh] overflow-y-auto`
2. Arquivos: CampaignWizard, AddByCategoryModal, AddServiceModal, DirectEntryModal, EditApplicationModal, AddApplicationModal, LossReasonModal, TemplatePickerModal, ForwardMessageModal, NewMessageModal, AppointmentModal (este + footer sticky).
3. Grep de verificação: `max-w-(2xl|4xl|6xl|\[4\d\dpx\])` em DialogContent sem `w-[95vw]`.

### Etapa 2 — Tabelas (P2) — 4 arquivos
1. `CampaignContactsTable`: wrapper `overflow-x-auto` + `min-w-[500px]` (corrige dash + /campanhas de uma vez).
2. `SalesTable`: wrapper `overflow-x-auto`.
3. `Contacts.tsx`: revisar larguras (min-w no lugar de %), conjunto mínimo de colunas mobile.
4. `Team.tsx`: `min-w-[80px] sm:min-w-[120px]`.

### Etapa 3 — ClientProfileModal (crítico isolado)
1. `TabsList` → `overflow-x-auto flex-nowrap` com `shrink-0 px-3` nos 9 triggers (scroll horizontal).
2. Validar cada aba a 360px (tabelas internas ganham `overflow-x-auto` se preciso).

### Etapa 4 — Grids e KPIs (P3) — dashboard + campanhas + vendas
1. Dashboard: CampanhasKpiCards, IndicadoresSection, RankingsSection, StageStatusCards, StageBoard, OcupacaoSection (grid + altura chart via `useIsMobile`).
2. Campanhas: CampaignCard/CampaignExpandableCard (grids de métricas/resultados).
3. Vendas: SalesCards, selects do header de Sales.
4. TabsList da Dashboard com `overflow-x-auto` se necessário.

### Etapa 5 — PublicBooking + Auth (páginas públicas)
1. Calendário `gap-0.5 sm:gap-1`, horários `grid-cols-3 sm:grid-cols-4`, profissionais `sm:grid-cols-3 md:grid-cols-4`.
2. Auth signup `space-y-2 md:space-y-3`.
3. Teste real em viewport 360px (fluxo completo de agendamento).

### Etapa 6 — Agenda (P4/P5) — a mais delicada
1. Sidebar: detectar touch (`matchMedia('(hover: none)')` num hook) → rail expande por clique; desktop mantém hover.
2. Header: busca `w-full md:w-[40rem]`, controles compactados.
3. Calendário: `HOUR_HEIGHT` condicional (80 mobile / 120 desktop) — **atenção**: tudo deriva de `PX_PER_MIN`, alterar de forma consistente; colunas com snap scroll; nome do profissional `max-w` escalonado.
4. Hover-card flutuante: visível só `md:`+; no touch, tap já abre o modal.
5. AppointmentModal já corrigido na Etapa 1 — validar fluxo completo mobile.
6. `ServiceCascadePicker` → `grid-cols-1 sm:grid-cols-3` (revalidar SaleModal/NegotiationQuickModal juntos).

### Etapa 7 — Inbox (3 painéis + popovers)
1. Popovers do MessageInput: `w-[calc(100vw-2rem)] sm:w-[...]` (4 popovers).
2. ChatHeader: `max-w` escalonado do nome.
3. ConversationsList: gaps/dropdown `max-w-[90vw]`.
4. AIIntelligenceSidebar: `w-[min(320px,calc(100vw-60px))]` + toggle por clique no touch.
5. Sheet de ações do Index: `w-[min(90vw,350px)]`.

### Etapa 8 — CRM kanban mobile (P6 — maior esforço)
1. Colunas: `w-[85vw] sm:w-[240px]` + `snap-x snap-mandatory` no container (1 coluna por "página" no celular).
2. Mover card sem DnD: no touch, menu no card ("Mover para etapa...") — reusa handleDrop existente; DnD continua no desktop.
3. Validar modais do kanban (já cobertos na Etapa 1).

### Etapa 9 — Diversos + varredura final
1. InternalInbox `lg:`→`md:`; Recurrence filtros; Financial charts; Tasks gaps; ProductsServices search; IAConfig e Connections (varredura dedicada a 360px).
2. Varredura final com grep dos anti-padrões: `w-\[\d+px\]` sem breakpoint, `grid-cols-[3-9]` sem `sm|md`, `DialogContent` sem largura mobile, `onMouseEnter` sem alternativa touch.
3. Checklist de QA (§4).

**Ordem recomendada:** 1 → 2 → 3 → 5 (público) → 4 → 7 → 6 → 8 → 9.
Etapas 1–5 são de baixo risco e alto impacto (~80% das reclamações); 6 e 8 mexem em interação e pedem mais teste.

---

## 4. Checklist de QA (por etapa e no final)

- [ ] 360px (Galaxy S/pequenos) — retrato
- [ ] 390–430px (iPhone 14/15/Pro Max) — retrato
- [ ] Landscape smartphone (~800×390)
- [ ] 768px (iPad mini/Air retrato)
- [ ] 1024px (iPad landscape / laptop pequeno)
- [ ] 1280px (notebook comum) — garantir que NADA mudou no desktop
- [ ] Sem scroll horizontal na página (só em wrappers intencionais)
- [ ] Modais: header e botões de ação sempre visíveis; conteúdo scrolla
- [ ] Touch: tudo que era hover tem alternativa por toque
- [ ] Kanban: mover card funciona no celular (menu) e no desktop (DnD)
- [ ] Agenda: criar/editar agendamento completo num viewport 390px
- [ ] PublicBooking: fluxo completo de agendamento a 360px
- [ ] `npm run build` verde ao fim de cada etapa

---

## 5. Riscos e observações

1. **Não regressão desktop:** todas as mudanças usam prefixos responsivos aditivos; o risco maior é em `SchedulingCalendar` (posicionamento por px) e no kanban (DnD) — Etapas 6 e 8 por último e com QA reforçado.
2. **Radix/shadcn:** `DialogContent` é `display:grid` (pitfall conhecido) — modais com altura fixa precisam `flex flex-col` + `shrink-0` no header; ScrollArea viewport é `display:table` (fix conhecido `[&_[data-radix-scroll-area-viewport]>div]:!block`).
3. **Linhas citadas** podem deslocar levemente conforme o código evolui — reconfirmar no momento da implementação de cada etapa.
4. **Páginas legadas** (fora do menu) ficam fora do escopo — adaptá-las seria esforço sem retorno.
5. Nenhuma dependência nova (sem framer-motion, sem lib de DnD) — tudo com Tailwind + hooks existentes.
