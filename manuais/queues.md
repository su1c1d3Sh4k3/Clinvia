# Manual - Filas

Página para gerenciar filas de atendimento, organizando a distribuição de conversas entre os membros da equipe.

> **Acesso**: Agentes só visualizam. Admins e Supervisores podem criar/editar. Apenas Admins podem excluir.

---

## Conceitos

### Fila
Uma fila é um agrupamento lógico que define quais atendentes recebem determinadas conversas.

**Exemplos**:
- Fila "Vendas" → Atendentes do comercial
- Fila "Suporte" → Técnicos
- Fila "Financeiro" → Cobrança

### Como funcionam
1. Cada **instância WhatsApp** pode ter uma fila padrão
2. Quando uma mensagem chega, vai para a fila da instância
3. Apenas agentes **atribuídos** àquela fila veem as conversas

---

## Interface da Página

### Cabeçalho
- **Título**: "Filas"
- **Botão Nova Fila**: Cria nova fila (Admin/Supervisor)

---

## Tabela de Filas

| Coluna | Descrição |
|--------|-----------|
| **ID** | Identificador único (8 primeiros caracteres) |
| **Nome** | Nome da fila |
| **Status** | ✅ Ativo ou ❌ Inativo |
| **Atribuída** | Quantidade de usuários na fila |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Modal: Criar/Editar Fila

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome da Fila** | Nome identificador | ✅ |
| **Status (Ativo)** | Se a fila está ativa | ❌ (padrão: ativo) |
| **Usuários Atribuídos** | Lista de membros da equipe | ❌ |

### Lista de Usuários
- Mostra todos os membros da equipe
- Marque os que devem receber conversas desta fila
- Um usuário pode estar em múltiplas filas

---

## Como Criar uma Fila

1. Clique em **"Nova Fila"**
2. Digite o **nome** (ex: "Vendas", "Suporte")
3. Mantenha **Status Ativo** ligado
4. Selecione os **usuários** que farão parte
5. Clique em **"Salvar"**

---

## Como Editar uma Fila

1. Localize a fila na tabela
2. Clique no ícone ✏️ (lápis)
3. Modifique os campos desejados
4. Clique em **"Salvar"**

> **Nota**: Filas padrão não podem ter nome ou status alterados.

---

## Como Excluir uma Fila

1. Localize a fila na tabela
2. Clique no ícone 🗑️ (lixeira)
3. Confirme a exclusão

> ⚠️ **Atenção**: Filas padrão não podem ser excluídas.

---

## Vinculando Filas a Instâncias

Para que uma fila funcione:

1. Vá em **Conexões WhatsApp** (`/whatsapp-connection`)
2. Localize a instância desejada
3. No seletor **"Fila"**, escolha a fila
4. Novas conversas desta instância irão para a fila

---

## Status da Fila

| Status | Comportamento |
|--------|---------------|
| **Ativo** ✅ | Fila recebe conversas normalmente |
| **Inativo** ❌ | Fila não recebe novas conversas |

Desativar uma fila não afeta conversas já em andamento.

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Visualizar | ✅ | ✅ | ✅ |
| Criar fila | ✅ | ✅ | ❌ |
| Editar fila | ✅ | ✅ | ❌ |
| Excluir fila | ✅ | ❌ | ❌ |

---

## Problemas Comuns

### "Não consigo excluir a fila"
- Apenas Admins podem excluir
- Filas padrão (is_default) não podem ser excluídas

### "Conversas não chegam na fila correta"
- Verifique se a instância WhatsApp tem a fila padrão definida
- Verifique se a fila está **Ativa**

### "Agente não vê as conversas da fila"
- Verifique se o agente está **atribuído** à fila
- Edite a fila e marque o checkbox do agente

### "Não consigo editar o nome da fila"
- Filas padrão do sistema não podem ser renomeadas

---

## Dicas de Uso

1. **Organize por setor**: Vendas, Suporte, Financeiro
2. **Atribua corretamente**: Só inclua quem deve atender
3. **Use múltiplas filas por instância**: Configure diferentes números para diferentes setores
4. **Desative ao invés de excluir**: Preserva histórico
5. **Revise periodicamente**: Atualize quando houver mudanças na equipe
