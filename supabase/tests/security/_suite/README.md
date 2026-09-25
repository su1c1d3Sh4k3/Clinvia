# Suite de testes de acesso

```sh
python supabase/tests/security/_suite/rodar.py            # tudo
python supabase/tests/security/_suite/rodar.py cron alert # so pastas que casam
```

Sai 0 se nenhum verify reprovou, 1 se algum reprovou ou quebrou.

## Por que ela existe

Cada `verify.sql` só rodava no dia em que nascia. Isso já custou caro duas vezes: uma
migration nova reemitiu uma função inteira e apagou, em silêncio, guarda posta por
migration anterior. O teste da correção antiga existia e não rodou.

Na primeira execução da suite, 24/09/2026, **três verify não executavam havia semanas**
(`42703: column "catalogado" does not exist`, removida por `20260924180000`) — e o mesmo
defeito estava vivo no `alert-notify`.

## Antes de aplicar migration

Rode pelo menos as pastas relacionadas ao que você está mexendo. A suite inteira leva
minutos; deixe rodando em segundo plano enquanto escreve a migration.

## Como ela julga

Dois formatos de veredito convivem:

- coluna booleana `ok`;
- célula de texto **começando** em `ok` / `CONFERIR` / `FALHOU`.

O veredito é a **célula**, nunca uma palavra no meio de texto livre: vários verify
escrevem `ANON | lê a coluna | FALHOU 42501` para dizer que o bloqueio *funcionou*.
Procurar a palavra em qualquer lugar transforma acerto em alarme.

Quem não tem nenhum dos dois sai como `sem veredito` — roda, mas quem julga é um humano
lendo. **Verify novo tem que ter a coluna.**

## O que fica de fora, e por quê

| Pasta | Motivo |
|---|---|
| `item_entrada_invalida`, `item_silencio_sql` | escrevem em tabela real |
| `item_etapa2_teste_inverso` | mede janela de minutos após disparo manual; a frio reprova sempre |

Os dois primeiros rodam à mão quando o item deles muda. O terceiro entra se você passar
o nome como filtro.

## Escrever verify novo

- **Um statement só.** O `supabase db query` devolve as linhas do ÚLTIMO result set; teste
  em vários selects perde os primeiros em silêncio.
- **Leitura pura.** `python _suite/classificar.py` responde se o arquivo escreve.
- **Fixe a intenção, não o texto.** Pinos que já acusaram código correto: o literal
  `i.ai_severity` depois que a função passou a usar `incident_severidade_efetiva`, o minuto
  exato de um cron depois que os crons foram espalhados de propósito, e `count(*) = 1` num
  conjunto que cresce por decisão (vale lista nominal).

## Não é paralelo por medição, não por cautela

Cada `supabase db query` cria o papel temporário `cli_login_postgres` com senha nova. Duas
chamadas ao mesmo tempo e a segunda troca a senha debaixo da primeira, que morre com
`28P01`. Sair disso exige `SUPABASE_DB_PASSWORD` e conexão direta — aí a suite inteira cabe
numa sessão só.

Os verify de 1 statement puro são unidos num `union all` e vão numa chamada só; se o bloco
quebra, o executor cai para um a um em vez de sumir com todos.
