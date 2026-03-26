# Vendas — Registro e Relatórios de Vendas

## O que é
O módulo de Vendas registra todas as transações comerciais da empresa, permitindo controle por período, profissional e produto/serviço.

## Acesso
Menu lateral → Operações → Vendas (ícone de carrinho)

## Estrutura da Página
- **Resumo do Período**: total de vendas e receita
- **Lista de Vendas**: tabela com todas as transações
- **Filtros**: período, profissional, produto/serviço
- **Botão "+ Nova Venda"**: registrar manualmente

## Campos de uma Venda

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Data | Data | Quando foi realizada |
| Contato | Contato | Cliente que comprou |
| Profissional | Profissional | Quem realizou a venda |
| Produto/Serviço | Item | O que foi vendido |
| Quantidade | Número | Quantidade de itens |
| Valor Unitário | Moeda | Preço por unidade |
| Desconto | % ou R$ | Desconto aplicado |
| Total | Moeda | Valor final da venda |
| Observação | Texto | Nota adicional |

## Como Fazer

### Registrar uma Nova Venda
1. Clique em **"+ Nova Venda"**
2. Selecione o contato (cliente)
3. Selecione o profissional responsável
4. Adicione produto(s)/serviço(s) e quantidades
5. Aplique desconto se necessário
6. Confirme o total e clique em **Salvar**

### Filtrar Vendas por Período
1. Use o seletor de período (hoje, semana, mês, personalizado)
2. O resumo de receita atualiza automaticamente

### Filtrar por Profissional ou Produto
1. Use os filtros laterais ou superiores
2. Combine filtros para relatórios específicos

### Exportar Relatório
1. Aplique os filtros desejados
2. Clique em **Exportar** (ícone de download)
3. Escolha formato CSV ou PDF

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver todas as vendas | ✅ | ✅ | ❌ |
| Ver próprias vendas | ✅ | ✅ | ✅ |
| Registrar venda | ✅ | ✅ | ✅ |
| Editar venda | ✅ | ✅ | ❌ |
| Excluir venda | ✅ | ❌ | ❌ |
| Ver relatórios | ✅ | ✅ | ❌ |

## Indicadores

| Indicador | Descrição |
|-----------|-----------|
| Receita Total | Soma de todas as vendas do período |
| Ticket Médio | Receita total / número de vendas |
| Produto Mais Vendido | Item com maior quantidade vendida |
| Profissional Top | Maior receita gerada por membro |

## Integração com Financeiro
- Vendas registradas aqui alimentam automaticamente o módulo Financeiro
- O lançamento aparece como "Receita" na categoria configurada

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Venda não aparece no financeiro | Verifique se a integração financeira está ativa nas configurações |
| Valor incorreto | Confira desconto aplicado e quantidade |
| Produto não encontrado | Cadastre-o em Produtos e Serviços primeiro |
| Não consigo ver as vendas | Verifique permissão de cargo |

## Dicas
- Registre vendas no mesmo dia para relatórios precisos
- Associe sempre um profissional para relatórios de comissão
- A Bia pode buscar o resumo de vendas por período, profissional ou produto
