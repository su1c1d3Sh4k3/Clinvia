import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
const MANUALS = {
  'queues_manager.md': `# Manual - Gestão de Filas (Kanban)

Página de visualização e gerenciamento de conversas organizadas por filas em formato Kanban.

> **Acesso**: Todos os usuários têm acesso. Cada agente vê apenas conversas das filas a que está atribuído.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Operações"** (ícone de grade 📦) e clique em **"Gestão de Filas"** (ícone de colunas 📋).

Ou acesse diretamente via URL: \`/queues_manager\`

---

## Diferença entre "Filas" e "Gestão de Filas"

| Página | Rota | Função |
|--------|------|--------|
| **Filas** | \`/queues\` | Criar/editar/excluir filas e atribuir membros |
| **Gestão de Filas** | \`/queues_manager\` | Visualizar e gerenciar **conversas** dentro das filas (Kanban) |

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
`,
  'financial.md': `# Manual - Financeiro

Painel financeiro completo com controle de receitas, despesas, custos de equipe e campanhas de marketing.

> **Acesso**: Apenas Admins têm acesso total. Supervisores visualizam dados parciais conforme permissão.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Administrativo"** (ícone de gráfico 📊) e clique em **"Financeiro"** (ícone de carteira 💰).

Ou acesse diretamente via URL: \`/financial\`

---

## Diferença entre "Vendas" e "Financeiro"

| Página | Rota | Função |
|--------|------|--------|
| **Vendas** | \`/sales\` | Registrar e visualizar vendas individuais |
| **Financeiro** | \`/financial\` | Visão completa: receitas, despesas, custos, marketing, balanço |

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

### 3. Custo Equipe 🟡
Custos com colaboradores (salários, comissões, bônus).

### 4. Marketing 🔵
Controle de campanhas de marketing e investimentos.

### 5. Visão Geral 📊
Gráfico dos últimos 30 dias com todas as categorias sobrepostas.

---

## Como Cadastrar uma Receita

1. Selecione a aba **"Receitas"**
2. Clique em **"Novo Lanç."**
3. Preencha: categoria, item, valor, forma de pagamento, vencimento
4. Defina o status (Pago ou Pendente)
5. Clique em **"Salvar"**

## Como Cadastrar uma Despesa

1. Selecione a aba **"Despesas"**
2. Clique em **"Novo Lanç."**
3. Preencha: categoria, item, valor, forma de pagamento, vencimento
4. Clique em **"Salvar"**

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver financeiro | ✅ | ⚠️ Parcial | ❌ |
| Criar lançamentos | ✅ | ❌ | ❌ |
| Editar lançamentos | ✅ | ❌ | ❌ |
| Excluir lançamentos | ✅ | ❌ | ❌ |

---

## Problemas Comuns

### "Não consigo acessar a página"
- Apenas Admins têm acesso ao financeiro

### "Faturamento mostra valor negativo"
- Significa que despesas superaram as receitas no período

### "Valores não batem"
- Verifique o período selecionado no seletor de datas

---

## Dicas de Uso

1. **Registre diariamente**: Mantenha lançamentos em dia
2. **Use categorias**: Organize por categoria para melhor análise
3. **Compare períodos**: Use o seletor para comparar meses
4. **Acompanhe faturamento**: O card mostra a saúde financeira
`,
  'default.md': `# Manual Geral - Clinbia

Sistema de atendimento omnichannel via WhatsApp e Instagram.

---

## 📍 Navegação do Sistema

### Menu Principal (itens soltos no menu lateral)

| Item | Ícone | Descrição |
|------|-------|-----------|
| **Dashboard** | 📊 | Métricas e gráficos de atendimento |
| **Inbox** | 💬 | Central de conversas WhatsApp/Instagram |
| **CRM** | 💼 | Funis de vendas estilo Kanban |

---

### Submenu "Automação" 🔧

| Item | Ícone | Descrição |
|------|-------|-----------|
| **Definições da IA** | 🤖 | Configurar comportamento da IA |
| **Conexões** | 📱 | Conectar WhatsApp/Instagram |
| **Configurações** | ⚙️ | Perfil, empresa, segurança |

---

### Submenu "Operações" 📦

| Item | Ícone | Descrição |
|------|-------|-----------|
| **Produtos e Serviços** | 📦 | Cadastrar itens para venda |
| **Contatos** | 📇 | Lista de clientes/leads |
| **Filas** | 📋 | Organizar atendimento por setor |
| **Gestão de Filas** | 📋 | Kanban de conversas por fila |
| **Tags** | 🏷️ | Categorizar contatos |
| **Follow Up** | ⏰ | Mensagens automáticas de retomada |

---

### Submenu "Administrativo" 📊

| Item | Ícone | Descrição |
|------|-------|-----------|
| **Agendamentos** | 📅 | Calendário de profissionais |
| **Tarefas** | 📋 | Agenda de atividades |
| **Vendas** | 🛒 | Registrar e visualizar vendas |
| **Financeiro** | 💰 | Receitas, despesas, custos e balanço |
| **Equipe** | 👥 | Gerenciar membros e profissionais |

---

## 🆘 Precisa de Ajuda?

Se tiver dúvidas específicas sobre alguma página, me pergunte!
Exemplo: "Como adicionar um produto?" ou "Como conectar o WhatsApp?"
`
};
serve(async (req)=>{
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results = {};
    for (const [filename, content] of Object.entries(MANUALS)){
      const blob = new Blob([
        content
      ], {
        type: 'text/markdown'
      });
      const { error } = await supabase.storage.from('manuals').upload(filename, blob, {
        upsert: true,
        contentType: 'text/markdown'
      });
      results[filename] = error ? `ERROR: ${error.message}` : 'SUCCESS';
    }
    return new Response(JSON.stringify({
      results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
