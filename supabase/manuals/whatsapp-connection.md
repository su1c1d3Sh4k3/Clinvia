# Conexões — WhatsApp e Instagram

## O que é
O módulo de Conexões gerencia as instâncias de WhatsApp (via Evolution API) e as conexões com o Instagram da empresa.

## Acesso
Menu lateral → Automação → Conexões
Ou acesse diretamente em /connections

## Tipos de Conexão

### WhatsApp (Evolution API)
| Status | Descrição |
|--------|-----------|
| 🟢 Conectado | QR Code lido, instância ativa |
| 🟡 Aguardando QR | Instância criada, aguardando leitura |
| 🔴 Desconectado | Sessão encerrada ou expirada |
| ⚪ Inativo | Instância pausada |

### Instagram
| Status | Descrição |
|--------|-----------|
| 🟢 Conectado | OAuth autorizado, webhook ativo |
| 🔴 Desconectado | Token expirado ou revogado |

## Como Conectar o WhatsApp

### Criar Nova Instância
1. Clique em **"+ Nova Conexão"**
2. Digite um nome para a instância (ex: "WhatsApp Principal")
3. O sistema cria a instância na Evolution API
4. Um QR Code aparece na tela

### Ler o QR Code
1. Abra o WhatsApp no celular
2. Vá em **Menu → Aparelhos Conectados → Conectar Aparelho**
3. Aponte a câmera para o QR Code na tela
4. Aguarde a confirmação (status muda para "Conectado")

### Reconectar Instância Desconectada
1. Clique na instância desconectada
2. Selecione **"Reconectar"** ou **"Gerar Novo QR"**
3. Leia o QR Code novamente

### Verificar Status
- O status atualiza automaticamente a cada 30 segundos
- Clique em **"Verificar"** para atualização imediata

## Como Conectar o Instagram

### Autorizar via OAuth
1. Clique em **"Conectar Instagram"**
2. Faça login na sua conta do Facebook/Meta Business
3. Autorize as permissões solicitadas (mensagens, perfil)
4. Você será redirecionado de volta ao Clinvia
5. A conexão é configurada automaticamente

### Requisitos para Instagram
- Conta do Instagram deve ser **comercial** ou **criador de conteúdo**
- Deve estar vinculada a uma Página do Facebook
- Mensagens via Instagram Direct são suportadas

## Gerenciar Instâncias

### Excluir uma Instância
1. Clique nos três pontos (⋮) da instância
2. Selecione **"Excluir"**
3. Confirme a exclusão

### Configurações da Instância
- Nome de exibição
- Filas vinculadas
- Comportamento de mensagens (leitura automática, etc.)

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver conexões | ✅ | ✅ | ✅ |
| Criar instância | ✅ | ❌ | ❌ |
| Reconectar | ✅ | ✅ | ❌ |
| Excluir instância | ✅ | ❌ | ❌ |
| Conectar Instagram | ✅ | ❌ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| QR Code expira rápido | Leia o QR em até 60 segundos após gerar |
| WhatsApp desconecta sozinho | O celular precisa ter bateria e internet; não desinstale o app |
| Instagram não conecta | Verifique se a conta é comercial e vinculada ao Facebook |
| Mensagens não chegam | Verifique se a instância está ativa e os webhooks configurados |
| "Instance not found" | Recrie a instância do zero |

## Dicas
- Mantenha o celular do WhatsApp sempre carregado e conectado à internet
- Não use o mesmo número em dois dispositivos simultaneamente
- Para múltiplos atendentes, crie múltiplas instâncias
- Instâncias do Instagram não precisam de QR Code — apenas OAuth
