# Manual - Equipe

Página para gerenciar membros da equipe (atendentes/supervisores) e profissionais (agenda).

> **Acesso**: Apenas Admins e Supervisores. Agentes não têm acesso.

---

## Conceitos

### Membro da Equipe
Usuário do sistema que faz login e atende conversas:
- **Admin**: Acesso total ao sistema
- **Supervisor**: Acesso intermediário
- **Atendente**: Acesso limitado a conversas

### Profissional
Pessoa que realiza atendimentos agendados (pode ou não ter login):
- Aparece na agenda
- Pode receber agendamentos
- Tem serviços e horários definidos

---

## Seção: Membros da Equipe

### Cabeçalho
- **Título**: "Equipe"
- **Botão Adicionar Membro**: Cria novo usuário

### Tabela de Membros

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome do membro |
| **Email** | Email de login |
| **Função** | Admin, Superv. ou Atend. |
| **Telefone** | Contato pessoal |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Modal: Adicionar Membro

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome completo | ✅ |
| **Email** | Email para login | ✅ |
| **Senha** | Senha de acesso | ✅ |
| **Telefone** | Contato pessoal | ❌ |
| **Função** | Atendente ou Supervisor | ✅ |
| **Comissão (%)** | Percentual de comissão | ❌ (só Admin) |

> **Nota**: Supervisores só podem criar Atendentes. Apenas Admins criam Supervisores.

---

## Modal: Editar Membro

### Campos editáveis
- Nome
- Telefone
- Função (apenas Admin pode alterar)
- Comissão (apenas Admin)

> **Nota**: Email e senha só podem ser alterados pelo próprio usuário em Configurações.

---

## Funções/Cargos

| Função | Descrição |
|--------|-----------|
| **Admin** | Acesso total. Pode criar/editar/excluir tudo |
| **Supervisor** | Acesso intermediário. Pode gerenciar atendentes |
| **Atendente** | Apenas atende conversas e usa o chat |

### Permissões Detalhadas

| Recurso | Admin | Supervisor | Atendente |
|---------|-------|------------|-----------|
| Dashboard | ✅ | ✅ | ❌ |
| Conversas | ✅ | ✅ | ✅ |
| Contatos | ✅ | ✅ | ✅ (ver) |
| CRM | ✅ | ✅ | ✅ |
| Equipe | ✅ | ✅ | ❌ |
| Financeiro | ✅ | Opcional | ❌ |
| Configurações | ✅ | ✅ | Própria |
| Definições IA | ✅ | ✅ | ❌ |

---

## Seção: Profissionais

### Cabeçalho
- **Título**: "Profissionais"
- **Botão Adicionar Prof.**: Cadastra novo profissional

### Tabela de Profissionais

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome + foto |
| **Função** | Cargo/especialidade |
| **Serviços** | Serviços que realiza |
| **Dias** | Dias de trabalho |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Modal: Profissional

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome do profissional | ✅ |
| **Função** | Cargo/especialidade | ❌ |
| **Foto** | Imagem de perfil | ❌ |
| **Serviços** | Quais serviços realiza | ❌ |
| **Dias de Trabalho** | Dom a Sáb | ❌ |
| **Horário Início** | Começa a trabalhar | ❌ |
| **Horário Fim** | Termina de trabalhar | ❌ |

---

## Como Adicionar um Membro

1. Clique em **"Adicionar Membro"**
2. Preencha **Nome**, **Email** e **Senha**
3. Opcionalmente adicione **Telefone**
4. Escolha a **Função** (Atendente/Supervisor)
5. Se Admin, defina a **Comissão**
6. Clique em **"Criar Membro"**

> O novo membro receberá acesso imediato com o email/senha definidos.

---

## Como Adicionar um Profissional

1. Clique em **"Adicionar Prof."**
2. Preencha o **Nome**
3. Adicione **Função** (ex: "Dentista", "Cabeleireiro")
4. Selecione os **Serviços** que realiza
5. Marque os **Dias de Trabalho**
6. Defina **Horários** de início e fim
7. Clique em **"Salvar"**

---

## Comissão

- Valor percentual (0-100%)
- Usado para cálculo de comissões em vendas
- Aparece nos relatórios financeiros
- Configurado apenas pelo Admin

---

## Exclusão

### Excluir Membro:
1. Clique no 🗑️ na linha
2. Confirme a exclusão
3. Usuário perde acesso ao sistema

> **Atenção**: Admin não pode ser excluído!

### Excluir Profissional:
1. Clique no 🗑️ na linha
2. Confirme a exclusão
3. Agendamentos existentes são mantidos

---

## Problemas Comuns

### "Não consigo acessar a página"
- Apenas Admins e Supervisores têm acesso
- Atendentes não podem ver esta página

### "Não consigo criar Supervisor"
- Apenas Admins podem criar Supervisores
- Supervisores só criam Atendentes

### "Não consigo excluir membro"
- Admins não podem ser excluídos
- Só Admins podem excluir membros

### "Novo membro não consegue logar"
- Verifique se email está correto
- Senha diferencia maiúsculas/minúsculas

---

## Dicas de Uso

1. **Use senhas fortes**: Mínimo 8 caracteres
2. **Defina comissões**: Para controle financeiro
3. **Cadastre profissionais**: Para usar a agenda
4. **Vincule serviços**: Profissional só aparece na agenda se tiver serviços
5. **Configure horários**: Para slots corretos na agenda
