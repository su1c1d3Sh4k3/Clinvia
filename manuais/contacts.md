# Manual - Contatos

Página para gerenciar todos os contatos/leads que entraram em contato via WhatsApp ou Instagram.

> **Acesso**: Todos visualizam. Editação e exclusão apenas para Admins.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Operações"** (ícone de grade 📦) e clique em **"Contatos"** (ícone de livro de contatos 📇).

---

## Conceitos

### Contato / Lead
Pessoa que entrou em contato via WhatsApp ou Instagram. É criado automaticamente quando alguém envia mensagem.

### Canal
Origem do contato:
- **WhatsApp** (ícone verde)
- **Instagram** (ícone rosa/gradiente)

### Tags/Etiquetas
Marcadores coloridos para categorizar contatos.

---

## Interface da Página

### Cabeçalho
- **Título**: "Contatos"
- **Botão Novo Contato**: Cria contato manualmente

### Filtros de Canal
Botões para filtrar por origem:

| Botão | Função |
|-------|--------|
| **Todos** | Mostra todos os contatos |
| **WhatsApp** | Só contatos do WhatsApp |
| **Instagram** | Só contatos do Instagram |

### Busca e Filtros
- **Campo de busca**: Filtra por nome ou telefone
- **Filtro de Tags**: Mostra só contatos com determinada tag

---

## Tabela de Contatos

| Coluna | Descrição |
|--------|-----------|
| **☐** | Checkbox para seleção múltipla |
| **Nome** | Nome + foto + badge do canal + empresa |
| **Telefone** | Número do WhatsApp ou identificador Instagram |
| **Etiquetas** | Tags do contato (mostra até 2 + contador) |
| **IA** | Switch que liga/desliga IA para este contato |
| **Satisf.** | Índice de satisfação (média das notas) |
| **Resumos** | Quantidade de resumos de IA gerados |
| **Ações** | Botões de ação |

---

## Botões de Ação

| Ícone | Função | Acesso |
|-------|--------|--------|
| ✨ **Sparkles** | Gera relatório IA do cliente | Admin/Supervisor |
| ✉️ **Send** | Abre modal para enviar mensagem | Todos |
| 📷 **Instagram** | Abre perfil do Instagram | Todos (se tiver) |
| ✏️ **Pencil** | Edita o contato | Apenas Admin |
| 🗑️ **Trash** | Exclui o contato | Apenas Admin |

---

## Ações em Massa

Ao selecionar contatos (checkbox), aparece uma barra de ações:

| Ação | Função |
|------|--------|
| **Atribuir Tags** | Adiciona tags aos contatos selecionados |
| **Excluir** | Remove todos os contatos selecionados |

### Atribuir Tags em Massa
1. Selecione os contatos desejados
2. Clique em **"Atribuir Tags"**
3. Marque as tags a adicionar
4. Clique em **"Atribuir a todos"**

### Excluir em Massa
1. Selecione os contatos
2. Clique no botão vermelho **"Excluir"**
3. Confirme a exclusão

> ⚠️ **Atenção**: Excluir um contato remove também todos os cards de CRM, tarefas, conversas e tickets vinculados!

---

## Modal: Criar/Editar Contato

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome do cliente | ✅ |
| **Telefone** | Número com DDI (ex: 5537999999999) | ✅ |
| **Empresa** | Empresa do contato | ❌ |
| **CPF** | CPF do cliente | ❌ |
| **Email** | Email de contato | ❌ |
| **Instagram** | @ do Instagram (sem @) | ❌ |

> **Nota**: O telefone não pode ser alterado após criação.

---

## Controle de IA por Contato

Cada contato tem um switch **IA** na tabela.

| Estado | Comportamento |
|--------|---------------|
| **Ligado** (padrão) | IA responde normalmente |
| **Desligado** | IA não responde este contato |

Útil quando:
- Cliente pediu para falar com humano
- Negociação sensível em andamento
- Cliente reclamando ou irritado

---

## Índice de Satisfação

Número de 0 a 10 baseado nas avaliações de atendimento.

| Cor | Faixa | Significado |
|-----|-------|-------------|
| 🟢 Verde | 7.0 - 10.0 | Satisfeito |
| 🟡 Amarelo | 4.0 - 6.9 | Neutro |
| 🔴 Vermelho | 0.0 - 3.9 | Insatisfeito |

Clique no número para ver histórico (se houver).

---

## Resumos de Conversas

Número indica quantos resumos de IA foram gerados para este contato.

Clique para ver o **Histórico de Análises** com todas as conversas resumidas.

---

## Relatório IA do Cliente

Botão ✨ (Sparkles) gera um relatório completo do cliente incluindo:
- Perfil comportamental
- Histórico de interações
- Padrões de compra
- Recomendações de abordagem

---

## Modal: Enviar Mensagem

Ao clicar no botão de enviar mensagem:
1. Modal abre com número pré-preenchido
2. Digite a mensagem
3. Escolha a instância de envio
4. Clique em **"Enviar"**

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Visualizar | ✅ | ✅ | ✅ |
| Criar contato | ✅ | ✅ | ✅ |
| Editar | ✅ | ❌ | ❌ |
| Excluir | ✅ | ❌ | ❌ |
| Ligar/desligar IA | ✅ | ✅ | ✅ |
| Atribuir tags | ✅ | ✅ | ✅ |
| Ver satisfação | ✅ | ✅ | ❌ |
| Ver resumos | ✅ | ✅ | ❌ |
| Relatório IA | ✅ | ✅ | ❌ |

---

## Problemas Comuns

### "Contato não aparece na lista"
- Verifique o filtro de canal (Todos/WhatsApp/Instagram)
- Verifique o filtro de tag
- Limpe o campo de busca

### "Não consigo editar o contato"
- Apenas Admins podem editar contatos
- O telefone nunca pode ser alterado

### "Cliente recebendo IA mesmo desligado"
- Verifique se o switch está mesmo desligado
- Aguarde alguns segundos e atualize a página

### "Tags não aparecem"
- A tabela mostra no máximo 2 tags + contador
- Edite o contato para ver todas as tags

### "Não consigo excluir"
- Apenas Admins podem excluir
- Cuidado: exclui todos os dados vinculados!

---

## Dicas de Uso

1. **Use tags**: Organize contatos por categoria (Lead Quente, VIP, Problemático)
2. **Desligue IA quando necessário**: Para atendimentos sensíveis
3. **Verifique satisfação**: Contatos vermelhos precisam de atenção
4. **Use o relatório IA**: Para entender melhor o cliente antes de abordar
5. **Adicione dados extras**: Empresa, email e Instagram facilitam o contato
