# Manual - Dashboard

Página inicial com métricas, gráficos e visão geral do desempenho.

> **Acesso**: Todos os usuários têm acesso. Alguns dados são restritos por cargo.

---

## 📍 Como Acessar

No **menu lateral**, clique em **"Dashboard"** (ícone de gráfico 📊).

Este é um item principal do menu, não está dentro de nenhum submenu.

---

## Estrutura da Página

### Cabeçalho

| Elemento | Função |
|----------|--------|
| **Título "Dashboard"** | Identificação da página |
| **Seletor de Período** | Filtrar métricas por data |
| **Botão Atualizar** | Recarregar dados |

---

## Cards de Métricas

### Atendimento

| Métrica | Descrição |
|---------|-----------|
| **Conversas Abertas** | Quantidade de conversas em andamento |
| **Conversas Hoje** | Total de conversas iniciadas hoje |
| **Tempo Médio de Resposta** | Média de tempo para primeira resposta |
| **Taxa de Resolução** | Percentual de conversas resolvidas |

### Vendas

| Métrica | Descrição |
|---------|-----------|
| **Vendas do Mês** | Total vendido no período |
| **Ticket Médio** | Valor médio por venda |
| **Conversão** | Taxa de leads que viraram vendas |

### CRM

| Métrica | Descrição |
|---------|-----------|
| **Deals Ativos** | Negociações em andamento |
| **Deals Estagnados** | Negociações paradas há muito tempo |
| **Pipeline Total** | Valor potencial de todas as negociações |

---

## Gráficos

### Gráfico de Vendas
- Evolução das vendas por período
- Comparativo com período anterior

### Gráfico de Etapas do CRM
- Distribuição de deals por etapa
- Visualização do funil

### Gráfico de Motivos de Perda
- Por que deals foram perdidos
- Top motivos de perda

---

## Tabela de Desempenho da Equipe

Mostra performance de cada atendente:
- Nome do membro
- Conversas atendidas
- Taxa de resolução
- Tempo médio de resposta
- Vendas realizadas

---

## Notificações e Alertas

### Oportunidades de Venda
Lista de clientes com potencial de recompra baseado em:
- Alerta de oportunidade dos produtos
- Tempo desde última compra

### Deals Estagnados
Negociações que precisam de atenção:
- Badge amarelo: próximo do limite
- Badge vermelho: já passou do limite

---

## Permissões por Cargo

| Recurso | Admin | Supervisor | Agente |
|---------|-------|------------|--------|
| Ver todas as métricas | ✅ | ✅ | ⚠️ Parcial |
| Ver vendas | ✅ | ⚠️ Se habilitado | ❌ |
| Ver performance equipe | ✅ | ✅ | ❌ |
| Ver próprias métricas | ✅ | ✅ | ✅ |

---

## Problemas Comuns

### "Dados não carregam"
- Verifique sua conexão
- Clique em Atualizar
- Aguarde alguns segundos

### "Não vejo métricas de vendas"
- Apenas Admins e Supervisores (com permissão) veem dados financeiros
- Solicite acesso ao Admin

### "Gráficos em branco"
- Pode não haver dados no período selecionado
- Ajuste o filtro de data

---

## Dicas de Uso

1. **Use o filtro de período**: Para comparar diferentes períodos
2. **Monitore deals estagnados**: Para não perder vendas
3. **Acompanhe oportunidades**: Contatos prontos para recompra
4. **Revise performance**: Para identificar pontos de melhoria
