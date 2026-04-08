# Auditoria Completa - Sistema de Mensagens Automaticas

**Data:** 2026-04-08
**Projeto:** Clinvia
**Supabase Project ID:** swfshqvvbohnahdyndch

---

## Resumo Executivo

| Metrica | Valor |
|---------|-------|
| Testes automatizados | **61/61 passaram** |
| Bugs corrigidos | **8** |
| Edge functions deployadas | **2** (process-auto-messages v12, process-auto-follow-up v30) |
| Migration aplicada | **1** (fix_auto_message_logs_delete_policy) |
| Erros TypeScript | **0** |

---

## Arquitetura do Sistema

### Componentes
1. **process-auto-messages** (edge function, cron */10) - Processador principal
2. **process-auto-follow-up** (edge function, cron */2) - Follow-ups automaticos
3. **send-satisfaction-survey** (edge function, invocada sob demanda) - Pesquisa NPS
4. **webhook-handle-message** (edge function) - Recebe respostas NPS
5. **AutoMessages.tsx** (frontend) - Interface de configuracao

### Trigger Types (10 tipos)
| Trigger | Modo | Janela |
|---------|------|--------|
| appointment_created | Targeted + Cron | 24h |
| appointment_reminder | Cron | hoursVal (config) |
| appointment_day_reminder | Cron | hoursVal (config) |
| appointment_cancelled | Targeted + Cron | 24h |
| appointment_post_service | Cron | 7 dias |
| crm_stage_enter | Targeted + Cron | 24h |
| crm_after_days | Cron | Sem limite (dedup) |
| crm_stagnation | Cron | Sem limite (dedup) |
| conversation_resolved | Targeted + Cron | 7 dias |
| patient_birthday | Cron | Janela 15 min/dia |

### Deduplicacao
- Tabela `auto_message_logs` com unique index `(auto_message_id, entity_id)`
- `alreadySent()` verifica antes de cada envio
- `alreadySentThisYear()` para aniversarios (permite 1 envio/ano)
- `logSent()` registra apos envio bem-sucedido

---

## Bugs Encontrados e Corrigidos

### BUG 1: sendWhatsApp sem timeout (CRITICO)
- **Problema:** Chamada fetch para UZAPI sem AbortController. Se a API travasse, o cron inteiro ficaria bloqueado.
- **Correcao:** Adicionado `AbortController` com timeout de 10 segundos em `sendWhatsApp()`.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linhas 79-110)

### BUG 2: appointment_created - janela estreita de 15 min (ALTO)
- **Problema:** Usava `windowStart` (15 min). Com cron a cada 10 min, se o agendamento fosse criado entre ciclos, a mensagem nunca seria enviada.
- **Correcao:** Janela ampliada para 24h com deduplicacao via `alreadySent()`.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linha 456)

### BUG 3: appointment_cancelled - janela estreita de 15 min (ALTO)
- **Problema:** Mesmo problema do BUG 2 para cancelamentos.
- **Correcao:** Janela ampliada para 24h com filtro por `updated_at`.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linha 548)

### BUG 4: crm_stage_enter - janela estreita de 15 min (ALTO)
- **Problema:** Deals que mudavam de etapa entre ciclos do cron nao recebiam mensagem.
- **Correcao:** Janela ampliada para 24h com filtro por `stage_changed_at`.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linha 639)

### BUG 5: crm_after_days - janela desnecessaria (MEDIO)
- **Problema:** Usava janela temporal estreita para algo que deveria ser "apos X dias".
- **Correcao:** Removido filtro `.gte()`, usa apenas `.lte("stage_changed_at", cutoffDate)` + dedup.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linhas 679-687)

### BUG 6: conversation_resolved (satisfacao) - janela estreita (ALTO)
- **Problema:** Conversas resolvidas fora da janela de 15 min nunca recebiam pesquisa NPS.
- **Correcao:** Janela ampliada para 7 dias, combinada com `nps_sent_at IS NULL`.
- **Arquivo:** `supabase/functions/process-auto-messages/index.ts` (linhas 755-757)

### BUG 7: Follow-up envia para conversas resolvidas (MEDIO)
- **Problema:** `process-auto-follow-up` nao verificava status da conversa. Podia enviar mensagem para conversas ja resolvidas ou fechadas.
- **Correcao:** Adicionado filtro `conv.status` que ignora conversas com status diferente de `pending`/`open`.
- **Arquivo:** `supabase/functions/process-auto-follow-up/index.ts` (linhas 117-121)

### BUG 8: Follow-up sem timeout no fetch (MEDIO)
- **Problema:** Chamada fetch sem AbortController. API travada bloquearia o cron.
- **Correcao:** Adicionado `AbortController` com timeout de 10s e tratamento de AbortError.
- **Arquivo:** `supabase/functions/process-auto-follow-up/index.ts` (linhas 171-196)

---

## Migration Aplicada

### fix_auto_message_logs_delete_policy
- **Problema:** Tabela `auto_message_logs` nao tinha policy para DELETE/UPDATE com service_role.
- **Correcao:** Adicionadas policies permissivas para DELETE e UPDATE via service_role.

---

## Testes Automatizados

Arquivo: `tests/test_auto_messages.py`

### Cobertura (61 testes)

#### Edge Function: process-auto-messages (24 testes)
- 10 trigger types verificados
- Deduplicacao (alreadySent)
- Log de envio (logSent chamada 13x)
- Substituicao de variaveis (applyVariables)
- Timeout no envio (AbortController)
- Janelas amplas para appointment_created e cancelled
- Pesquisa de satisfacao via edge function dedicada
- Tracking nps_sent_at
- Timezone America/Sao_Paulo
- Horario de envio de aniversario (isInSendWindow)
- Deduplicacao anual para aniversarios
- Modo targeted (instant dispatch)
- Salvamento de mensagem no DB
- Busca de conversa

#### Edge Function: send-satisfaction-survey (8 testes)
- 5 botoes NPS (nps_1 a nps_5)
- 5 opcoes de avaliacao (Excelente a Ruim)
- Salvamento de mensagem
- Fallback de instancia
- Endpoint /send/menu

#### Edge Function: process-auto-follow-up (8 testes)
- Filtro auto_send=true
- Filtro next_send_at
- Verificacao de status da conversa
- Verificacao de instancia conectada
- Sequenciamento de templates
- Marcacao de conclusao
- Salvamento de mensagem
- Timeout no envio

#### Webhook NPS Handling (4 testes)
- Deteccao de resposta NPS
- Conversa permanece resolved apos NPS
- Salvamento de nota NPS via RPC
- Atualizacao de nps_sent_at

#### Frontend AutoMessages.tsx (17 testes)
- UI para 8 trigger types
- 3 tabs (Agenda, CRM, Satisfacao)
- UI de variaveis (VarChip/useVariableInserter)
- Logica de upsert
- Configuracao de timing
- Verificacao IA ativa
- Seletor de instancia

---

## Cron Jobs Ativos

| Job | Funcao | Intervalo |
|-----|--------|-----------|
| #17 | process-auto-messages | */10 (a cada 10 min) |
| #7 | process-auto-follow-up | */2 (a cada 2 min) |
| #6 | auto_complete_appointments | */5 (a cada 5 min) |

---

## Padrao Broad Window + Dedup

O sistema agora segue um padrao consistente:
1. **Janela ampla**: Busca entidades em um periodo largo (24h, 7 dias, etc.)
2. **Deduplicacao**: `alreadySent()` checa `auto_message_logs` antes de enviar
3. **Log**: `logSent()` registra envio com unique constraint
4. **Resultado**: Primeiro ciclo do cron envia; ciclos seguintes ignoram via dedup

Isso elimina o risco de perder mensagens quando eventos ocorrem entre ciclos do cron.

---

## Status Final

| Componente | Status |
|------------|--------|
| process-auto-messages | DEPLOYED (v12) - 6 bugs corrigidos |
| process-auto-follow-up | DEPLOYED (v30) - 2 bugs corrigidos |
| send-satisfaction-survey | OK (sem alteracoes necessarias) |
| webhook-handle-message | OK (NPS handling correto) |
| AutoMessages.tsx (frontend) | OK (UI completa para todos os triggers) |
| auto_message_logs (RLS) | CORRIGIDO (DELETE/UPDATE policies adicionadas) |
| Testes automatizados | 61/61 passando |
| TypeScript build | 0 erros |
