# Manual - Conexões WhatsApp

Página para gerenciar suas conexões/instâncias do WhatsApp via API de integração.

> **Acesso**: Admins têm acesso total. Supervisores não podem excluir. Agentes só visualizam.

---

## Conceitos

### Instância
Uma instância representa uma conexão com um número de WhatsApp. Cada número de WhatsApp precisa de sua própria instância.

### Status
| Status | Ícone | Significado |
|--------|-------|-------------|
| **connected** | ✅ | WhatsApp conectado e funcionando |
| **disconnected** | ❌ | Não conectado, precisa reconectar |
| **Verificando...** | 🔄 | Checando status atual |

### Fila Padrão
Cada instância pode ter uma fila padrão associada. Novos atendimentos dessa instância cairão automaticamente nessa fila.

---

## Interface da Página

### Card: Nova Instância (apenas Admins/Supervisores)

| Campo | Descrição |
|-------|-----------|
| **Nome da Instância** | Nome identificador (ex: "WhatsApp Vendas", "Suporte") |
| **Botão Criar** | Cria a instância e abre o modal de conexão |

> **Nota**: O nome é automaticamente convertido para minúsculas e espaços viram hífens.

---

### Card: Instâncias Configuradas

Lista todas as instâncias do usuário com:

| Elemento | Descrição |
|----------|-----------|
| **Nome** | Nome da instância |
| **Seletor de Fila** | Define a fila padrão para novos atendimentos |
| **Badge de Status** | connected ou disconnected |
| **Botão Conectar** | Aparece quando disconnected |
| **Botão Excluir** | 🗑️ Remove a instância (só Admins) |

---

## Como Criar uma Instância

1. Digite um **nome** no campo "Nome da Instância"
   - Use nomes descritivos (ex: "Vendas", "Suporte", "Principal")
2. Clique em **"Criar Instância"**
3. O modal de conexão abre automaticamente

---

## Como Conectar uma Instância

### Passo 1: Gerar Código de Pareamento

1. Clique no botão **"Conectar"** da instância
2. O modal de conexão abre
3. Digite o número do WhatsApp:
   - **Formato**: DDI + DDD + Número
   - **Exemplo**: `55 11 999999999`
4. Clique em **"Gerar Código de Pareamento"**

### Passo 2: Confirmar no WhatsApp

1. Um código de 8 dígitos aparece na tela
2. Você receberá uma notificação no seu WhatsApp
3. No seu celular:
   - Abra o WhatsApp
   - Vá em **Configurações** → **Dispositivos Conectados**
   - Clique em **"Conectar um dispositivo"**
   - Escolha **"Conectar com número de telefone"**
   - Digite o código exibido na tela
4. O modal fecha automaticamente quando a conexão é estabelecida

> **Dica**: Você pode clicar no ícone 📋 para copiar o código.

---

## Como Configurar Fila Padrão

1. Localize a instância desejada
2. No seletor **"Fila"**, escolha uma fila
3. A alteração é salva automaticamente

**Opções**:
- **Nenhuma**: Atendimentos não são direcionados automaticamente
- **Nome da Fila**: Atendimentos vão para essa fila

---

## Como Excluir uma Instância

> ⚠️ **Atenção**: Apenas Admins podem excluir instâncias!

1. Localize a instância desejada
2. Clique no botão 🗑️ (lixeira)
3. A instância é removida

> **Nota**: Isso não afeta as conversas existentes, apenas desconecta o WhatsApp.

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Ver instâncias | ✅ | ✅ | ✅ |
| Criar instância | ✅ | ✅ | ❌ |
| Conectar | ✅ | ✅ | ✅ |
| Definir fila | ✅ | ✅ | ❌ |
| Excluir | ✅ | ❌ | ❌ |

---

## Problemas Comuns

### "O código expirou"
- Códigos são válidos por 60 segundos
- Clique em **Conectar** novamente para gerar um novo código

### "Status fica como disconnected"
1. Verifique se o WhatsApp está aberto no celular
2. Verifique a conexão com a internet do celular
3. Tente desconectar e reconectar
4. Verifique se não há outro dispositivo conectado

### "Não recebo mensagens"
1. Verifique se o status está **connected**
2. Verifique se a instância tem uma **fila padrão** definida
3. Verifique as configurações de IA (se IA estiver ativa)

### "Não consigo excluir a instância"
- Apenas usuários com cargo **Admin** podem excluir
- Supervisores e Agentes não têm essa permissão

### "O modal não fecha após conectar"
- Aguarde alguns segundos, a verificação é automática
- Se demorar mais de 30 segundos, feche e verifique o status

---

## Dicas de Uso

1. **Use nomes descritivos**: Facilita identificar cada número
2. **Configure filas**: Para organizar atendimentos por setor
3. **Verifique periodicamente**: Status pode mudar se o celular desconectar
4. **Mantenha o celular conectado**: A conexão depende do celular estar online
5. **Não compartilhe códigos**: São únicos e temporários
