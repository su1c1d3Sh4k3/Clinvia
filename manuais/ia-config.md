# Manual - Definições de IA

Página onde você configura a inteligência artificial que atende seus clientes automaticamente via WhatsApp e Instagram.

> **Acesso**: Apenas Admins e Supervisores podem acessar esta página.

---

## Navegação

A página possui 5 abas:

| Aba | Ícone | Função |
|-----|-------|--------|
| **Empresa** | 🏢 | Dados sobre sua empresa |
| **Restrições** | 🚫 | O que a IA NÃO deve fazer |
| **Qualificação** | 🎯 | Perguntas para qualificar leads |
| **F.A.Q** | ❓ | Dúvidas frequentes e respostas |
| **Config** | ⚙️ | Ativação e comportamento da IA |

---

## Aba: Empresa

Informações que a IA usará para contextualizar as respostas.

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| **Nome do agente IA** | Nome da sua assistente virtual | Luna, Clara, Sofia |
| **Nome da empresa** | Nome do seu negócio | Clinvia Beleza |
| **Link Google** | Link do Google Maps | https://maps.google.com/... |
| **Site** | URL do seu site | https://clinvia.com.br |
| **Instagram** | @ do Instagram | @clinvia |
| **Facebook** | Página no Facebook | facebook.com/clinvia |
| **Endereço** | Endereço completo | Rua das Flores, 123 |
| **Descrição** | O que sua empresa faz, diferenciais | Texto livre |
| **Frase de boas-vindas** | Como a IA cumprimentará | "Olá! Sou a Luna, assistente da Clinvia..." |
| **Horário** | Horário de funcionamento | Segunda a Sexta: 8h às 18h |
| **Pagamento** | Formas aceitas | PIX, Cartão, Boleto |

> **Dica**: Quanto mais detalhada a descrição, melhor a IA responde!

---

## Aba: Restrições

Lista de coisas que a IA **NÃO DEVE** fazer.

### Como adicionar:
1. Clique em **"Adicionar Restrição"**
2. Digite a restrição (ex: "Não informar preços sem consultar tabela")
3. Repita para outras restrições
4. Clique em **Salvar**

### Exemplos de restrições:
- Não dar desconto sem autorização
- Não prometer prazos específicos
- Não falar sobre concorrentes
- Não responder sobre assuntos pessoais

---

## Aba: Qualificação

Fluxos de perguntas para classificar leads por produto/serviço.

### Como criar um fluxo:
1. Clique em **"Adicionar outro fluxo"**
2. Selecione o **Produto/Serviço** (cadastrado previamente)
3. Escreva o **fluxo de qualificação**:
   - Perguntas a fazer
   - Critérios de classificação
   - Quando transferir para humano
4. Clique em **Salvar**

### Exemplo de fluxo:
```
Perguntar:
1. Qual procedimento deseja? (Botox, Preenchimento, outro)
2. Já fez esse procedimento antes?
3. Quando gostaria de agendar?

Qualificar como QUENTE se:
- Quer agendar para esta semana
- Já fez o procedimento antes

Transferir para humano se:
- Mencionar complicações
- Preço acima de R$X
```

---

## Aba: F.A.Q

Perguntas frequentes e suas respostas.

### Estrutura:

**1. Dúvidas sobre a empresa** (campo fixo)
- Horário de funcionamento
- Localização
- Formas de contato
- Políticas gerais

**2. Dúvidas por Produto/Serviço** (dinâmico)
- Adicione um bloco por produto/serviço
- Escreva perguntas e respostas específicas

### Formato recomendado:
```
P: Qual o horário de funcionamento?
R: Funcionamos de segunda a sexta, das 8h às 18h.

P: Onde fica a clínica?
R: Estamos na Rua das Flores, 123 - Centro.

P: Aceitam cartão?
R: Sim! Aceitamos todas as bandeiras.
```

---

## Aba: Configurações

Controles de ativação e comportamento.

### Ligar IA

| Estado | Ação |
|--------|------|
| **Desligado** | IA não responde ninguém |
| **Ligado** | Mostra lista de instâncias para ativar individualmente |

**Fluxo para ativar:**
1. Ligue o switch **"Ligar IA"**
2. Uma lista de instâncias conectadas aparece
3. Ative cada instância desejada (WhatsApp/Instagram)
4. A IA começa a responder nessa instância

> **Nota**: Para desligar a IA, primeiro desative todas as instâncias.

---

### Delay (segundos)

Tempo que a IA espera antes de responder.

| Valor | Comportamento |
|-------|---------------|
| **15** (mínimo) | Resposta quase instantânea |
| **30-60** | Mais natural, simula digitação |
| **120** (máximo) | Bem lento |

---

### Follow Up

Mensagens automáticas quando o cliente não responde.

| Follow Up | Descrição |
|-----------|-----------|
| **FUP 1** | Primeira mensagem de retomada |
| **FUP 2** | Segunda tentativa |
| **FUP 3** | Última tentativa |

**Campos por Follow Up:**
- **Minutos**: Tempo de espera antes de enviar (mín. 10)
- **Mensagem**: Texto a ser enviado

**Exemplo:**
- FUP 1: 60 min → "Olá! Vi que você não respondeu, posso ajudar?"
- FUP 2: 120 min → "Oi! Ainda estou aqui caso precise de algo."
- FUP 3: 180 min → "Última tentativa! Qualquer dúvida, é só chamar."

---

### CRM Automático

Quando ativado, a IA cadastra automaticamente os leads no CRM.

**Ao ativar pela primeira vez:**
- Um modal pergunta se deseja criar o **Funil IA**
- O funil é criado com etapas padrão:
  - Cliente Novo (IA)
  - Qualificado (IA)
  - Agendado (IA)
  - Atendimento Humano (IA)
  - Follow Up (IA)
  - Sem Contato (IA)
  - Sem Interesse (IA)

---

### Agendamento

Quando ativado, a IA prioriza agendar horários para o cliente.

Integra com a página **Agendamentos** para verificar disponibilidade.

---

### Follow Up horário comercial

Quando ativado, os follow-ups só são enviados entre **7h e 18h**.

Útil para evitar mensagens de madrugada.

---

### Responder áudios com IA

Quando ativado, a IA responde com áudio gerado automaticamente.

**Configuração:**
- **Gênero da voz**: Feminino ou Masculino

---

## Problemas Comuns

### "A IA não está respondendo"
1. Verifique se a IA está **ligada**
2. Verifique se a **instância específica** está ativada
3. Verifique se salvou as configurações

### "A IA responde com informações erradas"
1. Revise a aba **Empresa** (informações desatualizadas)
2. Revise a aba **F.A.Q** (respostas incorretas)
3. Adicione **Restrições** para evitar certos comportamentos

### "Os follow-ups não estão sendo enviados"
1. Verifique se o **Follow Up** está ativado
2. Verifique se os switches individuais (FUP1, FUP2, FUP3) estão ligados
3. Verifique se o tempo configurado já passou

### "Quero desligar a IA mas não consigo"
1. Primeiro desative cada instância individualmente
2. Depois desligue o switch principal

---

## Dicas de Uso

1. **Preencha tudo**: Quanto mais informações, melhor a IA
2. **Use restrições**: Evite comportamentos indesejados
3. **Teste a IA**: Mande mensagem para você mesmo e veja como ela responde
4. **Revise o F.A.Q**: Perguntas frequentes bem respondidas = menos transferências para humanos
5. **Calibre o delay**: Respostas muito rápidas parecem robôs, muito lentas irritam
