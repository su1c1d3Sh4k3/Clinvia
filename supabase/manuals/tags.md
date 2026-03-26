# Tags — Etiquetas de Categorização

## O que é
Tags são etiquetas coloridas que categorizam contatos e conversas, facilitando a segmentação para campanhas, filtros e relatórios.

## Acesso
Menu lateral → Operações → Tags (ícone de etiqueta)

## Estrutura da Página
- **Lista de Tags**: todas as tags cadastradas com cor e contagem de uso
- **Botão "+ Nova Tag"**: criar nova etiqueta
- **Edição Inline**: clique em uma tag para editar

## Campos de uma Tag

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Nome | Texto | Identificação da tag (ex: "VIP", "Lead Quente") |
| Cor | Hex | Cor de exibição (ex: #FF0000) |
| Protegida | Boolean | Tags do sistema não podem ser excluídas |

## Tags Especiais

| Tag | Descrição |
|-----|-----------|
| **IA** | Marcada automaticamente na chegada de leads via IA; protegida contra remoção manual |
| **Qualificado** | Marcada quando lead completa o fluxo de qualificação |
| **VIP** | Uso livre — clientes prioritários |

## Como Fazer

### Criar uma Nova Tag
1. Clique em **"+ Nova Tag"**
2. Digite o nome da tag
3. Selecione uma cor
4. Clique em **Salvar**

### Editar uma Tag
1. Clique na tag na lista
2. Altere nome ou cor
3. Clique em **Salvar**
⚠️ Tags protegidas não podem ser editadas ou excluídas.

### Excluir uma Tag
1. Clique na tag
2. Selecione **"Excluir"**
3. Confirme
⚠️ A exclusão remove a tag de todos os contatos que a possuem.

### Aplicar Tag a Contatos
1. Acesse o contato em **Contatos**
2. Clique no campo Tags
3. Selecione a tag desejada
4. Salve o contato

### Filtrar por Tag
- Em **Contatos**: use o filtro "Tag" para listar contatos com a tag
- Em **Inbox**: filtre conversas pela tag do contato

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver tags | ✅ | ✅ | ✅ |
| Criar tag | ✅ | ✅ | ❌ |
| Editar tag | ✅ | ✅ | ❌ |
| Excluir tag | ✅ | ❌ | ❌ |
| Aplicar tag a contato | ✅ | ✅ | ✅ |

## Boas Práticas

| Prática | Exemplo |
|---------|---------|
| Use nomes curtos | "VIP" em vez de "Cliente VIP Premium" |
| Cores distintas | Evite cores muito parecidas |
| Categorias claras | "Lead", "Cliente", "Inativo" |
| Não duplique | "Novo Lead" e "Lead Novo" são confusos |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Não consigo excluir a tag "IA" | É uma tag protegida do sistema |
| Tag sumiu de um contato | Pode ter sido removida por outro usuário |
| Cor não aparece | Limpe o cache do navegador |

## Dicas
- Crie tags que reflitam o estágio do cliente (Lead, Em Negociação, Cliente Ativo, Inativo)
- Use tags para campanhas de follow-up segmentadas
- A Bia pode informar quantos contatos têm uma determinada tag
