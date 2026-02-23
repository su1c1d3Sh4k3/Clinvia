# Manual - Agendamentos

Calendário de atendimento por profissional, com integração Google Calendar bidirecional.

> **Acesso**: Menu lateral → submenu **"Administrativo"** → **"Agendamentos"** → `/scheduling`

---

## Estrutura da Página

### Barra Superior
- **Navegação de data**: botões < > e "Hoje"
- **Busca de cliente**: busca por nome ou telefone entre os agendamentos do dia
- **Sincronizar Google** ☁️: aparece quando há conta Google conectada — dispara sincronização manual
- **Relatório Diário**: gera PDF com todos os agendamentos do dia

### Sidebar Esquerda — Filtro de Serviços
- Lista todos os serviços com checkboxes
- Selecionar um serviço → mostra apenas profissionais que oferecem aquele serviço
- Múltiplos serviços podem ser selecionados ao mesmo tempo
- Colapsável no desktop; oculta por padrão no mobile

### Grade de Profissionais
- Cada **coluna** = um profissional
- Cada **linha** = um horário (ex: 08:00, 08:30...)
- **Bloqueio cinza** = horário de intervalo (almoço/break) — não agendável
- **Cards coloridos** = agendamentos com cor da borda identificando o serviço

---

## Tipos de Evento

| Tipo | Descrição |
|------|-----------|
| **Agendamento** | Consulta ou serviço com cliente |
| **Ausência** | Bloqueio de horário sem cliente (folga, reunião) |

---

## Status do Agendamento

| Status | Cor |
|--------|-----|
| Pendente | Amarelo |
| Confirmado | Verde |
| Concluído | Azul |
| Cancelado | Vermelho |
| Reagendado | Roxo |

---

## 🔗 Google Calendar — Integração

### Como Conectar
1. Acesse **Automação → Configurações** da agenda
2. Clique em **"Conectar Google Calendar"**
3. Faça login com conta Google e autorize o acesso
4. Escolha o modo:
   - **Apenas exportar** (`one_way`): agendamentos da Clinbia → Google Calendar
   - **Bidirecional** (`two_way`): Clinbia ↔ Google Calendar (eventos do Google aparecem como bloqueios)

### Sincronização
- **Automática**: ocorre ao abrir a página (se conta conectada)
- **Manual**: botão "Sincronizar Google" na barra superior
- **Token**: renova automaticamente ao abrir a página. Se expirar, desconecte e reconecte

### O que é exportado para o Google Calendar
- Nome do profissional, serviço, paciente/cliente, status, preço e observações

### Problemas de Sincronização
- Verifique se a conta ainda está conectada (Configurações)
- Use o botão de sincronização manual
- Peça à Bia: "Verifica minhas conexões" → ela roda o diagnóstico

---

## Gestão de Profissionais

### Adicionar / Editar Profissional
Clique em **"+ Profissional"** e preencha:
- Nome e função/especialidade
- % Comissão sobre vendas
- Serviços que oferece (define quais serviços aparecem para ele)
- Horário de trabalho por dia da semana (início e fim)
- **Horário de intervalo** (ex: 12:00–13:00) → aparece como bloco cinza no calendário
- Dias de trabalho ativos

---

## Criar Agendamento

1. Clique em um horário disponível na grade
2. Preencha: cliente (busca por nome/telefone), serviço, data/hora, observações e preço
3. Clique em **"Confirmar"**

> A duração do agendamento é definida automaticamente pelo serviço selecionado

---

## Auto-Captura de Venda

Quando um agendamento com preço é marcado como **"Concluído"**:
- O modal de Registro de Venda abre automaticamente
- Confirme para registrar a venda no financeiro
- Feche para ignorar

---

## Relatório Diário

Botão na barra superior → PDF com todos os agendamentos do dia:
horário, profissional, cliente, serviço e status.

---

## O que a Bia pode fazer

| Pedido | Ferramenta usada |
|--------|-----------------|
| "Agendamentos de hoje" | `appointments_get_today` |
| "Agenda da Dra. Ana amanhã" | `appointments_get_by_professional` |
| "Agendar João às 14h com Dr. Pedro" | `appointments_create` |
| "Horários livres hoje" | `appointments_get_availability` |
| "Google Calendar não sincroniza" | `diagnostics_check_connections` |

---

## Problemas Comuns

**Slot aparece ocupado sem agendamento** → pode ser o intervalo (break time) do profissional

**Profissional não aparece na grade** → verifique dias de trabalho e filtro de serviços ativo

**Agendamento não foi para o Google** → clique em "Sincronizar Google" ou reconecte a conta
