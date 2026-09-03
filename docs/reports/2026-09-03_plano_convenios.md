# Plano de implementação — Convênios

Data: 2026-09-03. Status: aprovado nas decisões, aguardando execução.

## 1. O que a funcionalidade faz

Fluxo do cliente:

```
Cria um convênio  ->  Atrela serviços (apto para convênio)
                  ->  Atrela salas que podem atender
                  ->  Define, na sala, os dias e horários DEDICADOS a convênio
```

Efeitos:

- O payload da IA passa a ter uma seção `convenios` e cada serviço apto ganha o sufixo `(apto para convênio)`.
- As APIs de busca de horário ganham o campo `convenio`; as faixas dedicadas somem das buscas normais.
- A agenda pinta as faixas dedicadas de amarelo.

## 2. Decisões travadas com o user (não reabrir sem ordem dele)

| # | Decisão |
|---|---|
| D1 | O vínculo sala↔convênio é **bidirecional**: editável na aba Convênios (lista de salas) **e** no modal da sala (ao ligar o switch, abre um modal "todos os convênios" x "apenas selecionados"). Mesma relação, dois pontos de entrada — igual ao par profissional↔serviço de hoje. |
| D2 | A janela de convênio vive **só dentro do expediente** da sala. Fora de `work_days`/`work_hours`, ou em cima do intervalo, ela é ignorada (e a UI avisa). |
| D3 | O agendamento é marcado: `appointments.convenio_id`. |
| D4 | O link público **enxerga** convênio: se o serviço escolhido for apto, o paciente escolhe se é convênio e qual. Se a conta ligou "todos os convênios", ele só escolhe sim/não. |
| D5 | O legado `ia_config.convenio` é **aposentado e migrado** (6 convênios em 3 contas). Coluna fica no banco sem leitura/escrita. |
| D6 | Parâmetro da API: `convenio: "sim"\|"nao"` + `convenio_nome` opcional. **Ausente = `"nao"`**. Com `convenio="nao"`, `convenio_nome` é IGNORADO (a IA pode preencher por engano). |
| D7 | Com `convenio="sim"`, o serviço precisa ser apto — senão erro claro. A IA já manda `service_name` em toda consulta (precisa dele para saber a duração e não encavalar). |
| D8 | "Habilitar todos os convênios" é um switch no topo da aba, com descrição opcional. **Implementado como uma linha de `convenios` com `is_catch_all = true`** (não como flag em `ia_config`): assim ele também tem serviços aptos e salas vinculadas, sem o que D7 ficaria insatisfazível. Ligado, ele vence a lista cadastrada — que fica guardada, sem uso. |

Regra herdada que **continua valendo**: o encaixe manual pela agenda é livre (`AppointmentModal` não valida slot/folga). A janela de convênio restringe **IA, APIs e link público**; na agenda ela é informativa (faixa amarela) e o atendente pode encaixar por cima.

## 3. Banco (migration `20260903120000_convenios.sql`)

```sql
-- 3.1 convênios da conta
create table public.convenios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  is_catch_all boolean not null default false,   -- "Habilitado para todos os convênios"
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index convenios_user_nome_uniq
  on public.convenios (user_id, clinvia_normalize_txt(nome)) where active;
-- no máximo um "todos os convênios" por conta
create unique index convenios_user_catchall_uniq
  on public.convenios (user_id) where is_catch_all and active;

-- 3.2 serviços aptos (N:N)
create table public.convenio_servicos (
  convenio_id uuid not null references public.convenios(id) on delete cascade,
  service_client_id uuid not null references public.services_client(id) on delete cascade,
  primary key (convenio_id, service_client_id)
);

-- 3.3 salas que atendem (N:N)
create table public.convenio_salas (
  convenio_id uuid not null references public.convenios(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  primary key (convenio_id, professional_id)
);

-- 3.4 janela dedicada na sala
alter table public.professionals
  add column if not exists convenio_enabled     boolean not null default false,
  add column if not exists convenio_all         boolean not null default true,
  add column if not exists convenio_days        integer[] not null default '{}',
  add column if not exists convenio_hours       jsonb,        -- {"start":"14:00","end":"16:00"}
  add column if not exists convenio_use_daily   boolean not null default false,
  add column if not exists convenio_hours_daily jsonb;        -- {"1":{"start":..,"end":..}, ...}

-- 3.5 "habilitar todos" NÃO é flag da conta: é uma LINHA de convenios com
-- is_catch_all = true (senão D7 seria insatisfazível — sem convênio, não haveria
-- onde marcar os serviços aptos nem as salas que atendem).

-- 3.6 marcação do agendamento
alter table public.appointments
  add column if not exists convenio_id uuid references public.convenios(id) on delete set null;
create index if not exists idx_appointments_convenio on public.appointments(convenio_id)
  where convenio_id is not null;
```

`convenio_all = true` → a sala atende qualquer convênio e `convenio_salas` é ignorada para ela. `false` → vale a lista.

**RLS team-aware obrigatória** nas 3 tabelas novas usando `get_owner_id()` (nunca `auth.uid()`), senão supervisor/atendente não enxerga nada — é o pitfall recorrente do projeto (a98fd16).

### Migration do legado (mesma migration, passo final)

Quebra `ia_config.convenio` em blocos por linha em branco, extrai o nome do padrão `^\d+\.\s*(.+)$` e insere em `convenios`. As linhas `- ...` viram `descricao` **apenas quando têm valor diferente de `R$ 0,00` / `0 dias`** (nas 3 contas quase tudo está zerado — virar descrição só ruído polui o prompt da IA). Idempotente via `on conflict do nothing`.

## 4. Backend — edge functions

### 4.1 Novo `_shared/convenio-schedule.ts` (fonte única)

```ts
getConvenioWindowForDay(prof, weekday): { start, end } | null
// espelha getWorkHoursForDay: usa convenio_hours_daily quando convenio_use_daily,
// senão convenio_hours. Retorna null se !convenio_enabled ou weekday ∉ convenio_days.

convenioWindowMinutes(prof, weekday, workHours): { startMin, endMin } | null
// aplica D2: intersecta a janela com [work start, work end] e remove o intervalo.
// Se a interseção ficar vazia, retorna null (janela mal configurada = inexistente).

slotBlockedByConvenio(m, duration, win): boolean   // usado quando convenio="nao"
slotInsideConvenio(m, duration, win): boolean      // usado quando convenio="sim"
```

Regra dos dois modos, idêntica nas 3 APIs:

- `convenio="nao"` (default): mantém tudo como hoje, **menos** os slots que encostam na janela dedicada da sala. Sala com `convenio_enabled=false` não muda nada.
- `convenio="sim"`: considera **apenas** salas com `convenio_enabled=true` e (`convenio_all=true` **ou** ligada ao `convenio_nome` informado); dentro dessas salas, **apenas** slots contidos na janela.

### 4.2 Arquivos a alterar

| Função | Mudança |
|---|---|
| `api-availability` | Ler `convenio`/`convenio_nome`; estender o `.select` de `professionals` com as 6 colunas novas; aplicar o filtro dentro do loop de `getSlotsForDate`; validar serviço apto (D7). |
| `api-scheduling` | Idem no `.select`; `validateWorkSchedule` passa a validar contra a janela correta (convênio x normal); `create_appointment`/`reschedule` gravam `convenio_id`. |
| `api-public-booking` | `get_services` devolve, por serviço, `convenio_apto` + a lista de convênios da conta (ou o flag "todos"); `get_slots` aceita `convenio`; `create_booking` grava `convenio_id`. **Atenção**: essa função hoje parseia `work_hours` na mão e **não** usa `getWorkHoursForDay` — corrigir junto, senão a janela de convênio brigará com `use_daily_schedule`. |
| `_shared/slot-engine.ts` | Automações não são convênio: passam a excluir as janelas dedicadas (comporta-se como `convenio="nao"`). |
| `webhook-handle-message` | Payload (seção 5). |

**Não tocar** em `check-availability` (legado, isolado por decisão antiga). Consequência conhecida: quem ainda chamar essa função continuará vendo as faixas de convênio. Registrar como dívida.

Redeploy: `api-availability`, `api-scheduling`, `api-public-booking`, `webhook-handle-message`, `delivery-automation-worker`, `delivery-automation-respond` e qualquer outra que importe `slot-engine`/`slot-settings` (o bundler do Deno inclui `_shared` transitivamente).

## 5. Payload da IA (`webhook-handle-message`, bloco `bd_data`)

1. **`services_catalog`** — hoje monta `"Nome (Sala1, Sala2)"`. Passa a `"Nome (Sala1, Sala2) (apto para convênio)"`.
   *Pitfall*: o catálogo é montado por `service_name`, mas o vínculo de convênio vive em `services_client`. Um `service_name` é apto quando **qualquer** `services_client` dele for apto.
2. **Nova seção `convenios`**:
   - existe convênio `is_catch_all` ativo → `["Habilitado para todos os convênios"]`, ou `["Habilitado para todos os convênios — <descrição>"]`.
   - senão → um item por convênio ativo: `"Nome"` ou `"Nome — descrição"`.
   - nenhum convênio cadastrado → `[]`.

Fora do repo: o **prompt do n8n** precisa aprender a mandar `convenio`/`convenio_nome`. Sem isso a IA nunca agenda por convênio (mas nada quebra — o default `"nao"` preserva o comportamento atual).

## 6. Frontend

### 6.1 Novo `src/components/services/ServiceCategoryPicker.tsx`

Extração do picker de pastas do `CampaignWizard.tsx` (linhas 889–947) para um componente compartilhado, **acrescentando o checkbox na categoria** (marca/desmarca todos os serviços dela, com estado indeterminado).

Props: `value: string[]`, `onChange`, `showPrice?`, `showCategoryCheckbox?`, `emptyLabel?`.

Consumidores: aba Convênios, `ProfessionalModal` e o próprio `CampaignWizard`. Campanhas entra por último e precisa de regressão (hoje ela exibe preço e não tem checkbox de categoria).

### 6.2 Aba Convênios em `/equipe`

`src/pages/TeamPage.tsx`: novo `TabsTrigger value="convenios"` **entre `salas` e `permissions`** (persistência via `useUrlTab` já existente → `?tab=convenios`). Gating igual ao de Salas.

- `src/components/team/ConveniosTab.tsx` — switch "Habilitar todos os convênios" + descrição opcional no topo; lista de convênios; botão Adicionar.
- `src/components/team/ConvenioModal.tsx` — Nome, Descrição (opcional), `ServiceCategoryPicker`, seleção de salas.

### 6.3 `ProfessionalModal` (a mudança maior)

1. **Serviços**: troca as badges achatadas (linhas 468–486) pelo `ServiceCategoryPicker`. A gravação continua no `services_client.professionals` (UUID[]) — **não** mexer nessa parte.
2. **Atendimento de Convênio**, logo abaixo de "Dias de Atendimento":
   - Switch on/off (`convenio_enabled`).
   - Ao ligar, abre `ConvenioScopeModal`: "todos os convênios" x "apenas selecionados" (grava `convenio_all` + `convenio_salas`).
   - Seletor de dias + "Configurar horário individualmente", espelhando o bloco existente, mas **só Início e Fim** (sem intervalo).
   - Validação D2 na UI: dia fora de `work_days` ou horário fora do expediente/em cima do intervalo → aviso e bloqueio do salvamento.

### 6.4 Agenda

`SchedulingCalendar.tsx`: faixa amarela nas janelas dedicadas. **Não** reaproveitar o grid de fundo — ele é pintado hora a hora (`parseInt(hour)`), então uma janela 14:30–16:30 sairia errada. Renderizar como camada absoluta abaixo dos eventos, posicionada por `PX_PER_MIN` (mesma matemática do `getEventStyle`), com selo "Convênio". Agendamento com `convenio_id` ganha selo com o nome do convênio.

`SchedulingMonthView` / `useProfessionalMonthBlocks`: sem mudança — a janela vive dentro do expediente (D2), então a conta de ocupação não muda.

### 6.5 Outros

- `PublicBooking.tsx`: passo "Particular x Convênio" quando o serviço for apto (D4).
- `AppointmentModal`: select opcional de convênio no encaixe manual (grava `convenio_id`), sem impor a janela.

## 7. Documentação (obrigatória, mesmo commit)

- `src/components/suporte/EquipeGuide.tsx` — seção Convênios (cadastro, vínculo de serviços/salas, switch "todos").
- `src/components/suporte/AgendaGuide.tsx` — o que significa a faixa amarela.
- `src/lib/suporteTours.ts` — tour `convenio-cadastrar` + `data-tour` nas âncoras.
- `supabase/functions/_shared/support-knowledge.ts` — tópico novo (resolves/steps/gotchas) → exige `npx supabase functions deploy support-ai-chat`.

## 8. Ordem de execução

1. Migration (schema + RLS + migração do legado) e conferência com `db query`.
2. `_shared/convenio-schedule.ts`.
3. APIs (availability → scheduling → public-booking → slot-engine) + payload.
4. `ServiceCategoryPicker`.
5. Aba Convênios.
6. `ProfessionalModal`.
7. Agenda + PublicBooking + AppointmentModal.
8. Limpeza do legado em `IAConfig.tsx`.
9. Docs + `support-ai-chat`.
10. Commit + push + deploy de todas as functions afetadas. Deploy do frontend fica com o user.

## 9. Riscos mapeados

| Risco | Mitigação |
|---|---|
| Mudança silenciosa de comportamento nas buscas atuais | `convenio_enabled` nasce `false` em 100% das 50 salas → contas sem convênio não sentem nada. |
| IA mandar `convenio_nome` com `convenio="nao"` | D6: campo ignorado nesse caso. |
| Janela mal configurada (fora do expediente) | D2 + `convenioWindowMinutes` retorna `null` → a janela simplesmente não existe, nunca some com a agenda inteira. |
| `api-public-booking` não usa `getWorkHoursForDay` | Corrigir junto, senão convênio + horário por dia divergem. |
| Faixa amarela desalinhada | Camada absoluta por minuto, não o grid por hora. |
| Regressão no wizard de campanhas | Campanhas é o último consumidor a migrar para o picker compartilhado. |
| `check-availability` legado ignora convênio | Dívida registrada; função fora do fluxo novo. |
| Editar `_shared` sem redeployar tudo | Lista de redeploy na seção 4.2. |
