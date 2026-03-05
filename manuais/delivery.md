# Manual - Delivery (Funil de Procedimentos)

Página para acompanhar o ciclo completo dos procedimentos vendidos, desde o agendamento até a conclusão. Funciona como um funil Kanban paralelo ao CRM, focado na execução dos serviços.

> **Acesso**: Todos os cargos podem visualizar e gerenciar deliveries.

---

## 📍 Como Acessar

No **menu lateral**, abra o submenu **"Gestão"** (ícone de camadas 🗂️) e clique em **"Delivery"** (ícone de prancheta ✅).

URL direta: `/delivery`

---

## Conceitos Principais

### Delivery (Procedimento)
Cada delivery representa **um procedimento/serviço que foi vendido e precisa ser executado**. É criado automaticamente quando um deal é fechado como "Ganho" no CRM, ou manualmente pelo botão "+ Adicionar Procedimento".

### Estágios do Funil

| Estágio | Cor | Significado |
|---------|-----|-------------|
| **Aguardando Agendamento** | Cinza | Procedimento vendido, ainda sem data |
| **Procedimento Agendado** | Azul | Data marcada no sistema |
| **Procedimento Confirmado** | Roxo | Paciente confirmou presença |
| **Procedimento Concluído** | Verde | Procedimento realizado com sucesso |
| **Procedimento Cancelado** | Vermelho | Procedimento cancelado |

---

## Interface da Página

### Cabeçalho

| Elemento | Função |
|----------|--------|
| **Toggle "IA Automática"** | Ativa/desativa automações de IA para Delivery |
| **+ Adicionar Procedimento** | Abre modal para criar delivery manualmente |

### Filtros

| Filtro | Função |
|--------|--------|
| **Busca por paciente** | Filtra em tempo real pelo nome |
| **Período** | Filtro por intervalo de datas de criação |
| **Profissional** | Mostra só procedimentos de um profissional |
| **Paciente** | Filtro por paciente específico |
| **Limpar** | Remove todos os filtros ativos |

### Board Kanban

- **5 colunas** fixas (uma por estágio)
- Cards agrupados por paciente dentro de cada coluna
- Arraste cards entre colunas para atualizar o estágio

---

## Card de Procedimento

Cada card exibe:

| Elemento | Descrição |
|----------|-----------|
| **Foto + Nome do Paciente** | Quem receberá o procedimento |
| **Telefone** | Contato do paciente |
| **Serviço** | Nome do procedimento (em destaque) |
| **Profissional** | Quem executará |
| **Datas** | Venda, Contato e Limite inline |
| **Indicador de urgência** | Borda colorida à esquerda |

### Indicador de Urgência (Borda Esquerda)

| Cor | Significado |
|-----|-------------|
| 🟢 Verde | Tudo dentro do prazo |
| 🟡 Amarelo | Data de contato passou — entre em contato |
| 🔴 Vermelho | Faltam 5 dias ou menos para o prazo limite |

### Botões de Ação (visíveis no card)

| Botão | Função |
|-------|--------|
| 👁 Ver | Abre modal com todos os detalhes |
| 📅 Agendar | Abre agendamento vinculado ao paciente |
| 💬 Chat | Abre conversa com o paciente no Inbox |

---

## Como Criar um Procedimento Manualmente

1. Clique em **"+ Adicionar Procedimento"**
2. Preencha os campos:
   - **Paciente** (obrigatório) — use o **+** para cadastrar novo
   - **Profissional Responsável** — quem executará o procedimento
   - **Serviço / Procedimento** — filtrado pelo profissional selecionado
   - **Data da Venda** — quando foi contratado
   - **Data de Contato** — quando entrar em contato com o paciente
   - **Data Limite** — prazo máximo para execução
   - **Usuário Responsável** — membro da equipe que acompanha
   - **Observações** — notas adicionais
3. Clique em **"Adicionar"**
4. O procedimento aparece na coluna **"Aguardando Agendamento"**

---

## Lançamento Automático a partir do CRM

Quando um deal é marcado como **"Ganho"** no CRM e contém serviços:

1. O sistema detecta os serviços do deal
2. Abre automaticamente o modal **"Lançar Procedimentos"**
3. Para cada serviço (uma unidade = um card), preencha:
   - Profissional responsável pela execução
   - Data de contato e data limite
   - Observações opcionais
4. Clique em **"Lançar Procedimentos"** para criar todos de uma vez

> Se o contato do deal não tiver paciente cadastrado, o sistema pedirá o cadastro antes de lançar.

> Um serviço comprado em quantidade 3 gera **3 cards independentes** (podem ter profissionais e datas diferentes).

---

## Como Avançar um Procedimento

### Arrastar e Soltar
1. Clique e segure o card
2. Arraste até a coluna do novo estágio
3. Solte para confirmar (atualização imediata)

### Fluxo Recomendado

```
Aguardando Agendamento
    → Marque a data no sistema (botão 📅)
    → Arraste para "Procedimento Agendado"
    → Ao confirmar presença: arraste para "Procedimento Confirmado"
    → Após execução: arraste para "Procedimento Concluído"
```

---

## Como Agendar o Procedimento

1. No card, clique no botão **📅 Agendar**
2. O modal de agendamento abre com o paciente pré-selecionado
3. Escolha data, horário e profissional
4. Salve o agendamento
5. Arraste o card para **"Procedimento Agendado"**

---

## Visualizar Detalhes do Procedimento

1. No card, clique no botão **👁 Ver**
2. Modal exibe todas as informações:
   - Estágio atual
   - Dados do paciente e contato
   - Serviço e valor
   - Profissional e responsável
   - Todas as datas
   - Observações
   - Data de criação

---

## Dashboard — Funil de Deliveries

No **Dashboard**, há um card resumo do funil de Delivery com:
- Contagem de procedimentos por estágio principal
- Taxa de conversão entre estágios
- Total de concluídos e cancelados
- **Taxa de perda** (cancelados / total)

Clique no card do Dashboard para ir direto à página de Delivery.

---

## Integração com Outras Páginas

| Integração | Como funciona |
|------------|---------------|
| **CRM** | Deals "Ganhos" com serviços criam deliveries automaticamente |
| **Agendamentos** | Botão 📅 no card abre o módulo de agendamento |
| **Inbox** | Botão 💬 no card abre a conversa com o paciente |
| **Dashboard** | Exibe resumo do funil com métricas de conversão |

---

## Problemas Comuns

### "Não vejo o procedimento criado no CRM"
- Verifique se o deal continha **serviços** (não apenas produtos)
- Confirme que o modal "Lançar Procedimentos" foi submetido (não cancelado)
- Acesse `/delivery` e verifique na coluna "Aguardando Agendamento"

### "Botão de agendar não aparece"
- O botão aparece apenas para pacientes com contato vinculado
- Verifique se o paciente foi cadastrado corretamente com o campo de contato

### "Não consigo arrastar o card"
- Clique e segure por 1 segundo antes de arrastar

### "O card aparece com borda vermelha"
- O prazo limite está a 5 dias ou menos — ação imediata necessária

### "Profissional não aparece na lista"
- No cadastro do profissional, verifique se o serviço está vinculado a ele
- Profissionais sem serviços configurados aparecem para qualquer serviço

---

## Dicas de Uso

1. **Monitore bordas vermelhas diariamente**: indicam urgência máxima
2. **Use o filtro por profissional**: facilita reuniões de acompanhamento
3. **Vincule agendamento ao delivery**: use o botão 📅 para manter tudo sincronizado
4. **Acompanhe o Dashboard**: a taxa de cancelamento indica problemas no processo
5. **Use o botão 💬**: entre em contato com o paciente sem sair da tela
