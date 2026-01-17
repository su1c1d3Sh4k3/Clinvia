# Manual - Tags (Etiquetas)

Página para gerenciar tags/etiquetas que categorizam contatos e conversas.

> **Acesso**: Agentes só visualizam. Admins e Supervisores podem criar/editar. Apenas Admins podem excluir.

---

## Conceitos

### Tag (Etiqueta)
Marcador colorido para categorizar e organizar contatos.

**Exemplos**:
- 🔴 **Urgente** - Clientes que precisam de atenção imediata
- 🟢 **VIP** - Clientes especiais
- 🔵 **Novo Lead** - Contatos recém-chegados
- 🟡 **Em Negociação** - Prospects em andamento

---

## Interface da Página

### Cabeçalho
- **Título**: "Tags" com ícone
- **Botão Nova Tag**: Cria nova tag (Admin/Supervisor)

---

## Tabela de Tags

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome da tag com círculo colorido |
| **Status** | Badge "Ativo" ou "Inativo" |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Modal: Criar/Editar Tag

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome da etiqueta | ✅ |
| **Cor** | Seletor de cor + código hexadecimal | ❌ (padrão: preto) |
| **Ativo** | Se a tag está disponível para uso | ❌ (padrão: ativo) |

### Seletor de Cor
- Clique no quadrado colorido para abrir paleta
- Ou digite o código hexadecimal (ex: `#FF5733`)

---

## Como Criar uma Tag

1. Clique em **"Nova Tag"**
2. Digite o **nome** (ex: "VIP", "Urgente")
3. Escolha uma **cor** para identificação visual
4. Mantenha **Ativo** ligado
5. Clique em **"Salvar"**

---

## Como Editar uma Tag

1. Localize a tag na tabela
2. Clique no ícone ✏️ (lápis)
3. Modifique nome, cor ou status
4. Clique em **"Salvar"**

---

## Como Excluir uma Tag

1. Localize a tag na tabela
2. Clique no ícone 🗑️ (lixeira)
3. Confirme a exclusão

> ⚠️ **Atenção**: A tag **"IA"** é do sistema e não pode ser excluída!

---

## Tag do Sistema: IA

A tag **"IA"** é especial:
- Criada automaticamente pelo sistema
- Usada para marcar contatos sendo atendidos pela IA
- **Não pode ser excluída**
- Pode ter nome e cor editados

---

## Status da Tag

| Status | Comportamento |
|--------|---------------|
| **Ativo** | Aparece nos filtros e pode ser atribuída |
| **Inativo** | Não aparece nos filtros, mas mantém histórico |

---

## Onde as Tags Aparecem

- **Contatos**: Coluna de etiquetas na tabela
- **Conversas**: Badge no ticket/conversa
- **Filtros**: Seletor para filtrar por tag
- **Ações em massa**: Atribuir tags a múltiplos contatos

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Visualizar | ✅ | ✅ | ✅ |
| Criar tag | ✅ | ✅ | ❌ |
| Editar tag | ✅ | ✅ | ❌ |
| Excluir tag | ✅ | ❌ | ❌ |
| Atribuir tag a contato | ✅ | ✅ | ✅ |

---

## Problemas Comuns

### "Não consigo excluir a tag"
- Apenas Admins podem excluir
- A tag "IA" é do sistema e não pode ser excluída

### "Tag não aparece nos filtros"
- Verifique se a tag está com status **Ativo**
- Tags inativas não aparecem nos seletores

### "Cor não muda"
- Use o seletor de cor OU digite o código hex
- Formato correto: `#RRGGBB` (ex: `#FF0000` para vermelho)

---

## Dicas de Uso

1. **Use cores distintas**: Facilita identificação visual rápida
2. **Nomes curtos**: "VIP" ao invés de "Cliente Muito Importante"
3. **Padronize**: Defina um sistema de cores (ex: vermelho = urgente)
4. **Desative ao invés de excluir**: Preserva histórico
5. **Agrupe por categoria**: Cliente (VIP, Novo), Status (Urgente, Pendente)
