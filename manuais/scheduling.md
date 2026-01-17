# Manual - Agendamentos

Página para gerenciar a agenda de profissionais, criar agendamentos de clientes e marcar ausências.

> **Acesso**: Todos os usuários podem acessar esta funcionalidade.

---

## Conceitos

### Agendamento
Horário reservado para atendimento de um cliente com um profissional.

### Ausência
Bloqueio de horário onde o profissional não está disponível (almoço, reunião, folga).

### Profissional
Pessoa que realiza atendimentos e tem agenda própria.

---

## Interface da Página

### Sidebar (Barra Lateral)

| Elemento | Função |
|----------|--------|
| **Calendário** | Seleciona a data para visualizar |
| **Adicionar Profissional** | Cadastra novo profissional |
| **Filtrar por Serviço** | Mostra apenas profissionais de determinado serviço |

### Área Principal

| Elemento | Função |
|----------|--------|
| **Navegação de data** | ◀ Anterior | Data | Próximo ▶ |
| **Botão Hoje** | Volta para a data atual |
| **Botão Configurações** ⚙️ | Abre configurações de horários |
| **Campo Busca** | Filtra agendamentos por cliente |
| **Criar Agendamento** | Abre modal para novo agendamento |
| **Grade de horários** | Visualização dos agendamentos por profissional |

---

## Grade de Horários

Visualização em colunas com:
- Cada coluna = um profissional
- Cada linha = intervalo de tempo
- Blocos coloridos = agendamentos/ausências

### Cores dos Blocos

| Cor | Tipo | Significado |
|-----|------|-------------|
| 🔵 Azul | Agendamento | Cliente agendado |
| ⚫ Cinza | Ausência | Horário bloqueado |
| 🟢 Verde | Concluído | Atendimento finalizado |
| 🔴 Vermelho | Cancelado | Agendamento cancelado |

---

## Modal: Criar Agendamento

### Abas
| Aba | Função |
|-----|--------|
| **Agendamento** | Marcar horário com cliente |
| **Ausência** | Bloquear horário do profissional |

### Campos para Agendamento

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Profissional** | Quem vai atender | ✅ |
| **Contato** | Selecionar contato existente | ❌ |
| **Nome do Cliente** | Nome para identificação | ✅ |
| **Telefone** | Número do cliente | ❌ |
| **Serviço** | Qual serviço será realizado | ❌ |
| **Data** | Data do agendamento | ✅ |
| **Início** | Horário de início | ✅ |
| **Duração (min)** | Tempo do atendimento | ✅ |
| **Valor (R$)** | Preço do serviço | ❌ |
| **Descrição** | Observações | ❌ |

### Campos para Ausência

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Profissional** | Quem estará ausente | ✅ |
| **Data** | Data da ausência | ✅ |
| **Início** | Horário de início | ✅ |
| **Fim** | Horário de término | ✅ |
| **Descrição** | Motivo da ausência | ❌ |

---

## Lista de Horários Disponíveis

Ao criar/editar agendamento:
- Horários passados não aparecem (se for hoje)
- Horários ocupados aparecem marcados como "ocupado"
- Intervalos são baseados na duração do serviço

---

## Modal: Profissional

### Campos

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome do profissional | ✅ |
| **Serviços** | Quais serviços pode realizar | ❌ |

---

## Modal: Configurações de Agenda

Acesse pelo ícone ⚙️ (engrenagem).

### Campos

| Campo | Descrição |
|-------|-----------|
| **Horário de Início** | Primeiro horário da agenda (ex: 08:00) |
| **Horário de Término** | Último horário da agenda (ex: 20:00) |
| **Intervalo Padrão** | Duração padrão dos slots (ex: 30 min) |

---

## Status de Agendamento

| Status | Significado | Ação |
|--------|-------------|------|
| **scheduled** | Agendado | Aguardando atendimento |
| **confirmed** | Confirmado | Cliente confirmou presença |
| **completed** | Concluído | Atendimento realizado |
| **cancelled** | Cancelado | Agendamento cancelado |
| **rescheduled** | Reagendado | Foi movido para outro horário |
| **no_show** | Não compareceu | Cliente faltou |

---

## Como Criar um Agendamento

### Pelo botão:
1. Clique em **"Criar Agendamento"**
2. Selecione o **Profissional**
3. Busque ou digite dados do **Cliente**
4. Escolha o **Serviço** (preenche duração e valor)
5. Selecione **Data** e **Horário**
6. Clique em **"Salvar"**

### Clicando na grade:
1. Clique em um horário vazio de um profissional
2. Modal abre com profissional e horário pré-selecionados
3. Preencha os dados do cliente
4. Clique em **"Salvar"**

---

## Como Marcar Ausência

1. Clique em **"Criar Agendamento"**
2. Vá na aba **"Ausência"**
3. Selecione o **Profissional**
4. Defina **Data**, **Início** e **Fim**
5. Adicione descrição (ex: "Almoço", "Reunião")
6. Clique em **"Salvar"**

---

## Como Editar/Mudar Status

1. Clique no bloco do agendamento na grade
2. Modal abre com dados preenchidos
3. Modifique o que for necessário
4. Clique em **"Salvar"**

### Mudar Status (via menu):
- Clique com botão direito ou no menu do bloco
- Selecione: Concluir, Cancelar, Reagendar, etc.

---

## Integração com Vendas

Quando um agendamento é marcado como **"Concluído"**:
1. Sistema pergunta se deseja registrar venda
2. Abre modal de Venda pré-preenchido com:
   - Cliente
   - Serviço
   - Valor
   - Data

---

## Problemas Comuns

### "Horário aparece como ocupado"
- Outro agendamento já existe nesse horário
- Há uma ausência marcada

### "Não consigo agendar no passado"
- Sistema só permite agendamentos futuros
- Para editar passados, apenas visualização

### "Profissional não aparece"
- Verifique se está cadastrado
- Verifique o filtro de serviços

### "Serviço não preenche duração/valor"
- Cadastre duração e valor no serviço
- Vá em **Produtos e Serviços** → Edite o serviço

---

## Dicas de Uso

1. **Cadastre serviços primeiro**: Com duração e valor definidos
2. **Use o filtro de serviços**: Para ver só profissionais relevantes
3. **Marque ausências**: Almoço, reuniões, folgas
4. **Confirme agendamentos**: Ajuda no controle de no-shows
5. **Complete para registrar venda**: Automatiza o financeiro
