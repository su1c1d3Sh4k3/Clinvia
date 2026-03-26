# Follow-Up — Mensagens Automáticas de Acompanhamento

## O que é
O módulo de Follow-Up envia mensagens automáticas para contatos que ficaram sem resposta, reengajando leads e mantendo o relacionamento ativo.

## Acesso
Menu lateral → Operações → Follow-Up (ícone de relógio)

## Como Funciona
1. Um cliente entra em contato mas não recebe resposta ou não conclui o atendimento
2. Após o tempo configurado (fup1, fup2, fup3), o sistema envia uma mensagem automática
3. Se o cliente responder, o follow-up é cancelado para esta conversa

## Configurações Principais

| Campo | Descrição |
|-------|-----------|
| Follow-Up Ativo | Liga/desliga o módulo globalmente |
| Horário Comercial | Envia apenas em horário de funcionamento |
| Follow-Up 1 (horas) | Tempo até 1ª mensagem (ex: 2h) |
| Follow-Up 2 (horas) | Tempo até 2ª mensagem (ex: 24h) |
| Follow-Up 3 (horas) | Tempo até 3ª mensagem (ex: 72h) |

## Templates de Mensagem

### Como Criar um Template
1. Acesse Follow-Up → aba **Templates**
2. Clique em **"+ Novo Template"**
3. Dê um nome ao template
4. Escreva a mensagem (suporta variáveis como {{nome}})
5. Defina para qual follow-up (1, 2 ou 3)
6. Salve

### Variáveis Disponíveis
| Variável | Substitui por |
|---------|--------------|
| {{nome}} | Nome do contato |
| {{empresa}} | Nome da empresa |
| {{profissional}} | Nome do profissional responsável |

## Categorias de Follow-Up
- Organize templates por categoria (ex: Pós-consulta, Proposta enviada, Lead frio)
- Cada categoria pode ter configurações de timing diferentes
- Vincule categorias a filas específicas

## Atribuição a Membros
- Configure quem recebe o follow-up: qualquer agente disponível ou o responsável pela conversa
- Supervisores podem atribuir follow-ups a membros específicos

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver follow-ups | ✅ | ✅ | ✅ (próprios) |
| Criar template | ✅ | ✅ | ❌ |
| Configurar timing | ✅ | ✅ | ❌ |
| Ligar/desligar módulo | ✅ | ✅ | ❌ |
| Cancelar follow-up | ✅ | ✅ | ✅ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Follow-up não envia | Confirme que está ativo nas Definições da IA; verifique horário comercial |
| Mensagem enviada fora do horário | Ative "Horário Comercial" nas configurações |
| Template com variável vazia | Verifique se o campo do contato está preenchido |
| Follow-up continua após resposta | Pode haver delay; o sistema cancela automaticamente |

## Dicas
- Configure horário comercial para evitar mensagens inoportunas
- Personalize os templates com o nome do contato para maior engajamento
- Use 3 follow-ups com espaçamento crescente: ex: 2h, 24h, 72h
- A Bia pode verificar se um contato está em follow-up ativo
