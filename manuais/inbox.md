# Manual - Inbox (Conversas)

Central de atendimento onde todas as conversas do WhatsApp e Instagram são gerenciadas.

> **Acesso**: Todos os usuários têm acesso.

---

## Estrutura da Página

A página é dividida em 3 áreas principais:

| Área | Posição | Função |
|------|---------|--------|
| **Lista de Conversas** | Esquerda | Listar e selecionar conversas |
| **Área de Chat** | Centro | Visualizar e responder mensagens |
| **Painel de Inteligência** | Direita | IA, CRM, Vendas, Agendamento, Follow Up |

---

## Lista de Conversas (Lateral Esquerda)

### Cabeçalho

| Elemento | Função |
|----------|--------|
| **Título "Inbox"** | Identificação da página |
| **Botão WhatsApp** 🟢 | Alterna para conversas do WhatsApp |
| **Botão Instagram** 🩷 | Alterna para conversas do Instagram |

### Botões de Ação

| Botão | Ícone | Função |
|-------|-------|--------|
| **Filtros** | ⚙️ | Abre menu de filtros avançados |
| **Tags** | 🏷️ | Atribuir tags ao contato selecionado |
| **Nova Mensagem** | ✉️ | Iniciar conversa com novo número |
| **Buscar** | 🔍 | Buscar mensagens na conversa |

### Filtros Avançados

| Filtro | Opções |
|--------|--------|
| **Filas** | Todas as filas ou específica |
| **Tags** | Todas as tags ou específica |
| **Instâncias** | Todas as instâncias ou específica |

### Abas Pessoas/Grupos (WhatsApp)

| Aba | Descrição |
|-----|-----------|
| **Pessoas** | Conversas individuais |
| **Grupos** | Conversas em grupo |

> ⚠️ Instagram não tem grupos.

### Status das Conversas

| Status | Ícone | Descrição |
|--------|-------|-----------|
| **Abertos** | 💬 | Conversas em atendimento ativo |
| **Pendentes** | ⏰ | Aguardando resposta (IA ou cliente) |
| **Resolvidos** | ✅ | Conversas finalizadas |

### Badge de Não Lidas

Cada aba mostra contador vermelho com quantidade de mensagens não lidas.

### Card de Conversa

Cada conversa exibe:
- **Avatar**: Foto do contato/grupo
- **Nome**: Nome do contato ou grupo
- **Badge Follow Up**: Verde pulsante se tiver follow up pendente
- **Número do Ticket**: #12345
- **Atendente**: 👤 Nome de quem está atendendo
- **Fila**: Nome da fila atribuída
- **Tags**: Ícones coloridos das tags
- **Instância**: Nome da instância WhatsApp
- **Botão Ver Detalhes**: 👁️ Abre modal do contato
- **Badge não lidas**: Quantidade de mensagens novas

### Campo de Busca de Contatos

Pesquisa por:
- Nome do contato
- Número de telefone
- ID do ticket
- ID da conversa

---

## Área de Chat (Centro)

### Cabeçalho do Chat

| Elemento | Função |
|----------|--------|
| **Avatar** | Foto do contato/grupo |
| **Nome** | Nome do contato ou grupo |
| **Instância** | Qual número está sendo usado |
| **Seletor de Fila** | Mudar fila da conversa |
| **Status** | Aberto, Pendente, Resolvido |
| **Botão Resolver** | Marca como resolvido |

### Área de Mensagens

Exibe todas as mensagens com:
- **Hora** de envio
- **Status** de entrega (✓ enviado, ✓✓ lido)
- **Formato**: Texto, imagem, vídeo, áudio, documento
- **Citação**: Se for resposta a outra mensagem

### Menu de Ações por Mensagem

Ao clicar/passar o mouse em uma mensagem enviada:

| Ação | Função |
|------|--------|
| **Responder** | Citar a mensagem na resposta |
| **Reagir** | Enviar emoji de reação |
| **Editar** | Alterar texto (apenas suas mensagens) |
| **Apagar** | Deletar mensagem (todos veem) |

### Área de Digitação

| Elemento | Função |
|----------|--------|
| **Campo de texto** | Digitar mensagem |
| **Emoji** 😊 | Seletor de emojis |
| **Anexo** 📎 | Enviar arquivos (imagem, vídeo, documento) |
| **Áudio** 🎤 | Gravar áudio |
| **IA** ✨ | Sugestão/Correção de texto via IA |
| **Enviar** ➡️ | Enviar mensagem |

### Mensagens Rápidas

Digite `/` + atalho para usar mensagens rápidas cadastradas.

**Exemplo**: `/ola` → Exibe lista de mensagens que começam com "ola"

### Recursos de Mídia

| Tipo | Suportado |
|------|-----------|
| **Imagem** | JPG, PNG, GIF |
| **Vídeo** | MP4, MOV |
| **Áudio** | Gravação direta ou upload |
| **Documento** | PDF, DOC, XLS, etc. |
| **Colar Imagem** | Ctrl+V para colar da área de transferência |

### Botão IA (Sparkles ✨)

Três opções quando clicado:
- **Gerar**: Cria resposta automática baseada no contexto
- **Corrigir**: Corrige erros no texto digitado
- **Melhorar**: Melhora a escrita do texto

---

## Painel de Inteligência (Lateral Direita)

### CRM Integrado

Exibe se o contato está no CRM:
- Status do lead/deal
- Pipeline atual
- Valor estimado
- Botão para criar lead/deal

### Oportunidades

Lista de oportunidades detectadas pela IA:
- Produto/serviço mencionado
- Mensagem sugerida
- Clique para inserir na área de texto

### Realizar Venda 💵

Registrar venda rápida vinculada ao contato:
1. Clique em **"Nova Venda"**
2. Selecione produto/serviço
3. Defina pagamento
4. Salve

### Agendamento 📅

Criar agendamento para o contato:
1. Clique em **"Novo Agendamento"**
2. Selecione profissional
3. Escolha data/hora
4. Serviço já vem com dados do contato
5. Salve

### Follow Up ⏰

Sistema de follow up por tempo:

**Sem categoria atribuída:**
1. Selecione uma categoria
2. Clique "Adicionar Follow Up"

**Com categoria atribuída:**
- Lista de mensagens programadas
- 🔓 Desbloqueadas: Clique para inserir no chat
- 🔒 Bloqueadas: Mostra hora que será liberada
- **Follow Up Automático**: Liga/desliga envio automático

### Índice de Satisfação 📊

Análise de IA da conversa:
- **Nota 0-10**: Qualidade do atendimento
- **Status**: Satisfeito, Neutro, Insatisfeito
- **Barra de progresso**: Visualização
- **Botão Atualizar**: Recalcula o índice

### Resumo da Conversa 📝

Resumo gerado por IA:
- Clique **"Gerar Resumo"** para criar
- Exibe principais pontos da conversa
- Último assunto discutido

### Copilot IA 🤖

Chat com assistente de IA:
- Pergunte qualquer coisa sobre a conversa
- Peça sugestões de resposta
- Tire dúvidas sobre o atendimento
- ⚙️ Botão configurações: ajustar comportamento

---

## Fluxo de Atendimento

### 1. Nova Mensagem Chega

1. Conversa aparece em **Pendentes** (se IA habilitada) ou **Abertos**
2. Badge vermelho mostra mensagem não lida
3. Notificação push (se habilitada)

### 2. Atendente Assume

1. Clica na conversa
2. Status muda para **Aberto**
3. Atendente é atribuído automaticamente

### 3. Durante o Atendimento

- Responda mensagens
- Use IA para sugestões
- Atribua tags
- Registre vendas se necessário
- Crie agendamentos

### 4. Finalização

1. Clique em **"Resolver"**
2. Status muda para **Resolvido**
3. Conversa move para aba de resolvidos

### 5. Cliente Retorna

- Nova mensagem reabre a conversa
- Volta para **Pendentes** ou **Abertos**

---

## Atribuição e Filas

### Mover para Fila

1. No cabeçalho do chat, clique no seletor de fila
2. Escolha a nova fila
3. Conversa é transferida

### Atribuir Atendente

- Conversa é atribuída ao primeiro que responder
- Admins podem reatribuir manualmente

---

## Modal: Nova Mensagem

Para iniciar conversa com número novo:

| Campo | Descrição |
|-------|-----------|
| **Telefone** | Número no formato internacional |
| **Mensagem** | Texto inicial (opcional) |
| **Instância** | Qual número usar para enviar |

---

## Modal: Detalhes do Contato

Ao clicar no 👁️:
- Informações do contato
- Histórico de tags
- Botão editar

---

## Problemas Comuns

### "Conversa não recebe mensagens"
- Verifique status da instância WhatsApp
- Conexão pode ter caído

### "Não consigo enviar"
- Instância não atribuída à conversa
- Selecione uma instância no modal

### "Áudio não grava"
- Permita acesso ao microfone no navegador

### "Imagem não envia"
- Verifique tamanho (máx ~16MB)
- Formato suportado (JPG, PNG)

### "IA não responde"
- Verifique configuração em Definições de IA
- Pode estar desabilitada para essa fila

### "Follow Up não aparece"
- Precisa ter categoria atribuída ao contato
- Mensagens só liberam após tempo definido

---

## Atalhos de Teclado

| Atalho | Função |
|--------|--------|
| **Enter** | Enviar mensagem |
| **Shift + Enter** | Nova linha |
| **Ctrl + V** | Colar imagem |
| **/atalho** | Mensagem rápida |

---

## Dicas de Uso

1. **Use filtros**: Para encontrar conversas específicas
2. **Atribua tags**: Para categorizar contatos
3. **Configure Follow Up**: Para não esquecer clientes
4. **Use mensagens rápidas**: Para respostas frequentes
5. **Gere resumos**: Para lembrar contexto de conversas antigas
6. **Ative notificações**: Para não perder mensagens
7. **Ajuste IA**: Configure o comportamento nas Definições
