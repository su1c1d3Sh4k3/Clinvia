# Tarefas — Gestão de Atividades

## O que é
O módulo de Tarefas organiza atividades, lembretes e agendamentos internos da equipe em quadros Kanban personalizados.

## Acesso
Menu lateral → Operações → Tarefas (ícone de checklist)

## Estrutura da Página
- **Seletor de Quadro** (topo): alterna entre quadros de tarefas
- **Colunas de Status**: Pendente | Em Andamento | Concluída
- **Cards de Tarefa**: cada card mostra título, data, responsável e urgência
- **Filtros**: por responsável, data e tipo

## Campos de uma Tarefa

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Título | Texto | Nome da tarefa |
| Tipo | Enum | activity, schedule, reminder |
| Urgência | Enum | low, medium, high |
| Status | Enum | pending, open, finished |
| Data/Hora | DateTime | Quando deve ser feita |
| Responsável | Membro | Quem executa |
| Contato | Contato | Relacionado (opcional) |
| Descrição | Texto | Detalhes adicionais |

## Quadros de Tarefas

| Campo | Descrição |
|-------|-----------|
| Nome | Identificação do quadro |
| Horário de Início | Hora de abertura do quadro |
| Horário de Fim | Hora de encerramento |
| Agentes Permitidos | Quais agentes podem acessar |

## Como Fazer

### Criar uma Tarefa
1. Selecione o quadro desejado
2. Clique em **"+ Nova Tarefa"** na coluna de status desejado
3. Preencha título, data, horário e urgência
4. Atribua a um responsável (opcional)
5. Clique em **Salvar**

### Alterar Status de uma Tarefa
1. Arraste o card para a coluna de destino (drag & drop)
2. Ou abra a tarefa e altere o status no formulário
3. O status aceita: Pendente → Em Andamento → Concluída

### Criar um Quadro
1. Clique em **"+ Novo Quadro"**
2. Informe o nome e horários de funcionamento
3. Defina quais agentes têm acesso (deixe vazio para todos)

### Filtrar Tarefas
- Selecione o quadro no topo
- Use filtros de responsável ou data
- Visualize por coluna de status

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver todos os quadros | ✅ | ✅ | Só os permitidos |
| Criar tarefa | ✅ | ✅ | ✅ (quadros permitidos) |
| Alterar qualquer tarefa | ✅ | ✅ | ❌ |
| Alterar própria tarefa | ✅ | ✅ | ✅ |
| Criar quadro | ✅ | ❌ | ❌ |
| Excluir tarefa | ✅ | ✅ | ❌ |

## Tipos e Urgências

### Tipos
- **activity**: atividade comum
- **schedule**: agendamento interno
- **reminder**: lembrete

### Urgências
- 🟢 **low** (Baixa): pode esperar
- 🟡 **medium** (Média): atenção normal
- 🔴 **high** (Alta): prioridade máxima

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Quadro não aparece | Verifique se você tem permissão (allowed_agents) |
| Tarefa sumiu | Verifique se foi movida para "Concluída" |
| Não consigo criar | Confirme acesso ao quadro |
| Data incorreta | Verifique o fuso horário configurado |

## Dicas
- Crie quadros separados por equipe ou área (ex: Comercial, Clínico)
- Use urgência Alta com parcimônia para não perder o impacto
- A Bia pode criar tarefas e alterar status por comando de voz/texto
- Configure horários do quadro para alinhar com o expediente da equipe
