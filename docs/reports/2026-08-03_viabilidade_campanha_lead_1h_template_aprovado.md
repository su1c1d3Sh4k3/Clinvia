# Relatório de Viabilidade — Campanhas: lead mínimo de 1h + apenas templates aprovados

**Data:** 2026-08-03
**Status:** Aprovado e implementado (decisões: lead 1h também para UAZAPI; modo "create" removido por completo incl. reescrita IA; campanhas legadas seguem fluxo atual até o disparo; lead vale para criação e edição)
**Veredito:** VIÁVEL — mudança de baixa complexidade, sem migração de banco

---

## 1. Pedido

1. Reduzir o tempo mínimo de antecedência (lead) para criação/agendamento de campanha para **1 hora**.
2. Aceitar apenas campanhas que usem **templates já aprovados** pela Meta (eliminar a criação de template novo dentro do fluxo de campanha).

## 2. Como funciona hoje (análise da construção)

### 2.1 Frontend — `src/components/campaigns/CampaignWizard.tsx`
- Constantes: `META_MIN_LEAD_H = 24` e `UAZAPI_MIN_LEAD_H = 2` (linhas 37-38).
- Validação no step 0 (`stepValid`, linha 313): bloqueia agendamento abaixo do lead mínimo, com tolerância de 60s.
- `min` do input datetime pré-calculado com o lead (linha 233).
- Step "Mensagem" (step 3): para instância Meta há escolha `templateChoice = "create" | "existing"` (default **"create"**). Para UAZAPI não há template — texto livre (`template_mode = "none"`).
- Textos de ajuda: "Mínimo 24h (aprovação do template Meta)" / "Mínimo 2h (API não oficial, sem template)".

### 2.2 Backend — `supabase/functions/campaign-manage/index.ts`
- Constantes: `META_MIN_LEAD_MS = 24h`, `UAZAPI_MIN_LEAD_MS = 2h` (linhas 26-27).
- `validateDates()` (linha 362): aplica o lead em `create` e `update` (server-side, fonte da verdade).
- Action `create`: se `template_mode = "create"`, chama `createMetaTemplate()` → `meta-template-manage` (Graph API) e o template nasce **PENDING**; se `"existing"`, `resolveExistingTemplate()` valida que o template pertence à instância e tem `status = 'APPROVED'` (falha antes de criar a campanha).
- Action `update`: recria template quando a mensagem muda (`needsNewTemplate`), deleta o template antigo criado pela campanha, revalida datas.
- Action `recreate_template`: reescrita da mensagem via IA (gpt-4o-mini) para templates **REJECTED** — só faz sentido no modo "create".
- Action `delete`: apaga o template na Meta apenas se `template_mode = "create"`.

### 2.3 Worker — `supabase/functions/campaign-dispatch/index.ts` (cron 1 min)
- Campanhas `scheduled`/`awaiting_template` vencidas:
  - `template_mode = "none"` (UAZAPI) → vai direto para `dispatching`.
  - Meta → sincroniza status do template com a Graph API: `APPROVED` → `dispatching`; `REJECTED` → `error`; `PENDING` → `awaiting_template` (fica retentando a cada ciclo).
- **O gate de APPROVED no disparo já existe** — nenhuma campanha Meta dispara sem template aprovado, independente do lead.

### 2.4 Por que o lead de 24h existe
O único motivo do lead de 24h Meta é dar tempo para a **aprovação do template criado na hora** (Meta pode levar minutos a horas, às vezes mais). Removendo o modo "create", esse motivo desaparece: com template já aprovado, o disparo pode ocorrer em qualquer momento. O lead de 1h passa a servir apenas como margem operacional (revisão, edição de audiência, cadência do cron).

## 3. Conclusão de viabilidade

**Totalmente viável.** Os dois pedidos são complementares: exigir template aprovado é justamente o que torna seguro reduzir o lead para 1h. O gate de disparo (`APPROVED` → `dispatching`) já protege contra qualquer regressão de status do template entre o agendamento e o disparo (sync com a Graph a cada ciclo do worker).

### Escopo da mudança (sem migração de banco)

| Arquivo | Mudança |
|---|---|
| `CampaignWizard.tsx` | `MIN_LEAD_H = 1`; remover opção "Criar template" (step Mensagem vira só seleção de template aprovado + mapeamento de variáveis); default `templateChoice = "existing"`; atualizar textos de ajuda; empty-state com link para a aba Templates quando não houver template aprovado |
| `campaign-manage/index.ts` | `MIN_LEAD_MS = 1h`; `create`/`update` rejeitam `template_mode = "create"` (erro claro); manter `resolveExistingTemplate` como único caminho Meta; `delete` mantém limpeza de template para campanhas legadas "create" |
| `campaign-dispatch/index.ts` | Nenhuma mudança obrigatória (gate APPROVED já existe) |

Ações que ficam obsoletas para novas campanhas: `recreate_template` (reescrita IA de template rejeitado) e todo o caminho `createMetaTemplate` no contexto de campanha.

## 4. Riscos e mitigação

1. **UX — usuário sem template aprovado:** hoje ele criava o template junto com a campanha. Passará a precisar criar/aprovar o template antes (aba Templates em /whatsapp-connection). Mitigação: empty-state no wizard com atalho para a aba Templates.
2. **Status do template desatualizado no banco:** `resolveExistingTemplate` lê `message_templates.status` local. A lista de campanhas já auto-sincroniza da Graph (f768252) e o worker re-sincroniza antes de disparar — risco residual baixo.
3. **Campanhas legadas** já agendadas com `template_mode = "create"`: continuam funcionando no worker (gate APPROVED). Apenas a edição delas exigirá trocar para template existente.
4. **Meta pausar/rejeitar template aprovado** entre agendamento e disparo: worker detecta no sync e marca `error`/`awaiting_template` — comportamento atual preservado.
5. **Categoria do template:** com "existing", a categoria (MARKETING/UTILITY) vem do template escolhido, não mais do tipo da campanha (promoção/notificação). O tipo da campanha continua controlando serviços/desconto/prompt IA — sem conflito técnico, mas o usuário pode escolher template UTILITY para promoção (política Meta é responsabilidade dele).

## 5. Dúvidas para aprovação

1. **UAZAPI (API não oficial):** não existe conceito de template — campanha é texto livre (`template_mode = "none"`). A regra "apenas templates aprovados" se aplica só à Meta, correto? E o lead UAZAPI:
   - (a) reduz também para **1h** (unifica), ou
   - (b) mantém **2h**, ou
   - (c) bloqueia campanhas via UAZAPI?
2. **Modo "create":** remover completamente (recomendado) ou manter disponível exigindo 24h de lead quando escolhido?
3. **Ação `recreate_template` (reescrita IA):** remover do backend ou manter (fica sem uso no fluxo de campanhas)?
4. **Campanhas legadas** agendadas com template em aprovação: deixar seguirem o fluxo atual até o disparo (recomendado) ou forçar edição?
5. **Lead de 1h:** vale para criação E reagendamento (update), certo? Alguma exceção para admin?

## 6. Estimativa de esforço

- 2 arquivos principais (`CampaignWizard.tsx`, `campaign-manage/index.ts`) + textos.
- Sem migração SQL. Deploy: `campaign-manage` (e `campaign-dispatch` só se houver ajuste opcional).
- Complexidade: **baixa**. Maior parte do trabalho é remoção de código (fluxo "create") e ajuste de UX do step Mensagem.
