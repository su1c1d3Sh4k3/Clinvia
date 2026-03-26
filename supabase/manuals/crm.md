# CRM — Funil de Vendas

## O que é
O CRM (Customer Relationship Management) é o módulo de gestão de negociações da Clinvia. Organiza leads e clientes em funis Kanban com etapas personalizáveis.

## Acesso
Menu lateral → Gestão → CRM (ícone de funil)

## Estrutura da Página
- **Seletor de Funil** (topo): alterna entre funis cadastrados
- **Board Kanban**: colunas representando etapas do funil
- **Cards de Deal**: cada card mostra título, contato, valor e dias na etapa
- **Barra de Pipeline**: valor total por etapa

## Funis e Etapas

| Campo | Descrição |
|-------|-----------|
| Funil | Agrupamento de etapas (ex: Vendas, Pós-venda) |
| Etapa | Coluna do Kanban (ex: Lead, Contato, Proposta, Fechado) |
| Order Index | Ordem da etapa no funil |
| Stagnation Limit | Dias antes de marcar deal como estagnado |

## Deals (Negociações)

| Campo | Descrição |
|-------|-----------|
| Título | Nome do negócio |
| Contato | Cliente vinculado |
| Valor | Valor da negociação em R$ |
| Etapa | Posição atual no funil |
| Responsável | Membro da equipe atribuído |
| Dias na Etapa | Calculado automaticamente |

## Como Fazer

### Criar uma Negociação
1. Clique em **"+ Deal"** em qualquer etapa do Kanban
2. Informe o título, contato e valor (opcional)
3. O deal é criado na etapa clicada
4. Clique no card para adicionar mais detalhes

### Mover um Deal para Outra Etapa
1. Arraste o card para a coluna desejada (drag & drop)
2. Ou abra o deal e altere a etapa no formulário
3. A data de mudança de etapa é registrada automaticamente

### Configurar Funis e Etapas
1. Acesse **Configurações → CRM** ou clique no ícone de engrenagem no CRM
2. Crie ou edite funis e suas etapas
3. Defina o limite de dias para estagnação por etapa

### Filtrar Deals
- Use o seletor de funil no topo
- Filtre por membro responsável
- Busque pelo nome do contato ou título

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver todos os deals | ✅ | ✅ | ❌ (só os seus) |
| Criar deal | ✅ | ✅ | ✅ |
| Mover etapa | ✅ | ✅ | ✅ (só os seus) |
| Editar deal | ✅ | ✅ | ✅ (só os seus) |
| Excluir deal | ✅ | ✅ | ❌ |
| Gerenciar funis | ✅ | ❌ | ❌ |

## Indicadores de Estagnação
- Deal estagnado = parado na etapa por mais dias do que o limite configurado
- Aparece com borda laranja/vermelha no card
- Pode ser consultado pela Bia: "quais deals estagnados?"

## Valor de Pipeline
- Soma de todos os deals abertos por funil/etapa
- Visível na barra abaixo do nome de cada etapa
- Consulte pela Bia: "qual o valor total do pipeline?"

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Deal não aparece | Verifique se está no funil/etapa corretos; agentes veem apenas os seus |
| Não consigo mover | Confirme suas permissões de cargo |
| Contato não encontrado ao criar deal | Crie o contato primeiro em Contatos |
| Valor do pipeline zerado | Verifique se os deals têm valor preenchido |

## Dicas
- Use etapas com nomes claros para facilitar a gestão visual
- Configure o limite de estagnação por etapa conforme seu ciclo de vendas
- Vincule produtos/serviços aos deals para rastrear o que está sendo vendido
- A Bia pode criar deals, mover etapas e buscar negociações por você
