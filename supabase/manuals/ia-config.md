# Definições da IA — Configuração do Agente Bia

## O que é
A página de Definições da IA permite configurar todos os aspectos da assistente inteligente (IA) da empresa: personalidade, horários, follow-ups, agendamentos automáticos e integrações.

## Acesso
Menu lateral → Automação → Definições da IA (ícone de robô)
⚠️ Apenas Admin e Supervisor têm acesso. Agentes são redirecionados.

## Abas Disponíveis

### 1. Identidade
Configura a personalidade e informações da empresa que a IA conhecerá.

| Campo | Descrição |
|-------|-----------|
| Nome do Agente | Como a IA se apresenta (ex: "Bia") |
| Gênero | Feminino ou Masculino |
| Nome da Empresa | Usado nas apresentações |
| Endereço | Localização física |
| Link Google Maps | URL do Google Maps |
| Site | URL do site |
| Instagram | @perfil do Instagram |
| Facebook | URL do Facebook |
| Horário de Funcionamento | Texto livre (ex: "Seg-Sex 8h-18h") |
| Formas de Pagamento | PIX, cartão, dinheiro, etc. |
| Restrições | O que a empresa NÃO faz |

### 2. Atendimento
| Campo | Descrição |
|-------|-----------|
| IA Ativa | Liga/desliga a IA globalmente |
| Mensagem de Boas-Vindas | Primeira mensagem enviada automaticamente |
| Descrição do Negócio | Contexto para respostas da IA |
| Qualificação de Leads | Perguntas para qualificar clientes |
| Perguntas Frequentes | FAQ para a IA responder |
| Delay de Resposta | Segundos de espera antes de responder (padrão: 15s) |

### 3. Follow-Up
| Campo | Descrição |
|-------|-----------|
| Follow-Up Ativo | Liga/desliga follow-up automático |
| Horário Comercial | Só envia em horário de funcionamento |
| Follow-Up 1/2/3 | Horas de espera antes de cada envio |

### 4. Agendamentos
| Campo | Descrição |
|-------|-----------|
| Agendamento via IA | Permite que a IA agende pelo WhatsApp |

### 5. CRM Automático
| Campo | Descrição |
|-------|-----------|
| CRM Automático | IA cria deals automaticamente na chegada de leads |

### 6. Convênios (Clínicas)
- Gerencia planos/convênios aceitos
- A IA usa essa lista para responder dúvidas sobre cobertura

## Como Fazer

### Ligar/Desligar a IA
1. Acesse a aba **Atendimento**
2. Clique no toggle **"IA Ativa"**
3. Salve as configurações

### Configurar Follow-Up
1. Acesse a aba **Follow-Up**
2. Ative o toggle **"Follow-Up Ativo"**
3. Configure os horários (fup1, fup2, fup3 em horas)
4. Ative "Horário Comercial" para evitar mensagens fora do expediente

### Usar o Wizard Bia
1. Clique em **"Configurar com Bia"** (botão roxo com ✨)
2. A Bia fará perguntas guiadas para preencher todas as configurações
3. Ideal para primeiros acessos

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Acessar página | ✅ | ✅ | ❌ (redirecionado) |
| Editar configurações | ✅ | ✅ | ❌ |
| Ligar/desligar IA | ✅ | ✅ | ❌ |
| Configurar follow-up | ✅ | ✅ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| IA não responde | Verifique se "IA Ativa" está ligado e se a instância WhatsApp está conectada |
| Follow-up não envia | Confirme que "Follow-Up Ativo" está ligado e verifique os horários |
| Agendamento não funciona | Ative "Agendamento via IA" e verifique se há profissionais cadastrados |
| Configurações não salvam | Verifique sua conexão e tente novamente |

## Dicas
- Use o Wizard Bia para configuração inicial — é mais rápido e intuitivo
- Configure a Descrição do Negócio com detalhes para a IA responder perguntas específicas
- O delay de resposta evita que a IA responda mensagens incompletas
- Ative "Horário Comercial" no follow-up para não incomodar clientes fora do expediente
