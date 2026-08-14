# Plano — Página "Suporte" (manual interativo do sistema)

Objetivo: página `/suporte` (sidebar, entre Conexões e Configurações), container de abas onde cada aba documenta uma ferramenta do sistema de forma didática, com exemplos práticos, simulações e animações. Primeira aba: **Campanhas**.

---

## 1. Pesquisa de ferramentas (2026)

### 1.1 Animação

| Opção | Tamanho | Veredito |
|---|---|---|
| **tailwindcss-animate** (já instalado) | 0 JS | ✅ Base — o projeto já proíbe framer-motion (CLAUDE.md); cobre fade/slide/zoom/accordion |
| **@formkit/auto-animate** | ~2KB gzip | ✅ Recomendado — anima listas/acordeões/trocas de conteúdo com 1 ref, zero config |
| Motion (ex-framer-motion) | ~30KB | ❌ Vetado pelas convenções do projeto e pesado p/ PWA |
| GSAP | ~25KB+ | ❌ Overkill p/ manual |
| Lottie (lottie-react) | pesado + assets | ❌ Fase 1 não; só se houver assets de designer depois |
| CSS scroll-driven animations | 0 JS | ⚠️ Suporte parcial de browsers — usar só como progressive enhancement |

### 1.2 Tour guiado / onboarding

| Opção | Tamanho | Veredito |
|---|---|---|
| **driver.js** | ~5KB gzip, framework-agnostic, visual polido | ✅ Recomendado — botão "Me mostre na prática" destaca elementos REAIS da UI (ex: abre /campanhas e ilumina o botão Nova Campanha, passo a passo) |
| react-joyride | ~34KB | ❌ 7x maior, React-específico, mais complexo |
| Shepherd.js | médio | ⚠️ Boa alternativa, mas driver.js é mais leve e suficiente |
| Intro.js | licença comercial AGPL | ❌ Licença |

### 1.3 Conteúdo interativo — sem biblioteca (componentes próprios)

O material mais didático não vem de lib, e o projeto já tem tudo (shadcn/Radix + Tailwind):
- **Tabs** (abas do container), **Accordion** (tópicos progressivos), **Collapsible**, **Card**, **Badge**, **Progress**, **Tooltip**, **Dialog**
- Reuso de componentes REAIS de campanha (badges de status, `CampaignStatsGrid`) dentro do manual = o cliente vê exatamente o que verá na tela

**Decisão de pacotes: instalar apenas `driver.js` + `@formkit/auto-animate` (~7KB somados).** Bundle PWA fica praticamente intacto.

---

## 2. Técnicas de design/didática (hierarquia da página)

1. **Hero da aba**: título + resumo em 2 linhas + "o que você vai aprender" (chips clicáveis que rolam até o tópico).
2. **Sub-navegação sticky** de tópicos (âncoras com scroll suave + destaque do tópico ativo via IntersectionObserver) — hierarquia sempre visível.
3. **Divulgação progressiva** (progressive disclosure): visão geral sempre visível; detalhes em Accordions — quem nunca mexeu não é soterrado de texto.
4. **Passo a passo numerado** (stepper vertical com linha conectora e ícones lucide) para fluxos: criar campanha (6 etapas espelhando o wizard real), reenviar, acompanhar resultados.
5. **Simulações interativas** (componentes próprios):
   - **Simulador do ciclo de vida**: linha do tempo animada Agendada → Disparando → Disparada → Expirada com play/pause (tailwindcss-animate + auto-animate);
   - **Simulador de status do contato**: o usuário clica em cenários ("cliente respondeu", "cliente agendou", "conversa encerrada") e vê o badge/estatística mudar em tempo real — ensina o congelamento sem jargão;
   - **Mini-wizard demonstrativo**: réplica navegável (read-only) das 6 etapas com dicas em cada campo.
6. **Legenda viva de badges**: os MESMOS badges da tabela real (Enviada, Entregue, Rejeitada, Atendimento Em Aberto, Agendado...) com explicação de 1 linha cada.
7. **Callouts padronizados**: 💡 Dica (azul), ⚠️ Atenção (âmbar), ✅ Boa prática (verde), ❌ Evite (vermelho) — ex.: limites da Meta, aviso de 7 dias, janela de 1h.
8. **Exemplos práticos narrados**: "Clínica quer reativar pacientes de botox" — do upload da planilha ao resultado, com prints estilizados/mocks.
9. **FAQ** no rodapé da aba (Accordion) com as dúvidas reais já vistas (por que rejeitou? por que não enviou p/ fulano? o que é 'Movido Para Outra Campanha'?).
10. **Tour real (driver.js)**: botões "Ver na prática" que navegam até /campanhas e destacam os elementos de verdade.
11. **Linguagem**: pt-BR simples, sem termos técnicos sem explicação, frases curtas, analogias (campanha = "mala direta inteligente do WhatsApp").
12. **Responsivo**: sub-nav vira dropdown no mobile; simuladores empilham; padrões de responsividade já usados no projeto.

---

## 3. Arquitetura proposta

- Rota `/suporte` + item "Suporte" (ícone LifeBuoy) na sidebar entre Conexões e Configurações — visível a todos os papéis.
- `src/pages/Support.tsx`: container com Tabs (só "Campanhas" agora; estrutura pronta p/ CRM, Agenda, IA...).
- `src/components/support/`:
  - `SupportShell.tsx` (hero + tabs + sub-nav sticky)
  - blocos reutilizáveis: `TopicSection`, `StepByStep`, `Callout`, `BadgeLegend`, `FaqAccordion`
  - `campaigns/CampaignsGuide.tsx` (conteúdo) + `campaigns/LifecycleSimulator.tsx`, `campaigns/ContactStatusSimulator.tsx`, `campaigns/MiniWizardDemo.tsx`
- Tours driver.js em `src/lib/supportTours.ts`.

### Tópicos da aba Campanhas (ordem)
1. O que são campanhas (analogia + quando usar)
2. Antes de começar (instância conectada, template aprovado Meta vs texto livre UAZAPI, limites/qualidade Meta)
3. Criando sua campanha — passo a passo das 6 etapas
4. Públicos (CSV, CRM, Tag, Agendamentos, Vendas) + variáveis na mensagem
5. O disparo (espaçamento entre envios, custo, o que acontece com quem está em atendimento)
6. Acompanhando resultados (8 cards + tabela de contatos + cada status/badge) — com simulador
7. Congelamento explicado simples ("a foto do resultado"): agendou/finalizou/movido/encerrada
8. Reenvio e regras (1 campanha ativa por contato, aviso de 7 dias)
9. IA + campanhas (prompt automático, fila IA/Humano)
10. FAQ

---

## 4. Fases de execução

- **F1**: instalar driver.js + auto-animate; shell da página + rota + sidebar; blocos base (TopicSection/Callout/StepByStep/BadgeLegend/FAQ)
- **F2**: conteúdo completo da aba Campanhas (tópicos 1-10)
- **F3**: simuladores (lifecycle, status do contato, mini-wizard)
- **F4**: tours driver.js na UI real + polimento responsivo/dark mode
- **F5**: deploy ritual

Fontes da pesquisa:
- https://usertourkit.com/blog/react-tour-library-benchmark-2026
- https://userorbit.com/blog/best-open-source-product-tour-libraries
- https://blog.logrocket.com/best-react-animation-libraries/
- https://spell.sh/blog/best-react-animation-libraries
- https://www.syncfusion.com/blogs/post/top-react-animation-libraries
