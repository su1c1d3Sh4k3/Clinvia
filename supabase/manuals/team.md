# Equipe — Gestão de Membros

## O que é
O módulo de Equipe gerencia todos os membros da organização: seus cargos, permissões, acesso ao sistema e vínculo como profissionais para agendamentos.

## Acesso
Menu lateral → Operações → Equipe (ícone de pessoas)

## Estrutura da Página
- **Lista de Membros**: todos os usuários do sistema
- **Botão "+ Convidar"**: enviar convite por email
- **Filtro por Cargo**: admin, supervisor, agent
- **Cards de Membro**: foto, nome, cargo, status

## Cargos e Permissões

| Cargo | Descrição |
|-------|-----------|
| **admin** | Acesso total ao sistema |
| **supervisor** | Gerencia equipe e vê todos os dados, não configura integrações |
| **agent** | Atendimento, vê apenas próprios dados |

### Diferenças Principais

| Funcionalidade | Admin | Supervisor | Agente |
|---------------|-------|-----------|--------|
| Configurações gerais | ✅ | ❌ | ❌ |
| Conexões WhatsApp | ✅ | ❌ | ❌ |
| Definições da IA | ✅ | ✅ | ❌ |
| Ver todos os dados | ✅ | ✅ | ❌ |
| Gerenciar equipe | ✅ | ✅ | ❌ |
| Atendimento inbox | ✅ | ✅ | ✅ |
| Criar tarefas | ✅ | ✅ | ✅ |

## Como Fazer

### Convidar um Novo Membro
1. Clique em **"+ Convidar"**
2. Informe o email do usuário
3. Selecione o cargo (admin/supervisor/agent)
4. Clique em **Enviar Convite**
5. O usuário receberá um email para criar a conta

### Alterar o Cargo de um Membro
1. Clique no card do membro
2. Selecione o novo cargo no dropdown
3. Confirme a alteração
⚠️ Você não pode alterar seu próprio cargo.

### Vincular como Profissional
1. Abra o perfil do membro
2. Ative **"É um Profissional"**
3. Configure horários de trabalho e serviços oferecidos
4. O membro aparecerá na agenda para agendamentos

### Desativar um Membro
1. Clique no card do membro
2. Selecione **"Desativar"**
3. O membro não conseguirá mais fazer login
4. O histórico de dados é preservado

### Redefinir Senha de um Membro
1. Acesse o perfil do membro
2. Clique em **"Redefinir Senha"**
3. Um email de redefinição é enviado automaticamente

## Regras de Negócio

| Regra | Detalhe |
|-------|---------|
| Máximo de 1 supervisor | Por conta, apenas 1 usuário pode ter cargo "supervisor" |
| Admin não se rebaixa | Admin não pode alterar o próprio cargo |
| Convite por email | Usuários são convidados, não criados manualmente |

## Profissionais vs Membros

| Aspecto | Membro (Equipe) | Profissional |
|---------|----------------|-------------|
| Login no sistema | Sim | Opcional |
| Aparece na agenda | Não (padrão) | Sim |
| Comissão de vendas | Sim | Sim |
| Atendimento inbox | Sim | Depende do cargo |

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver membros | ✅ | ✅ | ❌ |
| Convidar membro | ✅ | ✅ | ❌ |
| Alterar cargo | ✅ | ❌ | ❌ |
| Desativar membro | ✅ | ❌ | ❌ |
| Vincular profissional | ✅ | ❌ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Convite não chegou | Peça para verificar spam; reenvie o convite |
| "Apenas 1 supervisor" | Só pode ter 1 supervisor. Remova o atual antes de adicionar outro |
| Membro não aparece na agenda | Ative "É um Profissional" no perfil |
| Não consigo alterar meu cargo | Você não pode alterar o próprio cargo |

## Dicas
- Use o cargo "agent" para atendentes que não precisam de visibilidade total
- Vincule membros como profissionais para integrá-los à agenda
- Supervisores são ideais para gestores que precisam ver relatórios mas não configuram o sistema
