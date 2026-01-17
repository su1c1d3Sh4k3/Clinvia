# Manual - Vendas

Página para registrar, visualizar e analisar vendas de produtos e serviços.

> **Acesso**: Admins e Supervisores (com permissão financeira). Agentes não têm acesso.

---

## Conceitos

### Venda
Registro de transação comercial de um produto ou serviço para um cliente.

### Formas de Pagamento
- **À Vista**: Pagamento imediato
- **Parcelado**: Pagamento em múltiplas parcelas (com ou sem juros)

---

## Interface da Página

### Cabeçalho

| Elemento | Função |
|----------|--------|
| **Seletor de Mês** | Filtra dados por mês |
| **Seletor de Ano** | Filtra dados por ano |
| **Botão Relatório** | Abre modal de relatórios |

---

## Cards de Resumo

Exibem indicadores do período selecionado:

| Card | Descrição |
|------|-----------|
| **Total de Vendas** | Valor total faturado no período |
| **Quantidade** | Número de vendas realizadas |
| **Ticket Médio** | Valor médio por venda |
| **Crescimento** | Comparação com período anterior |

---

## Gráficos

| Gráfico | Descrição |
|---------|-----------|
| **Vendas por Dia** | Evolução diária do faturamento |
| **Por Categoria** | Distribuição entre produtos e serviços |
| **Por Produto** | Ranking dos mais vendidos |

---

## Tabela de Vendas

Lista todas as vendas do período:

| Coluna | Descrição |
|--------|-----------|
| **Data** | Data da venda |
| **Cliente** | Nome do cliente |
| **Produto/Serviço** | Item vendido |
| **Quantidade** | Quantidade vendida |
| **Valor** | Valor total da venda |
| **Pagamento** | À vista ou parcelado |
| **Vendedor** | Quem realizou a venda |
| **Ações** | Editar/Excluir |

---

## Faturamento por Pessoa

Tabelas separadas mostrando:
- **Por Atendente**: Vendas por membro da equipe
- **Por Profissional**: Vendas por profissional (agendamentos)

---

## Modal: Nova Venda

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Cliente** | Selecionar contato existente | ❌ |
| **Produtos/Serviços** | Lista de itens da venda | ✅ |
| **Forma de Pagamento** | À vista ou parcelado | ✅ |
| **Data** | Data da venda | ✅ |
| **Atendente** | Quem realizou a venda | ❌ |
| **Profissional** | Profissional responsável | ❌ |
| **Observações** | Notas adicionais | ❌ |

### Lista de Produtos
Cada item possui:
- **Categoria**: Produto ou Serviço
- **Item**: Selecionar da lista cadastrada
- **Quantidade**: Quantas unidades
- **Subtotal**: Calculado automaticamente

Use **"+ Adicionar Produto"** para incluir mais itens na mesma venda.

### Parcelamento
Se selecionar "Parcelado":
- **Parcelas**: 2x até 24x
- **Juros % (a.m.)**: Taxa mensal de juros
- Sistema calcula valor da parcela e total com juros

---

## Como Registrar uma Venda

1. Clique em **"Nova Venda"** (ou via menu)
2. Selecione o **Cliente** (opcional)
3. Clique em **"+ Adicionar Produto"**
4. Escolha a **Categoria** (Produto/Serviço)
5. Selecione o **Item**
6. Defina a **Quantidade**
7. (Repita para mais itens)
8. Escolha **Forma de Pagamento**
9. Se parcelado, configure parcelas e juros
10. Defina a **Data**
11. Clique em **"Registrar Venda"**

---

## Venda via Agendamento

Quando um agendamento é marcado como "Concluído":
1. Sistema pergunta se deseja registrar venda
2. Modal abre com dados pré-preenchidos:
   - Cliente
   - Serviço
   - Valor
   - Data
   - Profissional
3. Apenas confirme o pagamento e salve

---

## Modal de Relatórios

Gera relatórios detalhados em PDF/Excel:

| Relatório | Conteúdo |
|-----------|----------|
| **Vendas do Período** | Lista completa de vendas |
| **Por Produto** | Ranking de vendas por item |
| **Por Atendente** | Comissões e performance |
| **Financeiro** | Fluxo de caixa de vendas |

---

## Controle de Acesso

| Cargo | Pode Acessar |
|-------|--------------|
| **Admin** | ✅ Sempre |
| **Supervisor** | ✅ Se tiver permissão financeira |
| **Agente** | ❌ Nunca |

Para dar acesso a Supervisores:
1. Vá em **Configurações** → **Sistema**
2. Ative **"Acesso Financeiro"**

---

## Problemas Comuns

### "Não consigo acessar a página"
- Agentes não têm acesso
- Supervisores precisam de permissão financeira ativada

### "Produto não aparece na lista"
- Verifique se está cadastrado em **Produtos e Serviços**
- Verifique se a categoria está correta (Produto vs Serviço)

### "Valor da parcela errado"
- Juros são calculados proporcionalmente
- Fórmula: Total × (1 + taxa × período médio)

### "Venda não aparece no relatório"
- Verifique o período selecionado (mês/ano)
- Verifique se a data da venda está no período

---

## Integração com Outras Páginas

| Origem | Ação |
|--------|------|
| **Agendamentos** | Conclusão gera venda automática |
| **Conversas** | Botão "Vender" no painel do contato |
| **CRM** | Conclusão de deal pode gerar venda |
| **Financeiro** | Vendas aparecem como receitas |

---

## Dicas de Uso

1. **Cadastre produtos primeiro**: Com preços definidos
2. **Use clientes cadastrados**: Para relatórios de histórico
3. **Defina atendentes**: Para controle de comissões
4. **Complete agendamentos**: Gera registro automático
5. **Revise mensalmente**: Use relatórios para análise
