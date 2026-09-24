# Login caiu para todo mundo — um header custom sem CORS

**Data:** 24/09/2026
**Gatilho:** *"Não consigo logar nem no admin, nem em contas normais, nem acessar contas de cliente via admin."*
**Commits:** origem em `ae7773d` (23/09), correção nesta entrega.

---

## 1. O que aconteceu

Em 23/09 o client do Supabase passou a declarar a origem de toda chamada do app
num header custom:

```ts
// src/integrations/supabase/client.ts
global: { headers: { "x-origin": "front" } }
```

A intenção estava certa — sem isso o monitoramento *deduz* a origem e marca
`origem_inferida = true`. O efeito colateral não estava previsto.

**Header custom obriga preflight.** Antes de mandar a requisição de verdade, o
navegador manda um `OPTIONS` e só prossegue se o `Access-Control-Allow-Headers`
da resposta listar o header. Nenhuma das 132 edge functions listava `x-origin`:

```
access-control-allow-headers: authorization, x-client-info, apikey, content-type
```

O navegador então recusava a chamada **antes de ela sair**:

```
Access to fetch at '.../functions/v1/verify-turnstile' from origin 'https://app.clinbia.ai'
has been blocked by CORS policy: Request header field x-origin is not allowed
by Access-Control-Allow-Headers in preflight response.
```

`verify-turnstile` é a **primeira** coisa que o login faz, nos três caminhos
(`Auth.tsx` linha 113 e 158, `AdminAuth.tsx` linha 123). Sem ela, nada passa.
Daí os três sintomas de uma causa só: conta de cliente, super admin e
impersonação. O backend estava 100% são o tempo todo.

A quebra chegou junto com o deploy manual do front que carregava `ae7773d`.
`auth.sessions` mostra o corte: última sessão criada às 14h, nenhuma depois.

---

## 2. Por que eu não vi de primeira

Minha primeira medição foi um preflight com `curl` — e passou:

```
access-control-allow-headers: apikey,authorization,content-type,x-client-info,x-origin
```

Eu bati em `/auth/v1/`, que é o **gateway** do Supabase e ecoa de volta o que
você pediu. As edge functions respondem o CORS **do próprio código**, e é lá que
faltava. Testei o endpoint errado e descartei a hipótese certa.

**Regra que fica:** `curl` não faz preflight e não prova CORS. Para provar,
mande um `OPTIONS` com `Access-Control-Request-Headers` **no endpoint exato** que
o navegador chama — `/functions/v1/<slug>`, nunca `/auth/v1/` nem `/rest/v1/`.

---

## 3. Correção

`x-origin` acrescentado ao `Access-Control-Allow-Headers` de **133 arquivos**
(132 functions + `_shared/utils.ts`). `verify-turnstile` subiu primeiro, para
destravar o login, e as outras 129 em lote logo depois — qualquer function que o
front chame estava quebrada do mesmo jeito, só não tinha aparecido porque
ninguém passava do login.

Conferência ao vivo, preflight real contra as 130 functions publicadas:
**0 sem `x-origin`**.

Guarda de regressão: `supabase/tests/security/item_cors_x_origin/check.py` —
falha se uma function nova declarar CORS sem `x-origin`.

---

## 4. O que isso expõe

Cada function declara o próprio bloco de CORS copiado à mão. `_shared/utils.ts`
exporta um `corsHeaders`, mas 131 das 132 não o usam. Por isso a correção teve de
tocar 133 arquivos em vez de um. Fica anotado como dívida: enquanto for cópia,
todo header novo é uma varredura de repositório inteiro.
