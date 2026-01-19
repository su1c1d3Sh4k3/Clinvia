# Manual: Página de Tarefas (/tasks)

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Administrativo"** (ícone de gráfico 📊) e clique em **"Tarefas"** (ícone de lista 📋).

---

## Visão Geral

A página de **Tarefas** é um sistema de gerenciamento de atividades no formato de agenda/calendário. Permite criar, visualizar e organizar tarefas por quadros, com visualização semanal e controle de horários.

---

## Estrutura da Página

### Header (Cabeçalho)

| Elemento | Descrição |
|----------|-----------|
| **Título "Tarefas"** | Identificação da página com ícone de calendário |
| **Seletor de Quadro** | Dropdown para escolher qual quadro visualizar |
| **Botão Configurações (⚙️)** | Abre modal para editar o quadro selecionado |
| **Botão "Novo Quadro"** | Cria um novo quadro de tarefas |
| **Botão "+ Nova Tarefa"** | Abre modal para criar uma nova tarefa |

### Área Principal

Exibe o **TaskBoard** (quadro de tarefas) em formato de calendário semanal:
- Linhas = horários (de acordo com configuração do quadro)
- Colunas = dias da semana
- Cards coloridos = tarefas agendadas

---

## O que é um Quadro de Tarefas?

Um quadro é como uma agenda personalizada. Cada quadro pode ter:
- **Nome próprio** (ex: "Agenda Comercial", "Atendimento")
- **Horário de funcionamento** (hora início e fim)
- **Intervalo entre slots** (ex: 30 em 30 minutos)
- **Usuários permitidos** (quem pode ver/usar esse quadro)

> **Analogia**: Pensa em quadros como agendas de diferentes departamentos. O time comercial tem uma agenda, o suporte tem outra, cada um com seus horários.

---

## Funcionalidades

### 1. Criar Novo Quadro

**Onde**: Botão "Novo Quadro" no header

**Campos**:
- **Nome do Quadro**: Nome para identificar (ex: "Agenda Comercial")
- **Início (h)**: Hora que o quadro começa (ex: 8)
- **Fim (h)**: Hora que o quadro termina (ex: 18)
- **Intervalo (min)**: Espaçamento entre slots (ex: 30 minutos)
- **Permitir Acesso**: Lista de funcionários que podem usar este quadro

---

### 2. Editar Quadro Existente

**Onde**: Botão de engrenagem (⚙️) ao lado do seletor de quadro

Permite alterar todas as configurações do quadro selecionado.

---

### 3. Criar Nova Tarefa

**Onde**: Botão "+ Nova Tarefa" ou clicando em um slot vazio no calendário

**Campos obrigatórios**:
- **Quadro de Tarefas**: Em qual quadro a tarefa será criada
- **Responsável**: Quem é o dono da tarefa (obrigatório)
- **Título**: Nome da tarefa
- **Tipo**: Categoria visual da tarefa
- **Data/Hora Início**: Quando começa
- **Data/Hora Fim**: Quando termina

**Campos opcionais**:
- **Urgência**: Baixa, Média ou Alta
- **Vincular Negociação**: Conectar a um deal do CRM
- **Vincular Contato**: Conectar a um contato
- **Vencimento**: Deadline da tarefa
- **Descrição**: Detalhes adicionais
- **Recorrência**: Única ou Diária

---

### 4. Tipos de Tarefa (Cores)

| Tipo | Cor | Uso Recomendado |
|------|-----|-----------------|
| **Atividade** | 🟢 Verde | Tarefas gerais, ações normais |
| **Agendamento** | 🔵 Azul | Reuniões, calls, compromissos |
| **Ausência** | 🟡 Amarelo | Férias, folgas, ausências |
| **Ocupado** | 🟠 Laranja | Bloqueio de horário |
| **Lembrete** | 🟣 Roxo | Avisos, lembretes importantes |

---

### 5. Níveis de Urgência

| Nível | Significado |
|-------|-------------|
| **Baixa** | Pode esperar, sem pressa |
| **Média** | Importante, fazer em breve |
| **Alta** | Urgente, prioridade máxima |

---

### 6. Visualização do Calendário

O calendário mostra a semana atual com:
- **Navegação**: Botões < Hoje > para mudar de semana
- **Data atual**: Destacada visualmente
- **Horários**: Baseados na configuração do quadro
- **Tarefas**: Cards coloridos no horário correspondente

---

### 7. Interações com Tarefas

| Ação | Como Fazer |
|------|------------|
| **Ver detalhes** | Clique simples na tarefa |
| **Editar** | Clique na tarefa > botão de lápis (✏️) |
| **Mover horário** | Arrastar e soltar (drag and drop) |
| **Redimensionar** | Arrastar bordas superior/inferior |
| **Concluir** | Botão "Marcar como concluído" nos detalhes |

---

### 8. Status das Tarefas

| Status | Significado |
|--------|-------------|
| **Pendente** | Aguardando início |
| **Aberto** | Em andamento |
| **Concluído** | Finalizada com sucesso |

> Tarefas passadas que não foram concluídas ficam visualmente diferentes (mais opacas).

---

## Vinculações

### Vincular Negociação (CRM)
Ao vincular uma tarefa a uma negociação do CRM:
- O contato é preenchido automaticamente
- Você pode ver a tarefa relacionada ao deal

### Vincular Contato
Se não vincular a uma negociação, pode vincular diretamente a um contato da sua base.

---

## Permissões por Role

| Funcionalidade | Admin | Supervisor | Agente |
|---------------|-------|------------|--------|
| Ver todos os quadros | ✅ | ✅ | ❌ (só os permitidos) |
| Criar quadros | ✅ | ✅ | ❌ |
| Editar quadros | ✅ | ✅ | ❌ |
| Criar tarefas | ✅ | ✅ | ✅ |
| Editar tarefas | ✅ | ✅ | ⚠️ Apenas próprias |
| Escolher responsável | ✅ | ✅ | ❌ (sempre ele mesmo) |

---

## Problemas Comuns

### "Não consigo ver nenhum quadro"
**Causa**: Você não foi adicionado como permitido em nenhum quadro.
**Solução**: Peça para um admin ou supervisor te adicionar nas configurações do quadro.

### "Os horários do quadro não aparecem corretos"
**Causa**: A configuração de início/fim pode estar errada.
**Solução**: ⚙️ > Edite o quadro e ajuste os horários.

### "Não consigo mover uma tarefa"
**Causa**: Tarefas passadas não podem ser movidas.
**Solução**: Edite a tarefa e altere a data/hora manualmente.

### "O campo responsável está bloqueado"
**Causa**: Agentes só podem criar tarefas para si mesmos.
**Info**: Isso é normal, apenas admins/supervisores podem delegar.

---

## Dicas de Uso

1. **Clique no slot vazio** para criar uma tarefa naquele horário específico (mais rápido que usar o botão)

2. **Use tipos diferentes** para organizar visualmente (ex: azul para reuniões, verde para tarefas internas)

3. **Vincule ao CRM** para manter rastreabilidade das ações com clientes

4. **Crie quadros separados** para equipes diferentes, assim cada um vê só o relevante

5. **Use recorrência diária** para tarefas que se repetem (ex: standup, check-in)

---

## Atalhos

| Ação | Atalho |
|------|--------|
| Criar tarefa no horário | Clique no slot vazio |
| Ver detalhes | Clique na tarefa |
| Editar | Clique > ícone lápis |
| Semana anterior | Botão < |
| Semana seguinte | Botão > |
| Ir para hoje | Botão "Hoje" |
