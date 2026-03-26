# Produtos e Serviços — Catálogo

## O que é
O módulo de Produtos e Serviços centraliza o catálogo da empresa — itens vendidos, serviços prestados e procedimentos realizados — usados em vendas, agendamentos e delivery.

## Acesso
Menu lateral → Operações → Produtos e Serviços (ícone de caixa)

## Estrutura da Página
- **Lista de Itens**: tabela com todos os produtos e serviços
- **Filtros**: por tipo (produto/serviço), status (ativo/inativo)
- **Busca**: por nome ou código
- **Botão "+ Novo Item"**: cadastrar manualmente
- **Importar CSV**: cadastro em massa

## Tipos de Item

| Tipo | Uso |
|------|-----|
| **Produto** | Item físico vendido |
| **Serviço** | Prestação de serviço (ex: consultoria) |
| **Procedimento** | Serviço com duração (ex: corte de cabelo, consulta) |

## Campos de um Item

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| Nome | Texto | ✅ | Nome do produto/serviço |
| Tipo | Enum | ✅ | product, service |
| Preço | Moeda | ✅ | Valor em R$ |
| Preço "Sob Consulta" | Boolean | ❌ | Oculta o preço |
| Duração (min) | Número | Serviços | Tempo do procedimento |
| Descrição | Texto | ❌ | Detalhes do item |
| Ativo | Boolean | ✅ | Disponível ou não |
| Categoria | Texto | ❌ | Agrupamento |

## Como Fazer

### Criar um Novo Item
1. Clique em **"+ Novo Item"**
2. Selecione o tipo (produto, serviço ou procedimento)
3. Preencha nome e preço
4. Para serviços: adicione duração em minutos
5. Ative **"Sob Consulta"** se o preço não deve ser exibido
6. Clique em **Salvar**

### Editar um Item
1. Clique no item na lista
2. Altere os campos desejados
3. Clique em **Salvar**

### Desativar um Item
1. Abra o item
2. Desative o toggle **"Ativo"**
3. O item não aparecerá mais em novas vendas/agendamentos (mas registros anteriores são mantidos)

### Importar via CSV
1. Clique em **"Importar"** → **"CSV"**
2. Baixe o modelo de planilha
3. Preencha: nome, tipo, preço, duração (para serviços)
4. Faça upload e confirme

### Vincular a Profissionais
1. Abra o item (tipo serviço)
2. Selecione os profissionais que realizam este serviço
3. O serviço aparecerá na agenda desses profissionais

## Integração com Outros Módulos

| Módulo | Como Usa |
|--------|---------|
| Agendamentos | Profissional + Serviço + duração |
| Vendas | Produto/Serviço + quantidade + preço |
| Delivery | Procedimento como item do funil |
| CRM | Produtos vinculados a deals |
| IA | IA menciona preços e durações ao responder |

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver catálogo | ✅ | ✅ | ✅ |
| Criar item | ✅ | ✅ | ❌ |
| Editar item | ✅ | ✅ | ❌ |
| Excluir item | ✅ | ❌ | ❌ |
| Importar CSV | ✅ | ✅ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Serviço não aparece na agenda | Verifique se está ativo e vinculado ao profissional correto |
| Preço não aparece | "Sob Consulta" pode estar ativado |
| Erro ao excluir item | O item está vinculado a vendas ou agendamentos — desative em vez de excluir |
| Importação falhou | Verifique o formato do preço (use ponto: 150.00, não vírgula) |

## Dicas
- Use a duração em minutos para otimizar a agenda automática
- "Sob Consulta" é útil para serviços com preço variável
- Desative itens descontinuados em vez de excluir para preservar histórico
- A Bia pode buscar preços e disponibilidade de serviços
