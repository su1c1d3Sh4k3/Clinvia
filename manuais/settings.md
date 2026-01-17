# Manual - Configurações do Sistema

Página para gerenciar seu perfil, empresa, segurança e preferências de notificação.

> **Acesso**: Todos os usuários podem acessar. Algumas opções são exclusivas para Admins.

---

## Navegação

A página possui 4 abas:

| Aba | Ícone | Função |
|-----|-------|--------|
| **Perfil** | 👤 | Dados pessoais do usuário |
| **Empresa** | 🏢 | Nome da organização |
| **Segurança** | 🔒 | Email e senha de acesso |
| **Sistema** | ⚙️ | Notificações, app e preferências |

---

## Aba: Perfil

Informações pessoais do usuário logado.

| Campo | Descrição |
|-------|-----------|
| **Foto de Perfil** | Avatar exibido no sistema. Clique em "Alterar Foto" para mudar |
| **Nome Completo** | Seu nome como será exibido |
| **Telefone** | Número de contato |
| **Email de Contato** | Email para contato (diferente do email de login) |
| **Instagram** | @ do seu Instagram |
| **Endereço** | Seu endereço completo |

### Como alterar a foto:
1. Clique em **"Alterar Foto"**
2. Selecione uma imagem do seu dispositivo
3. Aguarde o upload
4. Clique em **"Salvar Alterações"**

---

## Aba: Empresa

Informações da organização.

| Campo | Descrição | Quem pode editar |
|-------|-----------|------------------|
| **Nome da Empresa** | Nome que aparece no sistema | Apenas Admin |

> **Nota**: Supervisores e Agentes podem visualizar, mas não editar.

---

## Aba: Segurança

Configurações de acesso à conta.

### Alterar Email
1. Digite o novo email no campo **"Email"**
2. Clique em **"Atualizar Segurança"**
3. Verifique sua caixa de entrada para confirmar

### Alterar Senha
1. Digite a nova senha em **"Nova Senha"**
2. Confirme em **"Confirmar Senha"**
3. Clique em **"Atualizar Segurança"**

> **Importante**: As senhas devem coincidir.

---

## Aba: Sistema

Preferências de notificação e configurações do sistema.

### Notificações de Mensagens

| Opção | Descrição |
|-------|-----------|
| **Notificações** | Liga/desliga alertas visuais e sonoros |
| **Grupos** | Alertas para mensagens de grupos WhatsApp |
| **Instagram** | Alertas para mensagens do Instagram |

> **Nota**: Grupos e Instagram só funcionam se Notificações estiver ligado.

---

### Assinar Mensagens
Quando ativado, seu nome é enviado junto com as mensagens.

Exemplo: "Olá! Tudo bem? *- João (Vendas)*"

> **Acesso**: Apenas Admins e Supervisores.

---

### Acesso Financeiro
Controla se **Supervisores** podem ver dados financeiros.

| Estado | Efeito |
|--------|--------|
| **Ligado** | Supervisores veem Receitas/Despesas |
| **Desligado** | Supervisores não veem dados financeiros |

> **Acesso**: Apenas Admins podem alterar.

---

### Testar Alertas
Botão para verificar se som e notificações estão funcionando.

Clique em **"Testar"** para:
- Ouvir o som de alerta
- Ver uma notificação de teste

---

### Baixar App (PWA)

Instale o sistema como um app no seu dispositivo.

| Estado | Ação |
|--------|------|
| **Instalado** | Mostra ✅ "Instalado" |
| **Disponível** | Botão "Instalar" |
| **iOS** | Botão "Como instalar" (instruções manuais) |
| **Não disponível** | Navegador não suporta |

**Vantagens do App:**
- Acesso rápido pela tela inicial
- Funciona em tela cheia
- Recebe notificações push

---

### Notificações Push

Receba alertas mesmo com o app fechado.

**Clique para expandir** e configurar quais notificações receber:

| Categoria | Descrição |
|-----------|-----------|
| **Tarefas** | Lembretes de tarefas |
| **CRM / Negócios** | Atualizações de deals |
| **Agendamentos** | Lembretes de agendamentos |
| **Financeiro** | Alertas financeiros |
| **Oportunidades** | Novas oportunidades |

---

### Registrar Dispositivo

Ativa notificações push neste dispositivo específico.

| Estado | Ação |
|--------|------|
| **Registrado** | Mostra ✅ "Registrado" |
| **Não registrado** | Botão "Ativar" |

> **Nota**: Cada dispositivo (celular, computador) precisa ser registrado separadamente.

---

### Excluir Conta

> ⚠️ **ATENÇÃO**: Ação irreversível! Apenas Admins.

Remove permanentemente:
- Todos os membros da equipe
- Todas as conversas e mensagens
- Todos os contatos
- Todos os dados financeiros
- Todos os dados do CRM e agendamentos

**Para excluir:**
1. Clique no card vermelho **"Excluir conta"**
2. Leia o aviso de confirmação
3. Clique em **"Sim, excluir permanentemente"**
4. Você será deslogado e a conta será removida

---

## Permissões por Cargo

| Recurso | Admin | Supervisor | Agente |
|---------|-------|------------|--------|
| Editar perfil | ✅ | ✅ | ✅ |
| Editar empresa | ✅ | ❌ | ❌ |
| Alterar email/senha | ✅ | ✅ | ✅ |
| Assinar mensagens | ✅ | ✅ | ❌ |
| Acesso financeiro | ✅ (configura) | (visualiza) | ❌ |
| Excluir conta | ✅ | ❌ | ❌ |

---

## Problemas Comuns

### "Não recebo notificações"
1. Verifique se **Notificações** está ativado
2. Verifique permissões do navegador
3. Clique em **"Testar"** para verificar
4. Registre o dispositivo para push

### "Não consigo instalar o app"
- No iOS: Use Safari e siga as instruções
- Android/Desktop: Use Chrome ou Edge
- Navegadores incógnito não suportam

### "Email não confirma"
- Verifique a pasta de spam
- Aguarde alguns minutos
- Tente novamente

### "Supervisor não vê financeiro"
- Admin deve ativar **"Acesso financeiro"** nesta aba

---

## Dicas de Uso

1. **Mantenha perfil atualizado**: Foto e nome ajudam na identificação
2. **Use senha forte**: Mínimo 8 caracteres com números e símbolos
3. **Instale o app**: Acesso mais rápido e notificações push
4. **Registre cada dispositivo**: Para receber alertas em todos
5. **Configure notificações push**: Escolha só o que é importante
