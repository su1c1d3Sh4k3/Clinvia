# Manual da Página CRM

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Gestão"** (ícone de camadas 🗂️) e clique em **"CRM"** (ícone de maleta 💼).

URL direta: `/crm`

---

O CRM (Customer Relationship Management) é onde você gerencia suas vendas em formato de quadro Kanban, acompanhando negociações desde o primeiro contato até o fechamento.

---

## Conceitos Principais

### Funil (Funnel)
Um funil representa um processo de vendas completo. Exemplos: "Vendas B2B", "WhatsApp", "Instagram". Você pode ter múltiplos funis para diferentes tipos de vendas.

### Etapa (Stage)
São as colunas do Kanban. Cada etapa representa um passo no seu processo de vendas. Exemplo típico:
- **Lead** → Primeiro contato
- **Qualificação** → Entendendo a necessidade
- **Proposta** → Orçamento enviado
- **Negociação** → Discutindo valores/termos
- **Ganho** → Venda fechada ✅
- **Perdido** → Não fechou ❌

### Negociação (Deal)
Cada card no Kanban é uma negociação. Representa uma oportunidade de venda vinculada a um contato.

---

## Interface da Página

### Cabeçalho
| Elemento | Função |
|----------|--------|
| **Seletor de Funil** | Dropdown para escolher qual funil visualizar |
| **Gerenciar Etapas** (⚙️) | Criar, editar, reordenar ou excluir etapas do funil |
| **Filtros** | Filtrar por Tag, Responsável ou Data |
| **Novo Funil** | Criar um novo funil de vendas |
| **Nova Negociação** | Criar uma nova negociação (deal) |

### Quadro Kanban
- **Colunas**: Cada coluna é uma etapa do funil
- **Cards**: Cada card é uma negociação
- **Arrastar e soltar**: Mova cards entre colunas para atualizar o status

---

## Como Criar um Funil

1. Clique em **"Novo Funil"**
2. Digite o nome do funil (ex: "Vendas Instagram")
3. Clique em **Criar**
4. O funil será criado com etapas padrão

---

## Como Gerenciar Etapas

1. Selecione o funil desejado
2. Clique no botão de **engrenagem** (⚙️)
3. No modal "Gerenciar Etapas":
   - **Adicionar**: Digite o nome e clique em "Adicionar Etapa"
   - **Reordenar**: Arraste as etapas pela alça (☰)
   - **Editar**: Clique no nome para renomear
   - **Limite de Estagnação**: Defina quantos dias um deal pode ficar na etapa antes de ser considerado estagnado
   - **Excluir**: Clique no ícone de lixeira

> **Dica**: As etapas "Ganho" e "Perdido" são especiais e acionam automações quando um deal é movido para elas.

---

## Como Criar uma Negociação

1. Clique em **"Nova Negociação"**
2. Preencha os campos:
   - **Título** (obrigatório): Nome da negociação
   - **Contato**: Cliente associado
   - **Produtos/Serviços**: Adicione itens com quantidade e preço
   - **Funil** (obrigatório): Em qual funil está
   - **Etapa** (obrigatório): Em qual etapa começa
   - **Valor Total**: Calculado automaticamente dos produtos
   - **Prioridade**: Baixa, Média ou Alta
   - **Responsável**: Quem cuida dessa negociação
   - **Descrição**: Observações adicionais
3. Clique em **"Criar Negociação"**

---

## Card da Negociação (KanbanCard)

Cada card mostra:

| Elemento | Descrição |
|----------|-----------|
| **Título** | Nome da negociação |
| **Contato** | Foto + nome + ícone WhatsApp/Instagram |
| **Valor** | Valor total em R$ |
| **Produtos** | Quantidade de itens ou nome do produto |
| **Tags** | Tags do contato para categorização |
| **Data** | Data de criação |
| **Responsável** | Quem cuida da negociação |
| **Badge de não-lidos** | Número vermelho indica mensagens não lidas |
| **Indicador de tempo** | Amarelo/vermelho se estiver estagnando |

### Menu de Ações (⋮)
- **Visualizar**: Abre detalhes completos
- **Editar**: Modificar dados da negociação
- **Excluir**: Remover negociação

### Botões de Ação Rápida
- 📆 **Criar Tarefa**: Agendar follow-up ou atividade
- 💬 **Ir para Conversa**: Abrir chat com o cliente

---

## Movendo Negociações

### Arrastar e Soltar
1. Clique e segure o card
2. Arraste até a nova coluna
3. Solte para confirmar

### Comportamentos Especiais

**Ao mover para "Ganho":**
1. Modal de pagamento aparece
2. Escolha: À Vista, Parcelado ou Pendente
3. Vendas são criadas automaticamente na página Vendas

**Ao mover para "Perdido":**
1. Modal de motivo de perda aparece
2. Selecione o motivo:
   - Preço alto
   - Concorrente
   - Sem orçamento
   - Desistiu
   - Outro (com descrição)
3. O motivo é registrado para análise posterior

---

## Integração com Delivery (Funil de Procedimentos)

Quando uma negociação é movida para **"Ganho"** e contém **serviços** (não apenas produtos), o sistema abre automaticamente o **modal de lançamento de procedimentos**:

1. Mova o deal para **"Ganho"** → Modal de pagamento aparece → Confirme
2. Se o deal contiver serviços: o **modal "Lançar Procedimentos"** abre automaticamente
3. Para cada serviço (e unidade): aparece um card para preencher:
   - **Profissional** que executará o procedimento
   - **Data de Contato** (quando entrar em contato com o paciente)
   - **Data Limite** (prazo para execução)
   - **Observações** opcionais
4. Clique em **"Lançar Procedimentos"** → os registros são criados na página Delivery

> **Nota**: Se o contato do deal ainda não tem um paciente cadastrado, o sistema pedirá para criar o cadastro antes de lançar os procedimentos.

> **Atenção**: Somente itens do tipo **Serviço** disparam o lançamento de Delivery. Produtos físicos não geram procedimentos.

---

## Filtros

| Filtro | Função |
|--------|--------|
| **Por Tag** | Mostrar apenas negociações com determinada tag |
| **Por Responsável** | Ver só as negociações de um membro da equipe |
| **Por Data** | Filtrar por período de criação |

> **Nota para Agentes**: Se você é agente, só verá suas próprias negociações. Admins e supervisores veem todas.

---

## Estagnação de Negociações

Cada etapa pode ter um **limite de estagnação** (em dias). Quando uma negociação fica tempo demais na mesma etapa:

| Indicador | Significado |
|-----------|-------------|
| 🟡 Amarelo (ex: "3d") | Próximo de estagnar |
| 🔴 Vermelho (ex: "+2d") | Estagnada! Precisa de ação |

Negociações estagnadas aparecem no **Dashboard** como alerta.

---

## Integração com Outras Páginas

- **Contatos**: Negociações são vinculadas a contatos
- **Produtos/Serviços**: Itens vendidos vêm do cadastro
- **Tarefas**: Crie tarefas de follow-up direto do card
- **Vendas**: Negociações "Ganhas" viram vendas automaticamente
- **Inbox**: Acesse a conversa do cliente pelo card
- **Delivery**: Negociações "Ganhas" com serviços geram procedimentos no Funil de Delivery

---

## Problemas Comuns

### "Não vejo nenhuma negociação"
- Verifique se está no funil correto
- Se você é agente, só vê suas próprias negociações
- Verifique se os filtros não estão ativos

### "Não consigo arrastar o card"
- Clique e segure por 1 segundo antes de arrastar
- O cursor deve virar uma "mãozinha"

### "O valor está errado"
- O valor total é a soma dos produtos adicionados
- Edite a negociação para corrigir

### "Não aparece o modal de pagamento ao ganhar"
- Verifique se a etapa se chama exatamente "Ganho"
- O modal só aparece se houver produtos/valor

---

## Dicas de Uso

1. **Use prioridades**: Alta para negociações urgentes
2. **Adicione produtos**: Facilita o cálculo e geração de vendas
3. **Acompanhe estagnação**: Não deixe negociações paradas
4. **Use o filtro de responsável**: Para reuniões de performance
5. **Crie tarefas**: Para não esquecer follow-ups
