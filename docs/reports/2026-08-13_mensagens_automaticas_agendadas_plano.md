# Mensagens Automáticas — Coluna "Agendadas" + Garantia de Sincronização

Data: 2026-08-13
Escopo: painel "Mensagens Automáticas" (dashboard Agendamentos) + cron `appointment-confirmation-cron`

## 1. Objetivo (pedido do cliente)

Adicionar a coluna **Agendadas** em cada um dos 4 templates e garantir o invariante:

> No fim do dia: **Agendadas = Enviadas** e **Enviadas = Entregues + Rejeitadas**

- **Agendadas**: todas as mensagens previstas para o dia, por template
- **Enviadas**: cron rodou e a mensagem saiu
- **Entregue**: recibo de entrega do provedor
- **Rejeitada**: qualquer tipo de erro (inclusive falha ANTES do envio)

## 2. Como o sistema funciona hoje (análise minuciosa)

### 2.1 O cron (`appointment-confirmation-cron`, roda a cada 10 min)

| Fluxo | Janela de disparo | Filtro de agendamento | Template | Dedup |
|---|---|---|---|---|
| confirm_24h | `start_time` em [now+23h, now+25h] | status pending/confirmed/rescheduled | 1 appt = `sys_confirm_24h_v1`; 2+ = `sys_confirm_multi_v1` | sessão (contact+flow+appointment_date) |
| reminder_2h | `start_time` em [now+1h50, now+2h10] | idem | `sys_reminder_2h_v1` | idem |
| feedback_24h | `end_time` em [now-25h, now-23h] | status confirmed/completed/waiting | `sys_feedback_24h_v1` | idem |

Agrupamento: 1 mensagem por **contato+dia** (não por agendamento). Sucesso cria
linha em `appointment_confirmation_sessions`.

### 2.2 O painel atual

`MensagensAutomaticasSection` → RPC `get_automation_template_messages(p_start,p_end)`
(messages vivas UNION `messages_history` arquivado, migration 20260813210000).
Conta só **mensagens que existem** — quem nunca foi enviado é invisível.

### 2.3 Onde o invariante QUEBRA hoje (defeitos encontrados)

1. **Falha de envio não deixa rastro** (`catch { errors++ }` — só log de console).
   O retry acontece implicitamente enquanto o agendamento está na janela (~2h);
   depois disso o envio é perdido PARA SEMPRE. Caso real de hoje (13/08):
   **17 dos 24 agendamentos de 14/08 sem confirmação** — Meta rejeitou com
   `#131037 display name approval` (nome da Fayruss em PENDING_REVIEW), janela
   passou, nunca mais será tentado, e o painel não mostra NADA sobre isso.
2. **Skips silenciosos sem registro** (nenhum vira "Rejeitada"):
   - contato sem `number` (`if (!contact?.number) continue`)
   - appointment sem `contact_id`
   - template não APPROVED na Meta
   - template desabilitado pelo cliente
3. **Agendamento criado "em cima da hora"**: se criado depois que a janela
   23–25h já passou (ex.: agendamento de amanhã 10h criado hoje às 15h), o cron
   nunca o pega — Agendada sem Enviada.
4. **Denominador móvel**: cancelamentos/reagendamentos durante o dia mudam o
   conjunto "Agendadas" — precisa de regra explícita.
5. **`sent` sem recibo**: Meta pode aceitar o envio e nunca mandar recibo de
   delivered nem failed (telefone desligado por dias). Essa mensagem fica
   "Enviada" para sempre → `Entregues + Rejeitadas < Enviadas`. **Não é
   controlável por nós** — precisa de regra de corte (ver Dúvida 1).

## 3. Arquitetura proposta

### 3.1 Nova tabela `automation_send_queue` (fila materializada — fonte da verdade)

```
id uuid PK, user_id uuid, flow_type text, template_name text,
contact_id uuid, appointment_ids uuid[], appointment_date text (dia BRT do appt),
scheduled_for timestamptz  -- quando deve ser enviada (start-24h / start-2h / end+24h)
status text  -- 'scheduled' | 'sent' | 'failed' | 'canceled' | 'skipped'
attempts int, last_error text, message_id uuid, sent_at timestamptz,
UNIQUE (user_id, flow_type, contact_id, appointment_date)
```

### 3.2 Cron ganha 2 passos

1. **Planner** (cada ciclo): projeta os envios das próximas ~26h a partir de
   `appointments` (mesma lógica de agrupamento contato+dia) e faz upsert de
   linhas `scheduled`. Agendamento cancelado antes do envio → `canceled`.
   Reagendado → `scheduled_for` recalculado.
2. **Sender** (substitui a varredura por janela): processa a fila
   (`status='scheduled' AND scheduled_for <= now`):
   - sucesso → `sent` + message_id + cria a sessão (como hoje)
   - erro → `attempts++`, `last_error`, permanece `scheduled` e **retenta a cada
     ciclo** até o deadline (confirm/reminder: até X antes do `start_time`;
     feedback: até o fim do dia) → depois vira `failed` definitivo
   - skips (sem number, template OFF/não aprovado) → `skipped` com motivo

Isso resolve de uma vez: coluna Agendadas, retry do #131037, catch-up de
agendamentos criados em cima da hora, e rastro de toda falha.

### 3.3 Dashboard

- Nova RPC `get_automation_dashboard(p_start, p_end)` retorna por template:
  - **Agendadas** = fila com `scheduled_for` no dia (excluindo `canceled`/`skipped` — ver Dúvida 2/3)
  - **Enviadas** = fila `sent` (+ join com mensagem p/ status de entrega via união messages/messages_history já existente)
  - **Entregues** = mensagem delivered/read
  - **Rejeitadas** = mensagem `failed` (rejeição async Meta) **+ fila `failed`** (nunca saiu)
  - Drill-down por contato com estados: Aguardando envio / Enviada / Entregue / Rejeitada (motivo: `last_error`)
- Frontend: 4ª métrica "Agendadas" no card + linha de status no detalhamento;
  refetch 60s já existe.
- Dias passados: fila é histórica por natureza (nada é deletado) — o problema de
  "zerar após resolver conversa" não se aplica; status de entrega continua vindo
  da união messages/messages_history.

### 3.4 Reconciliação

No fim do dia (ou no próprio painel): banner de alerta quando
`Agendadas ≠ Enviadas + Rejeitadas(fila) + Canceladas` — visibilidade imediata de
qualquer divergência em vez de silêncio.

## 4. Definição de "Agendadas" no dia D (proposta)

| Template | Agendadas do dia D |
|---|---|
| Confirmação 24hs / Múltipla | contatos com envio previsto (`start_time − 24h`) caindo no dia D (BRT) — na prática, agendamentos de D+1 |
| Lembrete | envio previsto `start_time − 2h` no dia D — agendamentos do próprio dia D |
| Feedback | envio previsto `end_time + 24h` no dia D — atendimentos de D−1 |

Contagem por **mensagem** (contato+dia), não por agendamento — consistente com o
que é enviado (Sandra com 2 agendamentos amanhã = 1 Agendada em confirm_multi).

## 5. DÚVIDAS a decidir (destacadas)

1. **`sent` sem recibo de entrega** (telefone desligado; Meta não manda failed):
   quebra `Enviadas = Entregues + Rejeitadas` sem culpa nossa. Proposta: após
   24h sem recibo, exibir como "Rejeitada (sem confirmação de entrega)"?
   Alternativa: manter 3º estado "Enviada (aguardando)" e aceitar que o
   invariante fecha só em ~D+1.
2. **Template desligado pelo cliente**: os contatos contam como Agendadas?
   Proposta: NÃO (card já fica oculto no painel).
3. **Agendamento cancelado antes do envio**: sai de Agendadas ou aparece como
   "Cancelada"? Proposta: sai da contagem (mas fica na fila p/ auditoria).
4. **Deadline de retry do confirm_24h**: retenta até quantas horas antes do
   agendamento? Proposta: até 4h antes (para não colidir com o lembrete de 2h).
5. **UAZAPI**: recibos de entrega da API não oficial são menos confiáveis que os
   da Meta — Entregues/Rejeitadas podem ficar subnotificados nesse provedor.
   Aceitável?
6. **Os 17 de amanhã (14/08)**: com a fila implantada hoje, o planner os pega e
   o sender retenta até a Meta aprovar o nome (#131037). Se o nome não for
   aprovado a tempo, viram `failed` visíveis no painel. Implantar já?

## 6. Ordem de implementação

1. Migration: tabela `automation_send_queue` + RPC `get_automation_dashboard`
2. Cron: passo planner + sender via fila + registro de falha/skip + retry com deadline
3. Frontend: coluna Agendadas + estados no drill-down + banner de divergência
4. Backfill do dia corrente (recriar fila de hoje/amanhã a partir de appointments) para os 17 pendentes entrarem no retry
5. Deploy: migration + `appointment-confirmation-cron` + push frontend
