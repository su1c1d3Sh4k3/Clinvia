# Manual - Financeiro

Painel financeiro completo com controle de receitas, despesas, custos de equipe e campanhas de marketing.

> **Acesso**: Apenas Admins têm acesso total. Supervisores visualizam dados parciais conforme permissão.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Administrativo"** (ícone de gráfico 📊) e clique em **"Financeiro"** (ícone de carteira 💰).

Ou acesse diretamente via URL: `/financial`

---

## Diferença entre "Vendas" e "Financeiro"

| Página | Rota | Função |
|--------|------|--------|
| **Vendas** | `/sales` | Registrar e visualizar vendas individuais |
| **Financeiro** | `/financial` | Visão completa: receitas, despesas, custos, marketing, balanço |

---

## Estrutura da Página

### Seletor de Período
No topo da página, selecione o período para análise:
- Dia, Semana, Mês, Trimestre, Semestre ou Ano
- Intervalo personalizado com data início/fim

---

## Cards de Balanço (5 cards)

| Card | Descrição | Cor |
|------|-----------|-----|
| **Faturamento** | Receitas recebidas - Despesas pagas | 🟢 Positivo / 🔴 Negativo |
| **Recebidos** | Total de receitas com status "Pago" | 🟢 Verde |
| **Recebimentos Futuros** | Receitas pendentes (a receber) | 🔵 Azul |
| **Débitos** | Total de despesas com status "Pago" | 🔴 Vermelho |
| **Débitos Futuros** | Despesas pendentes (a pagar) | 🟠 Laranja |

---

## Gráfico Anual

Exibe dados dos últimos 12 meses com duas visualizações:

| Aba | Conteúdo |
|-----|----------|
| **Faturamento Mensal** | Linha de evolução da receita |
| **Receitas x Despesas** | Comparativo entre entradas e saídas |

---

## Lançamentos (Tabs)

A seção principal possui **5 abas**:

### 1. Receitas 💚
Cadastro e listagem de entradas financeiras.

| Coluna | Descrição |
|--------|-----------|
| Categoria | Grupo da receita |
| Item | Descrição da receita |
| Valor | Montante em R$ |
| Pagamento | Forma de pagamento |
| Vencimento | Data de vencimento |
| Status | Pago / Pendente / Atrasado |

### 2. Despesas 🔴
Cadastro e listagem de saídas financeiras.

| Coluna | Descrição |
|--------|-----------|
| Categoria | Grupo da despesa |
| Item | Descrição da despesa |
| Valor | Montante em R$ |
| Pagamento | Forma de pagamento |
| Vencimento | Data de vencimento |
| Status | Pago / Pendente / Atrasado |

### 3. Custo Equipe 🟡
Custos com colaboradores (salários, comissões, bônus).

| Coluna | Descrição |
|--------|-----------|
| Colaborador | Nome do membro |
| Tipo | CLT, PJ, Freelancer |
| Salário Base | Valor fixo |
| Comissão | Valor variável |
| Bônus | Valores extras |
| Deduções | Descontos |
| Total | Salário + Comissão + Bônus - Deduções |

### 4. Marketing 🔵
Controle de campanhas de marketing e investimentos.

| Coluna | Descrição |
|--------|-----------|
| Campanha | Nome da campanha |
| Plataforma | Meta Ads, Google Ads etc. |
| Investimento | Valor investido |
| Período | Data início/fim |
| Status | Ativa / Pausada / Finalizada |

### 5. Visão Geral 📊
Gráfico interativo dos últimos 30 dias com todas as categorias sobrepostas:
- Receitas (verde)
- Despesas (vermelho)
- Custo Equipe (amarelo)
- Marketing (azul)

Alterne entre gráfico de **linhas** ou **barras**.

---

## Gráficos de Faturamento por Pessoa

Na parte inferior da página, dois gráficos mostram:

| Gráfico | Descrição |
|---------|-----------|
| **Por Atendente** | Faturamento gerado por cada atendente |
| **Por Profissional** | Faturamento por profissional (prestador de serviço) |

---

## Relatórios Financeiros

Botão **"Relatórios"** (📄) no canto superior: abre modal com relatórios detalhados, filtráveis por período.

---

## Como Cadastrar uma Receita

1. Selecione a aba **"Receitas"**
2. Clique em **"Novo Lanç."** (botão + no cabeçalho)
3. Preencha: categoria, item, valor, forma de pagamento, vencimento
4. Defina o status (Pago ou Pendente)
5. Clique em **"Salvar"**

## Como Cadastrar uma Despesa

1. Selecione a aba **"Despesas"**
2. Clique em **"Novo Lanç."**
3. Preencha: categoria, item, valor, forma de pagamento, vencimento
4. Clique em **"Salvar"**

## Como Cadastrar Custo de Equipe

1. Selecione a aba **"Equipe"**
2. Clique em **"Novo Lanç."**
3. Selecione o colaborador, tipo, salário base, comissão, bônus, deduções
4. Clique em **"Salvar"**

## Como Cadastrar Campanha de Marketing

1. Selecione a aba **"Mkt"**
2. Clique em **"Novo Lanç."**
3. Preencha: nome da campanha, plataforma, investimento, período
4. Clique em **"Salvar"**

---

## Paginação

Cada aba tem paginação configurável:
- Selecione quantos itens exibir: 5, 10, 20 ou 50
- Navegue entre páginas com as setas

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver financeiro | ✅ | ⚠️ Parcial | ❌ |
| Criar lançamentos | ✅ | ❌ | ❌ |
| Editar lançamentos | ✅ | ❌ | ❌ |
| Excluir lançamentos | ✅ | ❌ | ❌ |
| Ver relatórios | ✅ | ⚠️ Se habilitado | ❌ |

---

## Problemas Comuns

### "Não consigo acessar a página"
- Apenas Admins têm acesso ao financeiro
- Supervisores precisam de permissão habilitada

### "Faturamento mostra valor negativo"
- Significa que suas despesas superaram as receitas no período
- Revise os lançamentos para confirmar

### "Valores não batem"
- Verifique o período selecionado no seletor de datas
- Valores são calculados com base no período filtrado

### "Gráfico em branco"
- Pode não haver dados no período selecionado
- Ajuste o filtro de datas

---

## Dicas de Uso

1. **Registre diariamente**: Mantenha lançamentos em dia para relatórios precisos
2. **Use categorias**: Organize receitas e despesas por categoria para melhor análise
3. **Compare períodos**: Use o seletor para comparar meses diferentes
4. **Acompanhe faturamento**: O card "Faturamento" mostra a saúde financeira
5. **Revise custos de equipe**: Monitore comissões e bônus mensalmente
