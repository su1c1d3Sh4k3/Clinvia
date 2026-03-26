# Delivery — Funil de Procedimentos

## O que é
O Delivery é um funil Kanban para acompanhar o progresso de procedimentos/serviços em andamento com clientes, desde o início até a conclusão.

## Acesso
Menu lateral → Gestão → Delivery (ícone de checklist)

## Estrutura da Página
- **Board Kanban**: colunas representando etapas do procedimento
- **Cards**: cada card = um procedimento em andamento para um cliente
- **Toggle de IA**: ativa/desativa a IA para cada card
- **Vínculo com Agenda**: cards podem ser originados de agendamentos

## Etapas Padrão do Delivery
1. **Aguardando** — Procedimento agendado, aguardando início
2. **Em Andamento** — Procedimento iniciado
3. **Revisão** — Aguardando revisão ou aprovação
4. **Concluído** — Finalizado com sucesso
5. **Cancelado** — Procedimento cancelado

(As etapas podem ser personalizadas por admin)

## Campos de um Card

| Campo | Descrição |
|-------|-----------|
| Título | Nome do procedimento |
| Contato | Cliente vinculado |
| Profissional | Quem realizará |
| Data | Data do procedimento |
| Status | Etapa atual no Kanban |
| IA Ativa | Toggle individual de IA |
| Observações | Notas do atendimento |

## Como Fazer

### Criar um Card Manual
1. Clique em **"+ Novo Card"** na coluna desejada
2. Preencha título, contato e profissional
3. Adicione data e observações
4. Clique em **Salvar**

### Mover um Card entre Etapas
1. Arraste o card para a coluna de destino (drag & drop)
2. Ou abra o card e altere a etapa no formulário

### Ativar/Desativar IA em um Card
1. Abra o card
2. Use o toggle **"IA Ativa"**
3. Quando ativado, a IA gerencia a comunicação com o cliente

### Card Criado via Agendamento
- Quando um agendamento é confirmado, um card é criado automaticamente no Delivery
- O card inclui profissional, serviço e data do agendamento

## Integração com Agenda
- Agendamentos confirmados → criam cards em "Aguardando"
- Quando concluído no Delivery → marca agendamento como concluído

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver todos os cards | ✅ | ✅ | ❌ (só os seus) |
| Criar card | ✅ | ✅ | ✅ |
| Mover card | ✅ | ✅ | ✅ (só os seus) |
| Toggle IA | ✅ | ✅ | ✅ |
| Configurar etapas | ✅ | ❌ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Card não criou do agendamento | Verifique se a integração Delivery está ativa nas configurações |
| IA não responde para o cliente do card | Confirme que o toggle de IA está ativo no card E na configuração global |
| Card sumiu | Pode ter sido movido para "Concluído" ou "Cancelado" |
| Não consigo ver o card | Agentes veem apenas seus próprios cards |

## Dicas
- Use o Delivery para serviços que precisam de acompanhamento pós-agendamento
- O toggle de IA por card permite controle granular — desative para casos que precisam de atendimento humano
- Integrate com a agenda para automação completa do fluxo
