# Manual - Follow Up

Página para gerenciar templates de mensagens de acompanhamento enviadas automaticamente após um período de inatividade do cliente.

> **Acesso**: Todos podem criar. Admins e Supervisores veem todos. Agentes veem apenas os seus.

---

## Conceitos

### Follow Up
Mensagem automática enviada para retomar contato quando o cliente não responde após um tempo definido.

**Exemplo**: Cliente não responde há 30 minutos → Sistema envia: "Olá! Vi que você não respondeu, posso ajudar?"

### Categoria
Agrupamento de follow ups para organização.

**Exemplos**:
- "Vendas" → Follow ups de prospecção
- "Suporte" → Follow ups de atendimento
- "Pós-venda" → Follow ups de satisfação

---

## Interface da Página

### Cabeçalho
- **Título**: "Follow Up" com ícone de relógio
- **Botão Adicionar Follow Up**: Cria novo template

### Abas
| Aba | Função |
|-----|--------|
| **Follow Ups** | Lista de templates de mensagens |
| **Categorias** | Lista de categorias para organização |

---

## Aba: Follow Ups

### Tabela

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome identificador do template |
| **Tempo** | Minutos até enviar (ex: "30 min", "1h") |
| **Mensagem** | Texto da mensagem (truncado) |
| **Atendente** | Quem criou o template |
| **Categoria** | Categoria do follow up |
| **Ações** | Menu com Editar e Excluir |

---

## Aba: Categorias

### Cards
Cada categoria é exibida como um card contendo:
- **Nome** da categoria
- **Quantidade** de follow ups nela
- **Botão Excluir** 🗑️

---

## Modal: Criar/Editar Follow Up

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Categoria** | Qual categoria pertence | ✅ |
| **Nome** | Nome do template | ✅ |
| **Tempo (minutos)** | Quanto tempo sem resposta para enviar | ✅ |
| **Mensagem** | Texto a ser enviado | ✅ |

### Sobre o Tempo
- Define quanto tempo após a última mensagem do cliente
- Mínimo: 1 minuto
- Exemplos: 30 min, 60 min (1h), 120 min (2h)

---

## Modal: Criar Categoria

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome da categoria | ✅ |

---

## Como Criar um Follow Up

1. Clique em **"Adicionar Follow Up"**
2. Selecione ou crie uma **Categoria**
3. Digite o **Nome** (ex: "Primeira retomada")
4. Defina o **Tempo** em minutos
5. Escreva a **Mensagem**
6. Clique em **"Criar Follow Up"**

---

## Como Criar uma Categoria

### Pela aba Categorias:
1. Vá na aba **Categorias**
2. Clique em **"Nova Categoria"**
3. Digite o nome
4. Clique em **"Criar"**

### Pelo modal de Follow Up:
1. Ao criar um Follow Up, clique no **+** ao lado do seletor de categoria
2. Digite o nome da nova categoria
3. Clique em **"Criar"**

---

## Como Editar um Follow Up

1. Localize o follow up na tabela
2. Clique no ícone **⋮** (três pontos)
3. Selecione **"Editar"**
4. Modifique os campos
5. Clique em **"Atualizar Follow Up"**

---

## Como Excluir

### Excluir Follow Up:
1. Clique no ícone **⋮** na linha
2. Selecione **"Excluir"**
3. Confirme

### Excluir Categoria:
1. Vá na aba **Categorias**
2. Clique no 🗑️ do card
3. Confirme

> ⚠️ **Atenção**: Excluir uma categoria exclui todos os follow ups dela!

---

## Formatação de Tempo

| Minutos | Exibição |
|---------|----------|
| 30 | 30 min |
| 60 | 1h |
| 90 | 1h 30min |
| 120 | 2h |

---

## Visibilidade por Cargo

| Cargo | Visualiza | Pode criar/editar/excluir |
|-------|-----------|---------------------------|
| **Admin** | Todos os follow ups | ✅ |
| **Supervisor** | Todos os follow ups | ✅ |
| **Agente** | Apenas os seus | ✅ (só os seus) |

---

## Problemas Comuns

### "Follow up não está sendo enviado"
- Verifique se o follow up está configurado nas **Definições de IA**
- Verifique se a IA está ativada para a instância

### "Não vejo os follow ups de outros"
- Agentes só visualizam os próprios
- Admins e Supervisores veem todos

### "Excluí categoria por engano"
- Não é possível recuperar
- Recrie a categoria e os follow ups

---

## Relação com Definições de IA

Os follow ups aqui criados são **templates**. Para ativar o envio automático:

1. Vá em **Definições de IA** (`/ia-config`)
2. Aba **Config**
3. Ative **Follow Up**
4. Configure FUP1, FUP2, FUP3 com tempo e mensagem

---

## Dicas de Uso

1. **Seja gentil**: Mensagens de follow up não devem ser invasivas
2. **Varie o tom**: Cada follow up pode ter abordagem diferente
3. **Aumente o intervalo**: FUP1=30min, FUP2=1h, FUP3=2h
4. **Use categorias**: Organize por tipo de atendimento
5. **Personalize**: Use nome do cliente se possível
