# Renovar token do Instagram: o erro e o silêncio (24/09/2026)

**Relato dele:** *"Tentei renovar o token do instagram, além de ter dado erro na edge function, não
recebi o erro como notificação. Dois problemas na mesma ação."*

São dois, sim. Mas a medição separa um do outro: **um é defeito nosso, o outro é o sistema
funcionando como foi acordado.** Vale a pena ser exato aqui, porque a conclusão fácil
("faltou alerta") levaria a ligar barulho no lugar errado.

---

## 1. O que aconteceu, minuto a minuto

Uma única chamada, achada em `function_edge_logs`:

```
2026-09-24T15:35:04Z  POST | 401 | .../functions/v1/instagram-refresh-token
2026-09-24T15:35:03Z  OPTIONS | 200 | .../functions/v1/instagram-refresh-token
```

401 é **o único 401 que existe** em `instagram-refresh-token/index.ts` (linhas 75-88): o ramo que
recusa renovar token já vencido. A conta é a `@suicideshake` — a única das 5 instâncias com
`token_expires_at` no passado:

| conta | status | token vence/venceu |
|---|---|---|
| contourlinemed | connected | 23/11/2026 |
| clinbia.ai | connected | 22/11/2026 |
| pelemaceio | connected | 15/11/2026 |
| cienciaqueconecta | connected | 16/11/2026 |
| **suicideshake** | **expired** | **05/07/2026 — há 81 dias** |

**A function acertou.** O Instagram só renova token que ainda vale; depois de vencido a única saída
é reconectar por OAuth. Isso já estava escrito no cabeçalho do arquivo e é a mesma regra que motivou
a migration `20260923260000`.

## 2. Problema real nº 1 — a tela não contou o motivo

O que apareceu para ele não foi *"esse token venceu"*. Foi:

> **Erro ao atualizar token**
> Edge Function returned a non-2xx status code

Essa frase é literal do `@supabase/functions-js` (`types.js`, classe `FunctionsHttpError`): quando a
function responde não-2xx, o supabase-js **não entrega o corpo**. Ele troca a mensagem por essa
frase fixa e guarda a Response verdadeira em `error.context`. Quem faz
`toast({ description: error.message })` mostra a frase fixa.

Ou seja: a function explicou, em português técnico, exatamente o que houve
(`code: "TOKEN_EXPIRED"`), e a explicação morreu no meio do caminho.

**Não é um caso isolado.** Varredura em `src/`: **75 chamadas a `functions.invoke`, 54 delas sem
desembrulhar o corpo** (30 arquivos). O padrão certo já existia em 5 lugares — `AdminAuth.tsx`,
`Team.tsx` (2×), `AdminTeam.tsx`, `AdminClients.tsx`, `useSupportChat.ts` — cada um com a sua cópia
escrita à mão.

### Conserto

- `src/lib/functionError.ts` (novo) — `mensagemDoErroDaFuncao(error, reserva, traduz?)`. Lê
  `error.context`, respeita o contrato de `_shared/api-errors.ts` (`message` → `error`), aceita um
  tradutor por `code` e **nunca devolve a frase fixa do supabase-js**: se não há corpo, usa a
  reserva de quem chamou.
- `Connections.tsx` passa a usá-lo, traduzindo `TOKEN_EXPIRED` para:
  *"Este token já venceu e o Instagram não renova token vencido. A única saída é reconectar a conta
  pelo botão Conectar Instagram."*

Os outros 53 pontos estão **medidos e não corrigidos** — item de fila, não desta passagem.

## 3. Problema real nº 2 — o botão prometia o que a API não faz

O botão verde de renovar aparecia igual para as 5 contas, inclusive para a que tinha o selo vermelho
"Token Expirado" ao lado. Clicar nele só podia dar 401.

Agora, quando `token_expires_at` está no passado: o botão fica desabilitado e cinza, o `title`
explica o porquê, e a linha de data deixa de dizer *"Token expira: 05/07/2026"* (que soa futuro) e
passa a dizer, em vermelho, **"Token venceu em 05/07/2026 — só reconectando"**.

## 4. O silêncio do monitoramento está CERTO — e eu prefiro dizer isso do que ligar barulho

Três razões medidas, não opinião:

**(a) 401 não é defeito nosso.** `serveMonitored` reporta incidente para resposta **≥ 500**
(linha 121). 4xx fica de fora de propósito, e é a mesma premissa da correção que já está na fila:
erro causado pela entrada do chamador retorna 4xx e **não reporta**. Se 401 virasse incidente, todo
clique num botão indevido viraria alerta.

**(b) O incidente certo já existe e já está aberto.** `instagram:token-vencido`, 2 eventos, último
em 24/09 01:15, texto: *"Token do Instagram da conta @suicideshake venceu e não pode mais ser
renovado. Só reconectando por OAuth."* Quem o cria é o cron `instagram-refresh-tokens`
(`instagram_refresh_tokens_run()`, 01:15 BRT), consertado em `20260923260000`.

**(c) A severidade `media` é uma regra deliberada, escrita naquela migration:**

> status `connected` + token vencido → a tela diz que está no ar e não está → **alta**
> status `expired` + token vencido → a tela já conta a verdade → **media** (não dispara WhatsApp)

Conferido nesta passagem: `instagram_instances.status` é `'expired'` **e** o `getStatusBadge` de
`Connections.tsx` (linha 723) pinta um `Badge` vermelho "Token Expirado". A premissa da regra é
verdadeira — a tela não estava mentindo.

E há um motivo mais simples: **o resultado de um botão que ele acabou de apertar tem que aparecer no
botão, não no WhatsApp dele meia hora depois.** Mandar alerta aqui é exatamente o que a regra
*"suprima na origem, nunca na porta"* proíbe: barulho que não pede ação nova.

O que faltava não era alerta. Era a tela falar.

## 5. Prova

`src/test/monitoring/functionError.test.ts` — 8 casos, **8/8**. Cobre o caso real
(`TOKEN_EXPIRED` → pt-BR), `message` × `error`, `code` numérico (190 da Meta), corpo não-JSON,
erro de rede, e o único que não pode falhar nunca: **a frase fixa do supabase-js jamais chega ao
usuário**.
