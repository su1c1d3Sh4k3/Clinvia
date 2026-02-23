# Manual - Inbox (Central de Conversas)

Central de atendimento via WhatsApp e Instagram. Todas as conversas com clientes são gerenciadas aqui.

> **Acesso**: Menu lateral → **"Inbox"** → `/inbox`

---

## Layout

- **Esquerda**: lista de conversas com filtros
- **Centro**: histórico de mensagens da conversa ativa
- **Direita**: sidebar da IA, análise, CRM e agendamento

---

## Funcionalidades de Mensagem

### 🎙️ Gravação de Áudio
1. Clique no **ícone de microfone** na barra de input
2. O timer aparece mostrando o tempo de gravação
3. Clique novamente para **finalizar e enviar automaticamente**
4. Clique no X durante a gravação para cancelar

> Primeira vez: o navegador pede permissão de microfone — clique em "Permitir"

### 📎 Envio de Arquivos
- Clique no **ícone de clipe** para selecionar arquivo
- Tipos: imagem (JPG, PNG), vídeo (MP4), áudio (MP3, OGG), documentos (PDF, DOCX, XLSX)
- **Colar imagem**: Ctrl+V na área de input cole imagens da área de transferência
- Preview aparece antes do envio com opção de cancelar

### 😄 Reações com Emoji
1. Passe o mouse sobre qualquer mensagem
2. Clique no ícone de emoji que aparece
3. Escolha a reação no picker
4. Aparece abaixo da mensagem (visível para ambos os lados)

### ↩️ Responder Mensagem (Reply)
1. Passe o mouse sobre a mensagem → clique em **"Responder"**
2. A mensagem citada aparece no preview do input
3. Envie sua resposta — ela aparece com o contexto da mensagem original

### ✏️ Editar Mensagem
- Disponível apenas para mensagens **enviadas por você**
- Hover na mensagem → clique em "Editar" → edite e confirme

### 🗑️ Deletar Mensagem
- Hover na mensagem → clique em "Deletar"
- A mensagem vira "[Mensagem apagada]"

### 🔍 Busca de Mensagens
- Ícone de **lupa** no cabeçalho da conversa
- Filtra mensagens da conversa por keyword

---

## Respostas Rápidas

Mensagens pré-definidas para agilizar atendimento:
1. No input, digite **/** ou clique no ícone de raio
2. Selecione a mensagem rápida desejada
3. Edite se necessário e envie

> Gerencie em: **Configurações → Respostas Rápidas**

---

## Sugestão de Resposta com IA

| Modo | Função |
|------|--------|
| **Gerar** | Sugere resposta baseada no contexto da conversa |
| **Corrigir** | Corrige ortografia e gramática do texto |
| **Melhorar** | Reescreve para tom mais profissional e empático |

Acesse via botão IA na barra de input ou na sidebar direita.

---

## Pesquisa de Satisfação

1. Menu da conversa (⋮) → **"Pesquisa de Satisfação"**
2. Cliente recebe mensagem com escala de notas via WhatsApp
3. Resultado aparece na análise de sentimento da IA

---

## Ações da Conversa

### ✅ Resolver Conversa
- Botão "Resolver" no cabeçalho
- Conversa fechada e movida para histórico
- Novo contato do mesmo cliente abre nova conversa

### 🔀 Transferir para Fila
- Botão "Transferir" → selecione fila destino
- Conversa aparece na nova coluna do Gestão de Filas

### 👤 Atribuir Agente
- Campo de agente no cabeçalho → selecione o membro responsável
- Agente recebe notificação de atribuição

---

## Filtros de Conversa

| Filtro | Descrição |
|--------|-----------|
| Todos / Meus / Não atribuídos | Escopo de visualização |
| Canal | WhatsApp 📱 ou Instagram 📸 |
| Status | Aberto / Pendente |
| Fila | Filtrar por fila específica |

---

## Permissões

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver todas as conversas | ✅ | ✅ | ⚠️ Apenas fila/atribuídas |
| Enviar mensagem | ✅ | ✅ | ✅ |
| Transferir conversa | ✅ | ✅ | ✅ |
| Atribuir agente | ✅ | ✅ | ❌ |
| Resolver conversa | ✅ | ✅ | ✅ |

---

## O que a Bia pode fazer

| Pedido | Ação |
|--------|------|
| "Melhore esse texto" | Melhora/corrige sua mensagem antes de enviar |
| "Problemas com mensagens chegando" | Diagnostica a instância WhatsApp/Instagram |
| "Como gravo áudio?" | Explica o passo a passo |

---

## Problemas Comuns

**Mensagens não chegam** → peça à Bia para verificar conexões (`diagnostics_check_connections`)

**Não aparece o microfone** → habilite permissão de microfone no navegador (cadeado na URL)

**Arquivo não envia** → verifique tamanho (limite ~50MB) e formato suportado pelo canal
