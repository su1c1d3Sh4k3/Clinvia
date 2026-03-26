# Contatos — Gestão da Base de Clientes

## O que é
O módulo de Contatos centraliza todos os clientes e leads da empresa, com informações de canal de comunicação, tags e histórico de conversas.

## Acesso
Menu lateral → Operações → Contatos (ícone de agenda)

## Estrutura da Página
- **Lista de Contatos**: tabela ou cards com todos os contatos
- **Barra de Busca**: pesquisa por nome, telefone ou email
- **Filtros**: por tag, canal, status
- **Botão "+ Novo Contato"**: adicionar manualmente
- **Importar CSV**: importação em massa

## Campos de um Contato

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Nome | Texto | Nome completo ou apelido |
| Telefone | Texto | WhatsApp (ex: 5511999998888) |
| Email | Texto | Endereço de email (opcional) |
| Canal | Enum | whatsapp, instagram |
| Tags | Array | Etiquetas de categorização |
| Observações | Texto | Anotações internas |
| Profissional Responsável | Profissional | Vínculo com agenda |

## Como Fazer

### Criar um Novo Contato
1. Clique em **"+ Novo Contato"**
2. Preencha nome e telefone (obrigatórios)
3. Adicione email, tags e observações
4. Selecione o canal (WhatsApp por padrão)
5. Clique em **Salvar**

### Editar um Contato
1. Clique no contato na lista
2. Modifique os campos desejados
3. Clique em **Salvar**

### Adicionar Tags
1. Na edição do contato, clique no campo Tags
2. Selecione tags existentes ou digite para criar novas
3. Salve o contato

### Envio em Massa
1. Selecione múltiplos contatos com a checkbox
2. Clique em **"Enviar Mensagem"**
3. Digite a mensagem ou selecione template
4. Confirme o envio

### Importar Contatos via CSV
1. Clique em **"Importar"** → **"CSV"**
2. Baixe o modelo de planilha
3. Preencha com nome, telefone e dados adicionais
4. Faça upload do arquivo
5. Revise e confirme a importação

## Tags e Categorização
- Tags ajudam a segmentar contatos para campanhas
- A tag **"IA"** tem proteção especial — não pode ser removida manualmente
- Tags coloridas facilitam a identificação visual

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|-----------|--------|
| Ver todos os contatos | ✅ | ✅ | ✅ |
| Criar contato | ✅ | ✅ | ✅ |
| Editar contato | ✅ | ✅ | ✅ |
| Excluir contato | ✅ | ✅ | ❌ |
| Importar CSV | ✅ | ✅ | ❌ |
| Envio em massa | ✅ | ✅ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Contato duplicado | Use a busca antes de criar; o sistema alerta duplicatas por telefone |
| Não aparece no inbox | O contato precisa iniciar uma conversa ou ser ativado via envio |
| Tag não remove | Verifique se é a tag "IA" (protegida) |
| Importação falhou | Confira o formato do telefone: 5511999998888 (sem traços ou parênteses) |

## Dicas
- Mantenha telefones no formato internacional (55 + DDD + número)
- Use tags para segmentar campanhas de follow-up
- A Bia pode criar contatos por comando de texto
- Vincule contatos a profissionais para facilitar a agenda
