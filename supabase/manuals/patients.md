# Pacientes — Gestão de Pacientes (Clínicas)

## O que é
O módulo de Pacientes é específico para clínicas e profissionais de saúde. Centraliza dados clínicos dos pacientes, histórico de procedimentos e vínculo com contatos de comunicação.

## Acesso
Menu lateral → Operações → Pacientes (ícone de pessoa com cruz)
⚠️ Este módulo é voltado para estabelecimentos de saúde.

## Diferença: Paciente vs Contato

| Aspecto | Paciente | Contato |
|---------|---------|---------|
| Foco | Dados clínicos | Comunicação |
| Campos | Histórico médico, procedimentos | Telefone, canal, tags |
| Vínculo | Pode ter contato vinculado | Independente |
| Uso principal | Prontuário | Inbox, campanhas |

## Campos de um Paciente

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Nome Completo | Texto | Nome legal do paciente |
| Data de Nascimento | Data | Para cálculo de idade |
| CPF | Texto | Documento de identificação |
| Telefone | Texto | Número principal |
| Email | Texto | Email do paciente |
| Profissional Responsável | Profissional | Médico/terapeuta principal |
| Plano/Convênio | Texto | Cobertura de saúde |
| Observações Clínicas | Texto | Notas do prontuário |
| Contato Vinculado | Contato | WhatsApp/Instagram para comunicação |
| Histórico de Procedimentos | Lista | Procedimentos realizados |

## Como Fazer

### Criar um Novo Paciente
1. Clique em **"+ Novo Paciente"**
2. Preencha nome, data de nascimento e telefone
3. Selecione o profissional responsável
4. Adicione informações de convênio
5. Clique em **Salvar**

### Vincular a um Contato de WhatsApp/Instagram
1. Abra o paciente
2. Clique em **"Vincular Contato"**
3. Busque pelo nome ou telefone do contato
4. Selecione e confirme
5. Agora o histórico de conversas fica acessível no perfil

### Registrar um Procedimento
1. Abra o paciente
2. Acesse a aba **"Histórico"**
3. Clique em **"+ Procedimento"**
4. Selecione o tipo de procedimento e a data
5. Adicione observações
6. Salve

### Buscar um Paciente
- Use a busca por nome, CPF ou telefone
- Filtre por profissional responsável ou convênio

## Histórico de Procedimentos

| Campo | Descrição |
|-------|-----------|
| Procedimento | Nome do serviço realizado |
| Data | Quando foi realizado |
| Profissional | Quem realizou |
| Valor | Custo do procedimento |
| Observações | Anotações clínicas |
| Status | Realizado, Cancelado, Pendente |

## Integração com Agenda
- Agendamentos do paciente aparecem no histórico
- Ao confirmar presença, o procedimento é registrado automaticamente

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente/Terapeuta |
|------|-------|-----------|----------------|
| Ver todos os pacientes | ✅ | ✅ | Só os seus |
| Criar paciente | ✅ | ✅ | ✅ |
| Editar dados clínicos | ✅ | ✅ | ✅ (próprios) |
| Registrar procedimento | ✅ | ✅ | ✅ |
| Excluir paciente | ✅ | ❌ | ❌ |
| Ver histórico completo | ✅ | ✅ | Só os seus |

## Segurança e LGPD
- Dados de pacientes são sensíveis — acesso restrito por cargo
- Logs de acesso são registrados automaticamente
- Não compartilhe dados de pacientes por canais não seguros

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Paciente duplicado | Busque antes de criar; o sistema alerta duplicatas por CPF |
| Não vejo o histórico | Verifique suas permissões de cargo |
| Vínculo com contato falhou | O contato precisa ter telefone válido |
| Procedimento não registrou | Verifique se o agendamento foi confirmado |

## Dicas
- Vincule sempre o paciente ao contato de WhatsApp para histórico unificado
- Use observações clínicas para notas rápidas entre sessões
- A Bia pode buscar informações de pacientes e próximos agendamentos
