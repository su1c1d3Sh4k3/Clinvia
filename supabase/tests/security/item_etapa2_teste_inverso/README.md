# Teste inverso da Etapa 2 — quebrar de proposito e ver o incidente nascer

A Etapa 2 afirma tres coisas. Este teste prova as tres com falha real em
producao, sem risco de chegar em telefone nenhum.

O provocador e a edge function `zz-teste-monitoramento`, que fica no repositorio
de proposito: teste que so existiu uma vez nao protege contra regressao. Ela
declara o componente `zz-teste:edge-etapa2`, que casa com o prefixo `zz-teste:`
do catalogo — `baixa` + `somente_painel = true`. O despacho so reivindica
`critica`/`alta`, entao nada daqui sai do painel.

## Como rodar

```sh
K=$(grep -oE "^SUPABASE_SECRET_KEY=.*" .env | cut -d= -f2-)
U=https://swfshqvvbohnahdyndch.supabase.co/functions/v1/zz-teste-monitoramento
for c in excecao resposta500 provedor; do
  curl -s -X POST "$U?caso=$c" -H "Authorization: Bearer $K" -H "x-service-key: $K"; echo
done
npx supabase db query --linked --file supabase/tests/security/item_etapa2_teste_inverso/verify.sql
```

## O que cada caso prova

| caso | o que quebra | o que tem que nascer |
|---|---|---|
| `excecao` | excecao escapa do handler | incidente `zz-teste:edge-etapa2`, e resposta 500 COM mensagem — sem o envelope isto seria um 502 do gateway, que nao carrega mensagem nenhuma |
| `resposta500` | `return 500` escrito a mao, sem excecao | incidente igual. E o caso que mais existe em producao e o que a instrumentacao por catch nunca pegaria |
| `provedor` | Google recusa a credencial (401) | incidente `google:credencial_recusada` **com a function respondendo 200**. E o buraco que o `fetchProvider` fecha: terceiro quebrado atras de um fallback que funciona |
| `origem-ambiente` | report disparado de dentro de um auxiliar que nao recebeu `req`, depois de atravessar um `await` | origem `ia_n8n` com `origem_inferida = false` — prova que o `AsyncLocalStorage` do `request-context.ts` atravessa a cadeia de continuacoes. E o que cobre os 77 `dbErrorResponse` de funcoes auxiliares sem tocar em nenhum deles. Mande `-H "x-origin: ia_n8n"` |

## Resultado de 23/09/2026

Os tres nasceram. O terceiro e o que importa: a function devolveu
`200 {"provedor_respondeu":401}` e o incidente existe mesmo assim.

| componente | http | severidade | somente_painel | saiu do painel? |
|---|---|---|---|---|
| `google:credencial_recusada` | 401 | media | nao | nao — despacho so pega critica/alta |
| `zz-teste:edge-etapa2` (500 na mao) | 500 | baixa | sim | nao |
| `zz-teste:edge-etapa2` (excecao) | 500 | baixa | sim | nao |
