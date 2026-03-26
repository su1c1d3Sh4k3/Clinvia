# Central de Atualizações — Novidades da Plataforma

## O que é
A Central de Atualizações exibe todas as novidades, melhorias, correções e alertas lançados pela equipe da Clinvia para a plataforma.

## Acesso
Menu lateral → ícone de megafone (🔊) → Atualizações
Ou acesse diretamente em /reports

## Estrutura da Página
- **4 Seções Accordion**: Alertas, Atualizações, Melhorias, Correções
- **Badge de Não Lidos**: aparece no menu lateral com o número de atualizações não vistas
- **Cards de Atualização**: cada novidade em um card visual

## Tipos de Atualização

| Tipo | Cor | Ícone | Descrição |
|------|-----|-------|-----------|
| **alert** | Vermelho 🔴 | ⚠️ AlertTriangle | Avisos importantes, manutenções, instabilidades |
| **update** | Azul 🔵 | 🔄 RefreshCw | Novas funcionalidades lançadas |
| **improvement** | Verde 🟢 | 📈 TrendingUp | Melhorias em funcionalidades existentes |
| **fix** | Âmbar 🟡 | 🔧 Wrench | Correções de bugs e problemas |

## Campos de uma Atualização

| Campo | Descrição |
|-------|-----------|
| Título | Resumo da mudança |
| Conteúdo | Descrição detalhada |
| Áreas Afetadas | Tags indicando quais módulos foram impactados |
| Nível de Impacto | Escala de 0 a 10 (Baixo/Médio/Alto) |
| Data de Publicação | Quando foi lançado |

## Níveis de Impacto

| Nível | Intervalo | Cor |
|-------|-----------|-----|
| Baixo | 0–3 | 🟢 Verde |
| Médio | 4–6 | 🟡 Âmbar |
| Alto | 7–10 | 🔴 Vermelho |

## Badge de Não Lidos
- O ícone de megafone no menu lateral mostra quantas atualizações você ainda não visualizou
- Ao abrir a página /reports, todas as atualizações são marcadas como lidas automaticamente
- O badge some após a visita

## Publicação de Atualizações (Admin)
Apenas usuários com cargo **super-admin** podem publicar novas atualizações.

### Como Publicar (super-admin)
1. Acesse a aba **"Atualizações"** na página Admin (/admin)
2. Clique em **"Lançar Notificação"**
3. Selecione o tipo (alert/update/improvement/fix)
4. Preencha título, conteúdo e áreas afetadas
5. Defina o nível de impacto no slider
6. Use **"Revisão Ortográfica"** para corrigir texto com IA
7. Clique em **"Visualizar Preview"** para ver como ficará
8. Confirme com **"Aprovar e Publicar"**

## Permissões por Cargo

| Ação | Super-Admin | Admin | Supervisor | Agente |
|------|------------|-------|-----------|--------|
| Ver atualizações | ✅ | ✅ | ✅ | ✅ |
| Marcar como lido | ✅ | ✅ | ✅ | ✅ |
| Publicar atualização | ✅ | ❌ | ❌ | ❌ |

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| Badge não some | Abra a página /reports para marcar tudo como lido |
| Atualização não aparece | Aguarde alguns instantes e recarregue |
| Não vejo o botão de publicar | Apenas super-admins podem publicar |

## Dicas
- Verifique a Central de Atualizações regularmente para ficar por dentro das novidades
- Alertas em vermelho são prioritários — leia primeiro
- A Bia pode informar sobre as últimas atualizações disponíveis
