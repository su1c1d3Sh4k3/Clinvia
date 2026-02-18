# Manual - Gestão de Filas (Kanban)

Página de visualização e gerenciamento de conversas organizadas por filas em formato Kanban.

> **Acesso**: Todos os usuários têm acesso. Cada agente vê apenas conversas das filas a que está atribuído.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Operações"** (ícone de grade 📦) e clique em **"Gestão de Filas"** (ícone de colunas 📋).

Ou acesse diretamente via URL: `/queues_manager`

---

## Diferença entre "Filas" e "Gestão de Filas"

| Página | Rota | Função |
|--------|------|--------|
| **Filas** | `/queues` | Criar/editar/excluir filas e atribuir membros |
| **Gestão de Filas** | `/queues_manager` | Visualizar e gerenciar **conversas** dentro das filas (Kanban) |

---

## Estrutura da Página

### Cabeçalho
- **Título**: "Gestão de Filas"
- **Subtítulo**: "Gerencie conversas organizadas por filas de atendimento"

### Barra de Filtros

| Filtro | Descrição |
|--------|-----------|
| **Busca** | Pesquisar conversas por nome do contato |
| **Tag** | Filtrar por tag atribuída ao contato |
| **Status** | Filtrar por status: Todos, Abertos, Pendentes |
| **Agente** | Filtrar conversas de um atendente específico |
| **Canal** | Alternar entre WhatsApp 📱 e Instagram 📸 (pelo menos um ativo) |
| **Limpar filtros** | Botão para resetar todos os filtros |

---

## Board Kanban

A página exibe um **quadro Kanban** onde cada coluna representa uma **fila de atendimento**.

### Estrutura de cada Coluna
- **Cabeçalho**: Nome da fila + contador de conversas
- **Cards**: Cada card representa uma conversa ativa na fila

### Card de Conversa
Cada card mostra:
- **Nome do contato** (push_name)
- **Última mensagem** (prévia do conteúdo)
- **Horário** da última mensagem
- **Canal** (ícone WhatsApp ou Instagram)
- **Status** da conversa (aberto/pendente)
- **Tags** atribuídas ao contato
- **Agente** responsável (se atribuído)

---

## Como Usar

### Visualizar conversas por fila
1. Acesse a página Gestão de Filas
2. Cada coluna mostra as conversas da respectiva fila
3. Use os filtros para encontrar conversas específicas

### Filtrar por canal
1. Na barra de filtros, alterne os botões WhatsApp/Instagram
2. Pelo menos um canal deve estar ativo
3. Conversas são filtradas automaticamente

### Filtrar por status
1. Selecione "Abertos" para ver conversas ativas
2. Selecione "Pendentes" para ver conversas aguardando resposta
3. Selecione "Todos" para ver tudo

### Filtrar por agente
1. Selecione um agente no dropdown
2. Apenas conversas atribuídas àquele agente serão exibidas

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver todas as filas | ✅ | ✅ | ⚠️ Apenas filas atribuídas |
| Ver todas as conversas | ✅ | ✅ | ⚠️ Apenas da sua fila |
| Filtrar por agente | ✅ | ✅ | ❌ |

---

## Problemas Comuns

### "Não vejo nenhuma fila"
- Verifique se você está atribuído a pelo menos uma fila
- Peça ao Admin para te adicionar em Operações > Filas

### "Conversas não aparecem"
- Verifique os filtros ativos (status, canal, agente)
- Clique em "Limpar filtros" para resetar

### "Coluna vazia"
- A fila pode estar sem conversas ativas no momento
- Verifique se a fila está vinculada a alguma instância

---

## Dicas de Uso

1. **Monitore filas em tempo real**: A página atualiza automaticamente
2. **Use filtros combinados**: Canal + Status para visão específica
3. **Acompanhe distribuição**: Identifique filas sobrecarregadas
4. **Gerencie pendências**: Filtre por "Pendentes" para priorizar
