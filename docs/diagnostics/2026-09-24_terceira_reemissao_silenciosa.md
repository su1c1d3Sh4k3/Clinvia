# A terceira reemissão silenciosa, e o que a suíte achou ao rodar pela primeira vez

24/09/2026

## Quem seria afetado

**Você, no telefone.** Todo alerta disparado a partir de 24/09 ~18:00 sairia como se o
componente não estivesse no catálogo: sem o "o que esse serviço faz", sem ação padrão, com
o **piso de gravidade do catálogo descartado e forçado a `media`** — e abrindo, junto, um
incidente falso de `monitoramento:componente-nao-catalogado`.

Na prática o piso é o que mantém `alert-notify` e `openai:sem_credito` como críticos. Com
ele descartado, crítico viraria média, e média não acorda ninguém.

**Estrago real medido: zero.** Só 1 alerta foi despachado na janela, as 63 linhas do
catálogo estão intactas e os 7 incidentes de "componente não catalogado" são todos
anteriores ao defeito. Era mina armada, não explosão.

## Causa

`20260924180000_classe_instancia_desconectada.sql` deu `drop` + `create` em
`incident_component_info(text)` para acrescentar `severidade_teto`. A coluna `catalogado`
não voltou. O comentário da própria migration diz que a função *"só ganhou uma coluna"*.

O `alert-notify` decide por `!row?.catalogado`. Sem a coluna, o valor virou `undefined`, e
`undefined` é falso — todo componente passou a cair no ramo de "não catalogado". Nada
falhou: nem a migration, nem o deploy, nem o alerta. A função voltou a estar errada, que é
pior do que quebrar.

**É a terceira vez.** As duas anteriores foram a guarda `v_ok_recente` do `canal_alertas_scan`
(feita 23/09, apagada 24/09) e o caso que originou a regra. O padrão é sempre o mesmo:
migration escrita a partir de uma cópia velha da função.

## Por que ninguém viu

Porque os testes eram documentação. Você perguntou isso e a medição te deu razão de forma
mais literal do que eu esperava: **três verify.sql não executavam havia semanas** —
`item_alerta_formato`, `item_catalogo_componentes` e `item_catalogo_etapa2` morriam com
`42703: column "catalogado" does not exist`, o mesmo defeito. Eles existiam, estavam
corretos no dia em que nasceram, e estavam mortos.

## Conserto

**No `alert-notify`, não num quarto `create or replace`.** "Não catalogado" é a AUSÊNCIA da
linha: a função devolve zero linhas para componente fora do catálogo, e `catalogado` sempre
valeu o literal `true`. O ramo passou a ser `if (error || !row)`. Publicado e conferido no
bundle em produção: `row?.catalogado` 0 ocorrências, `error || !row` 2.

**Regra nova no CLAUDE.md** (§ *Reissuing a DB function…*): antes de reemitir função de
banco, ler a versão **viva** (`pg_get_functiondef`), nunca a migration antiga, e **listar
toda remoção no relatório**. Remoção não intencional volta e ganha verify que grepa a
guarda, para a próxima reemissão falhar na suíte e não no seu telefone.

**Executor da suíte**: `supabase/tests/security/_suite/rodar.py` (+ README). Roda todos os
`verify.sql`, sai 1 em qualquer `CONFERIR`.

## O que a primeira execução limpa mostrou

De início, **45 de 45 "QUEBROU"** — defeito do executor, não dos testes: a CLI escreve o
JSON no stdout e o progresso (`Initialising login role...`) no stderr, e eu estava
concatenando os dois, sujando o JSON.

Corrigido isso, **6 `CONFERIR`**. Nenhum deles era regressão de código:

| Verify | O que era |
|---|---|
| `item_0_2_secret_columns`, `item_token_usage_log_privilegios` | **falso alarme do executor**: escrevem `FALHOU 42501` para dizer que o bloqueio *funcionou*. Veredito agora é a célula, nunca palavra no meio de texto livre |
| `item_alerta_formato` D4, `item_roteamento_gravidade` B1/B3 | fixavam o literal `i.ai_severity` depois que a função passou a usar `incident_severidade_efetiva` |
| `item_roteamento_gravidade` C1 | fixava o minuto do cron depois que `20260924230000` espalhou os crons de propósito |
| `item_roteamento_gravidade` C5 | cobrava um ramo que sumiu por estar certo |
| E3 / E7 | `count(*) = 1` num conjunto que cresce por decisão — virou lista nominal, que diz *quem* |
| **`item_severidade_padrao` B5** | **cobrava o oposto da regra**: exigia que a IA pudesse DESCER a gravidade de componente crítico. O piso é piso — a função devolve o PIOR dos dois. Só passaria se o piso estivesse quebrado. Invertido |

**Base verde: 44/44 sem reprovação em 142s.**

## Dívida, dita em voz alta

- **18 verify não têm coluna de veredito.** Rodam, o executor os marca `sem veredito` e
  quem julga é um humano lendo. Dar `status ok|CONFERIR` a eles é dívida aberta.
- `item_rajada_conexoes` é instável por construção: mede conexões livres ao vivo. Virou
  `CONFERIR` numa passada (6 livres) e `ok` minutos depois (21). Item em aberto da tarefa 2:
  `cron.max_running_jobs = 32` contra a folga real.
- Dois verify escrevem em produção e ficam fora da suíte automática; um só vale após
  disparo manual. Os três estão declarados por nome no executor, não escondidos.
