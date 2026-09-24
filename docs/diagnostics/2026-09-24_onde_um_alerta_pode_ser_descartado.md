# Onde um alerta pode ser descartado (auditoria, 24/09/2026)

**Pergunta dele:** o "limite de envio configurável, ex.: máximo 10 mensagens por hora" do plano
original foi implementado? E existe qualquer outro ponto onde uma mensagem possa ser **descartada**
em vez de agrupada ou adiada?

**Regra que governa a resposta, nas palavras dele:**

> Nunca existe teto de envio. Crítica e alta saem sempre, quantas forem. Se der 40 alertas críticos
> num dia, quero os 40. O "máximo 5 por dia" é meta de calibragem, não regra de envio.
> **Suprima na origem, nunca na porta.**

---

## 1. Sim, o teto foi implementado — e pegava crítica

`llm_platform_settings.alert_max_per_hour`, default **10**, editável no Super Admin.
`alert-notify/index.ts`, `estourouORateLimit()`: conta as linhas `status='sent'` daquele
destinatário na última hora e, no estouro, grava `skipped_ratelimit` e pula.

O ponto exato, dentro de `espalhar()`:

```ts
if (!IGNORA_JANELA.includes(alerta.severidade) && !dentroDaJanela(r, agora)) { … }  // isento p/ critica+alta
if (await estourouORateLimit(supabase, r.id, teto)) { … }                          // NÃO era isento
```

A janela de silêncio já sabia poupar crítica e alta (`IGNORA_JANELA`). O teto, na linha de baixo,
não sabia. **Duas portas lado a lado, uma com a regra e a outra sem.**

Agravante: o contador soma **tudo** que saiu para aquele destinatário — `resumo`, `rajada`,
`recorrencia`. Volume de baixa prioridade consumia a cota e empurrava crítica para fora.

## 2. O estrago real era ATRASO, não perda

`incident_notification_done` **não tem teto de tentativas**. Um alerta segurado volta para a fila
com recuo 2 → 5 → 15 → 30 min, e o cron `alert-dispatch` roda de minuto em minuto. Ou seja: a
crítica saía, só que até meia hora depois, e nesse meio-tempo aparecia no painel como falha com a
mensagem `"adiado: janela de silêncio do destinatário ou teto por hora atingido"`.

Meia hora de atraso numa crítica já é inaceitável pela regra dele. Mas é importante ser preciso:
**não havia perda permanente.**

**E nunca chegou a pegar uma crítica.** Histórico completo de `skipped_ratelimit` na base:
**2 linhas, ambas severidade `media`, a mais recente em 23/09 13:04.** A armadilha existia e estava
armada; nunca disparou no alvo errado.

## 3. Correção

`IGNORA_TETO: Severity[] = ["critica", "alta"]`, espelhando `IGNORA_JANELA`. O teto passa a valer
só para **média e baixa**, que é onde já existe agregação de verdade:

- **resumo** de 2 em 2 horas — uma mensagem com a lista dos incidentes abertos;
- **rajada** — 3+ incidentes não-críticos na mesma passada viram UMA mensagem com a lista, e se a
  rajada é recusada os incidentes voltam para a fila e saem individuais na próxima.

Como `incident_claim_for_notification` só reclama crítica e alta, o efeito prático é que **o
despacho automático não tem mais teto nenhum**.

Migration `20260924140000` só troca o comentário da coluna, que afirmava
*"Excedente vira skipped_ratelimit + uma mensagem de resumo"* — a segunda metade nunca existiu.
Comentário de catálogo é o que a próxima pessoa lê antes do código.

Texto do Super Admin também estava mentindo (*"O excedente vira uma mensagem de resumo, não some"*)
e foi corrigido para dizer o alcance real.

## 4. Os outros pontos onde um alerta para — todos legítimos

Varri o caminho inteiro, da geração do evento até o Graph. Existem cinco lugares além do teto:

| Ponto | O que faz | Veredito |
|---|---|---|
| `somente_painel` no catálogo de componentes | o incidente existe e aparece no painel, só não vira mensagem | **origem.** É o freio certo, e o único que deve crescer na calibragem |
| janela de silêncio do destinatário | isenta crítica e alta desde sempre — conferido: `skipped_window` nunca pegou nenhuma das duas, zero linhas | correto |
| `min_severity` do destinatário | ele pediu para não receber abaixo de X. Crítica é o topo da escala: nunca é filtrada aqui | correto |
| janela de recorrência | erro repetido conta em vez de mandar N mensagens; depois sai UMA de recorrência com o total | **agrupa, não descarta** |
| chaves `alert_notify_enabled` / `alert_summary_enabled` | desligamento explícito. Não encerra incidente: a fila espera | correto |
| rajada | agrupa média/baixa; **crítica nunca entra** | correto |

`_shared/report-incident.ts` não tem supressão nenhuma: todo evento é registrado.

**Conclusão: depois desta correção, não existe mais nenhum caminho em que uma mensagem crítica ou
alta seja descartada ou segurada por cota.** O que pode acontecer é ela ser adiada por falha do
canal — e para isso existem a 2ª via por e-mail e o `alert-channel-watch`.

## 5. Prova

`supabase/tests/security/item_teto_nao_segura_critica/verify.sql` — 6 linhas, leitura pura:
comentário do catálogo; teto ainda editável (foi restringido, não removido); claim só de
crítica/alta; ausência de teto de tentativas; histórico de `skipped_ratelimit` por severidade;
contraprova da janela de silêncio.
