# Google Calendar desligado por chave — 25/09/2026

## Quem perde alguma coisa hoje: ninguém

Antes de desligar eu medi quem estava usando. O resultado muda o tamanho da tarefa:

| Medição | Resultado |
|---|---|
| Linhas em `professional_google_calendars` | **4** |
| Dessas, **ativas** (`is_active = true`) | **0** |
| Contas donas dessas linhas | **1**, e é `suicideshake@gmail.com` — tenant de teste do desenvolvedor |
| Profissionais envolvidos | "Dr. Ricardo Mendes", "Dra. Camila Torres", "Dra. Sofia Alencar" (fictícios) |
| Criadas em | 22–23/02/2026; **desativadas em 27/02/2026** |
| `appointments` com `google_event_id` preenchido | **0** |
| `appointments` com `google_calendar_sync_id` preenchido | **0** |
| Crons apontando para as functions `google-*` | **0** |
| Incidentes reais da classe `google:*` | **0** |

**Nenhum cliente pagante tinha o Google Calendar conectado.** A sincronia estava
morta havia sete meses sem ninguém notar. Isso não torna o desligamento
desnecessário — ele tira código vivo do caminho e cala uma classe de alerta que
pode disparar a qualquer momento —, mas significa que as duas garantias que mais
preocupavam eram vacuamente verdadeiras desde o começo:

- *"agendamentos existentes não podem quebrar"*: não há agendamento espelhado no
  Google. Zero. Nada podia quebrar.
- *"crons e workers de sincronia desagendados"*: não existiam. A sincronia nunca
  foi por cron — ela era disparada por quem criava/alterava agendamento.

Os quatro gatilhos reais eram: `api-scheduling` (a IA e o n8n), o próprio front
(agenda e modal de agendamento), `delivery-automation-respond` e o webhook de
push do Google. Todos os quatro estão fechados.

## O único incidente aberto da classe era meu

Havia um `google:credencial_recusada` em aberto. Ele **não é tráfego real**: é
uma injeção de teste minha da Etapa 2 do monitoramento, marcada com
`context.zz_teste = true`. Fechei junto com a migration, com a anotação do
motivo em `incidents.notes`. Se eu tivesse deixado, ele ficaria para sempre num
painel cuja causa não existe mais.

## Como o desligamento foi feito

### Uma célula, os dois lados

`llm_platform_settings.google_calendar_enabled` (boolean, `not null`,
default **false**). É a mesma célula que o servidor lê e que o front lê.
Religar é **um `update`**, sem deploy e sem build:

```sql
update public.llm_platform_settings set google_calendar_enabled = true;
```

O servidor obedece em até 5 minutos (cache do helper); o front, em até 5 minutos
(`staleTime` do React Query).

O front **não lê a tabela** — `llm_platform_settings` tem RLS ligada, zero
policies, e guarda o saldo da OpenAI, o e-mail de alerta e as chaves do canal de
alertas. A leitura passa por uma RPC `security definer` que devolve **só o
booleano**, com `search_path` fixo, sem EXECUTE para `anon`/`public`.

### Em erro, desligado

Qualquer falha de leitura (coluna ausente, banco fora, retorno nulo) resolve
para **desligado**, nos dois lados. Um recurso que se religa sozinho quando a
leitura falha é pior que um que fica desligado: ele volta justamente no momento
em que ninguém consegue verificar nada.

### O alerta some porque não é gerado, não porque é filtrado

Este é o ponto mecânico da regra *"suprima na origem, nunca na porta"*.

Em `api-scheduling`, a consulta da chave ficou **dentro** do fire-and-forget que
chamava `google-calendar-sync`. Com a chave desligada, o `fetch` não acontece —
e como o `reportIncident({route: 'google_calendar_sync:*'})` mora no `.catch` e
no ramo de resposta não-ok desse mesmo `fetch`, ele **nunca é alcançado**.
Não há linha nova no `incident_component_catalog`, não há `somente_painel`,
não há filtro na saída. O incidente deixa de existir.

**As 5 functions `google-*` respondem 200, não 503.** Isso não é frouxidão: o
`serveMonitored` relata tudo que é ≥500 e o `relatar()` do `api-scheduling`
relata qualquer resposta não-ok. Um 503 dizendo "desligado" transformaria o
desligamento em incidente a cada chamada — exatamente o que ele foi feito para
evitar. O corpo devolve `success: false` + `skipped: "google_calendar_desativado"`
e a frase humana.

O `google-calendar-webhook` mantém o 200 para o Google (canal que não recebe 200
vira retry eterno), mas não processa nada: nenhum `appointment` é alterado a
partir de evento do Google enquanto a chave estiver desligada.

### Front: a opção some, mas para quem já conectou aparece o aviso

- No cadastro do profissional, o bloco Google Calendar **não renderiza**.
- **Exceção deliberada:** se existe linha em `professional_google_calendars`
  para aquele profissional — ativa **ou não** —, aparece no lugar um aviso
  âmbar "Temporariamente indisponível", dizendo que os agendamentos continuam
  normais na Clinvia, que nada foi apagado e que volta quando o recurso for
  religado. Hoje isso alcança os 4 registros de teste; se algum cliente tivesse
  conectado, ele não veria a funcionalidade sumir em silêncio.
- Na Agenda, a consulta `gcal-active-connection` não roda com a chave
  desligada — e com ela param, de uma vez só, os dois botões "Sincronizar
  Google", o auto-sync de carregamento da página e o handler manual.
- `commitAppointmentDraft` passou a **exigir** `gcalEnabled` no parâmetro. É o
  TypeScript garantindo que nenhuma chamada nova volte a disparar a sincronia
  sem consultar a chave.

### Nada foi apagado

`professional_google_calendars`, `appointments.google_event_id` e
`appointments.google_calendar_sync_id` estão intactos e continuam sendo
gravados/lidos pelo resto do sistema. As 5 edge functions seguem publicadas —
elas apenas não fazem nada. Religar não exige reconstruir nada.

## Verificação

`supabase/tests/security/item_google_calendar_desligado/verify.sql` — leitura
pura, statement único, **9 de 9 ok**: chave presente e em false; RPC existe,
é `security definer` com `search_path` fixo, sem EXECUTE para `anon` e com
EXECUTE para `authenticated`; 4 conexões preservadas, 0 ativas; 0
`google_event_id`; 0 crons; 0 incidentes `google:*` abertos.

Rollback em
`supabase/migrations/20260925120000_google_calendar_desligado_rollback.sql` —
mas atenção: ele derruba a **infraestrutura** da chave. Religar o recurso
**não é esse arquivo**, é o `update` de uma linha mostrado acima.

## O que fica em aberto

- **Sem previsão de retorno.** O manual e a IA de suporte foram atualizados para
  dizer "temporariamente indisponível" e encaminhar para a equipe quem perguntar
  quando volta.
- **Restos sem UI:** linhas de `professional_google_calendars` com
  `professional_id IS NULL` (a antiga "conexão única da clínica") ficaram órfãs
  quando o `SchedulingSettingsModal` foi deletado. Não mexi — são dados, e
  desligar não é hora de apagar.
- **`create-professional-calendar` no cadastro de profissional novo** continua
  no código, guardado por "existe conexão de clínica ativa". Com a chave
  desligada esse `true` é inalcançável (o único escritor, `google-oauth-callback`,
  está fechado) e a function no-opa. Deixei como está para não empilhar guarda
  sobre guarda morta.
- Textos cosméticos que ainda citam o Google (`ViewAppointmentModal` menciona
  "remove o evento do Google Calendar" no diálogo de cancelamento; rótulos de
  ausência importada no `SchedulingCalendar`) não foram alterados: só aparecem
  para quem tem evento do Google, e não existe nenhum.
