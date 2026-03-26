# Filas — Gerenciamento de Atendimento

## O que é
As Filas organizam as conversas do inbox por categorias, áreas ou times, permitindo roteamento automático e distribuição de atendimentos.

## Acesso
Menu lateral → Operações → Filas (ícone de lista)
(Atenção: existe também "Gestão de Filas" /queues_manager que é o Kanban de conversas em andamento)

## Estrutura da Página
- **Lista de Filas**: todas as filas cadastradas
- **Botão "+ Nova Fila"**: criar nova fila
- **Configurações por Fila**: membros, instâncias, roteamento

## Campos de uma Fila

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Nome | Texto | Identificação da fila (ex: "Suporte", "Vendas") |
| Cor | Hex | Cor de exibição |
| Membros | Array | Quem pode receber conversas desta fila |
| Instâncias | Array | WhatsApp/Instagram vinculados |
| Roteamento | Enum | round-robin, manual, auto |
| Mensagem de Saudação | Texto | Enviada ao entrar na fila |

## Tipos de Roteamento

| Tipo | Descrição |
|------|-----------|
| **Round-Robin** | Distribui igualmente entre membros disponíveis |
| **Manual** | Supervisor atribui manualmente |
| **Auto** | Primeiro membro disponível |

## Como Fazer

### Criar uma Nova Fila
1. Clique em **"+ Nova Fila"**
2. Defina o nome e cor
3. Adicione os membros que atenderão esta fila
4. Vincule as instâncias de WhatsApp/Instagram
5. Configure o tipo de roteamento
6. Clique em **Salvar**

### Adicionar Membros à Fila
1. Abra a fila existente
2. Clique em **"+ Adicionar Membro"**
3. Selecione o membro da equipe
4. Defina a prioridade (se aplicável)
5. Salve

### Vincular uma Instância WhatsApp à Fila
1. Abra a fila
2. Em **"Instâncias"**, selecione o WhatsApp/Instagram
3. Mensagens chegando por esta instância irão para esta fila
4. Salve

### Remover Membro da Fila
1. Abra a fila
2. Clique no X ao lado do membro
3. Confirme e salve

## Roteamento Automático
Quando ativado:
1. Cliente envia mensagem
2. Sistema identifica a instância (ex: WhatsApp Vendas)
3. Roteia para a fila vinculada
4. Distribui ao próximo membro disponível no roteamento

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver filas | ✅ | ✅ | ✅ |
| Criar fila | ✅ | ❌ | ❌ |
| Editar fila | ✅ | ✅ | ❌ |
| Adicionar membros | ✅ | ✅ | ❌ |
| Excluir fila | ✅ | ❌ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Conversa não roteia | Verifique se a instância está vinculada à fila correta |
| Membro não recebe conversas | Confirme se está na fila e está "Disponível" |
| Fila vazia mas mensagens chegam | Verifique a instância vinculada |
| Roteamento desequilibrado | Use "Round-Robin" para distribuição igualitária |

## Diferença: Filas vs Gestão de Filas

| Página | Função |
|--------|--------|
| /queues (Filas) | Configuração: criar, editar, gerenciar membros e instâncias |
| /queues_manager (Gestão de Filas) | Operação: Kanban das conversas em atendimento |

## Dicas
- Crie filas separadas por área: Vendas, Suporte, Financeiro
- Use Round-Robin para distribuição justa em equipes maiores
- Vincule diferentes WhatsApps a diferentes filas para segmentação automática
- A mensagem de saudação pode incluir o nome da empresa e expectativa de atendimento
