# Manual - Gestão de Filas

Página para monitorar e gerenciar conversas em andamento, organizadas em colunas por fila. Permite transferir conversas entre filas via drag-and-drop e resolver atendimentos direto do board.

> **Acesso**: Agentes veem apenas suas filas. Admins e Supervisores veem todas as filas.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Gestão"** (ícone de camadas 🗂️) e clique em **"Gestão de Filas"** (ícone de lista 📋).

URL direta: `/queues_manager`

> **Diferença entre Filas e Gestão de Filas:**
> - **Filas** (`/queues`) → onde você *cria e configura* as filas e atribui membros
> - **Gestão de Filas** (`/queues_manager`) → onde você *monitora e gerencia* as conversas em tempo real

---

## Interface da Página

### Barra de Filtros

| Filtro | Função |
|--------|--------|
| **Busca** | Filtra por nome do contato |
| **Tag** | Filtra conversas com determinada etiqueta |
| **Status** | Todos / Abertos / Pendentes |
| **Agente** | Mostra conversas de um membro específico |
| **Canal** | Toggle WhatsApp / Instagram |
| **Limpar** | Remove todos os filtros ativos |

### Board Kanban

- Cada **coluna** = uma fila de atendimento
- Cabeçalho da coluna: nome da fila + contador de conversas
- Cada **card** = uma conversa

---

## Card de Conversa

| Elemento | Descrição |
|----------|-----------|
| **Nome do Contato** | Quem está sendo atendido |
| **Última Mensagem** | Prévia do último texto |
| **Horário** | Quando foi a última mensagem |
| **Canal** | Ícone WhatsApp ou Instagram |
| **Status** | Aberto / Pendente |
| **Tags** | Etiquetas do contato |
| **Agente** | Responsável pelo atendimento |
| **Timer de Inatividade** | Indica quanto tempo sem resposta |

### Timer de Inatividade (Cores)

| Cor | Significado |
|-----|-------------|
| 🟢 Verde | Menos de 5 minutos |
| 🔵 Azul | Entre 5 e 15 minutos |
| 🟡 Amarelo | Entre 15 e 30 minutos |
| 🟠 Laranja | Entre 30 e 60 minutos |
| 🔴 Vermelho | Mais de 60 minutos — urgente! |

---

## Como Transferir uma Conversa de Fila

1. Localize o card da conversa
2. Clique e segure o card
3. Arraste até a coluna da fila de destino
4. Solte para confirmar

> A transferência é instantânea. O agente da nova fila verá a conversa imediatamente.

---

## Como Resolver uma Conversa

- Clique no botão de **resolver** no card (sem precisar abrir o chat)
- A conversa sai do board ao ser resolvida

---

## Contexto do Cliente (no Card)

Ao passar o mouse ou expandir um card, você pode ver:
- **Deals abertos** no CRM vinculados ao contato
- **Próximo agendamento** do paciente
- **Tarefas** pendentes

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver todas as filas | ✅ | ✅ | ❌ |
| Ver suas filas | ✅ | ✅ | ✅ |
| Transferir conversa | ✅ | ✅ | ✅ |
| Resolver conversa | ✅ | ✅ | ✅ |
| Filtrar por agente | ✅ | ✅ | ❌ |

---

## Problemas Comuns

### "Não vejo nenhuma fila"
- Verifique se você está atribuído a alguma fila em **Operações > Filas**
- Admins e Supervisores veem todas as filas automaticamente

### "Não consigo arrastar o card"
- Clique e segure por 1 segundo antes de arrastar
- O cursor deve mudar ao segurar

### "Card aparece com timer vermelho"
- A conversa ficou mais de 60 minutos sem resposta
- Priorize o atendimento imediatamente

### "Fila não aparece no board"
- Verifique se a fila está **Ativa** em Operações > Filas
- Filas inativas não aparecem no board

---

## Dicas de Uso

1. **Monitore o timer vermelho**: conversas >60min precisam de atenção imediata
2. **Use filtros combinados**: canal + agente + status para focar no que importa
3. **Arraste para distribuir carga**: mova conversas entre agentes quando necessário
4. **Resolva direto do board**: sem precisar abrir cada conversa
5. **Use em tela cheia**: o board é mais eficiente com mais espaço visível
