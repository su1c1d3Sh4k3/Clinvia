# O ensaio que terminava em ROLLBACK derrubou a entrada de mensagens

**Investigado em 25/09/2026** · ocorrido em **22/09/2026** · cliente atingido: **PELE DERMATOLOGIA**

Fecha a investigação das rajadas (`2026-09-24_o_monitoramento_saturava_o_que_media.md`) com o
caso do dia 22 dentro dela — e corrige a hipótese que eu mesmo levantei.

## O cliente

**PELE DERMATOLOGIA** (`fayruss.costa@yahoo.com`), nas duas instâncias Meta
`meta-215168561689565` e `meta-1220713571131185`.

**7 mensagens de paciente entraram pelo webhook, foram aceitas com 200 para a Meta e não
existem no banco.** Nenhuma apareceu no inbox, nenhuma gerou alerta, nenhuma foi respondida.

| horário (SP) | onde morreu | efeito |
|---|---|---|
| 11:25:06 | criação da conversa | mensagem perdida |
| 11:25:08 | criação da conversa | mensagem perdida |
| 11:25:11 | criação da conversa | mensagem perdida |
| 11:25:31 | criação da conversa | mensagem perdida |
| 11:25:52 | criação do **contato** | mensagem perdida — e o contato nunca existiu |
| 11:26:10 | criação da conversa | mensagem perdida |
| 12:39:20 | criação da conversa | mensagem perdida |

As seis primeiras caem dentro de 64 segundos. A de 11:25:52 é a pior das sete: era um
**contato novo**, primeira mensagem dele; como o contato não chegou a ser criado, não sobrou
nem o número para saber quem procurou a clínica.

Outros quatro `57014` do mesmo dia caíram em **atualização de status** de mensagem já gravada —
esses custaram o recibo de entrega, não a mensagem. Todo o resto dos erros da entrada naquele
dia é `23505` (chave duplicada), que é benigno: o `SELECT` de recuperação acha a linha.

A linha de log da perda **não grava a instância**. Os dois números que aparecem no log da
janela são os dois da PELE, e é daí que sai a atribuição — não de um campo no erro. Esse buraco
é parte do defeito e foi fechado ontem (ver "O que já cobre isso hoje").

## A causa: eu

Às 11:22:13 (SP) rodei contra produção o arnês `ARNES 2`, que **apaga de verdade o maior tenant
ativo** — a própria PELE, 7.113 contatos — dentro de uma transação que termina em `ROLLBACK`.
Rodei de novo às 11:24:26. Depois, às 11:31:25, rodei a medição *"quanto custa a parte mais
pesada agora que as FKs têm índice"*, que é o mesmo `DELETE` outra vez.

O relógio é exato:

```
11:17–11:21  arnês de exclusão em contas pequenas       → 0-2 timeouts/min
11:22:13     ARNES 2 começa (PELE, 7.113 contatos)
11:22           5 timeouts
11:23          19
11:24          16   ← 11:24:26 ARNES 2 de novo
11:25          22   ← as 5 perdas de conversa + a perda de contato
11:26          17
11:28:04     migration dos índices de FK
11:31:25     medição da "parte mais pesada" (o mesmo DELETE)
11:31           4
11:32           9
11:33          10
11:34          36   ← pico do dia
11:35          16
11:36–11:38    19
```

**221 statements cancelados por timeout em 36 minutos**, contra 0-2 por minuto no resto do dia.

O mecanismo está nos bloqueios registrados pelo Postgres na mesma janela: **283 esperas**, e
todas do tipo `ShareLock on transaction` e `ExclusiveLock on tuple` sobre
`public.conversations`, `public.contacts` e `public.active_sessions`. Isso é disputa de **linha**:
o `DELETE` segurava as linhas por minutos, e cada webhook que precisava tocar as mesmas linhas
entrava na fila atrás dele até estourar o `statement_timeout`. Uma única transação, a
`14685040`, teve fila contínua de 11:24:33 a 11:26:29 — dois minutos. É dentro dela que estão
as seis perdas.

**O `ROLLBACK` devolveu os dados. Não devolveu as mensagens.** Esse é o ponto que eu não sabia e
que custou as sete: um ensaio que termina em rollback é seguro para o *conteúdo* do banco e não
tem nada de seguro para a *disponibilidade* dele. Enquanto roda, ele bloqueia igual ao real.

O segundo bloco, 12:15–12:40, é o arnês de `storage.objects` — oito execuções seguidas, também
terminando em `ROLLBACK`, também contra produção. As esperas ali são em `realtime.subscription`,
`auth.users` e `auth.refresh_tokens`. A sétima perda (12:39:20) cai dentro dele.

## A hipótese que eu levantei estava errada no mecanismo

Eu apontei as migrations `20260922191000_fk_indexes.sql` / `20260922192000_fk_indexes2.sql`
— `create index` comum, **sem `CONCURRENTLY` e sem `lock_timeout`**, sobre `conversations` e
`contacts` — como causa provável. A medição não sustenta:

- O `statement:` da migration está registrado às **11:28:04**, ou seja **dois minutos depois** do
  aglomerado de 11:25:06–11:26:10. Causa não vem depois do efeito.
- Um `CREATE INDEX` bloqueando escrita apareceria como espera por `RowExclusiveLock on relation`.
  **Esse tipo de espera não existe no bloco das 11:22–11:38.** Só há espera de linha.
- Na prática os índices saíram rápidos, como o comentário do arquivo previa.

Fica registrado assim mesmo, porque continua sendo um defeito que só não disparou por sorte:
`create index` sem `lock_timeout` em `conversations` e `contacts`, em horário comercial, é
exatamente o que as duas regras novas do CLAUDE.md proíbem. Ele não causou estas sete perdas;
poderia ter causado outras.

## E as rajadas de `connection failed`?

**Não são a mesma causa.** No dia 22 não há **nenhum** `too many clients` na janela (medido, 0
linhas em 4 horas) e nenhuma espera por conexão — a entrada morreu por bloqueio de linha, não
por esgotamento de pool.

Não posso afirmar que não houve rajada de `connection failed` no dia 22: a única fonte que
registra essa mensagem é `cron.job_run_details`, que o `cleanup-cron-history` poda para ~29
horas, e o armazém de logs não guarda o `return_message` do pg_cron. **A frase honesta é "não
consigo alcançar o dia 22 por esse caminho"**, não "não houve".

O que une os dois casos não é o mecanismo, é a família: **trabalho nosso de manutenção e
monitoramento disputando recurso com o tráfego vivo do cliente.** No dia 24 foi conexão; no dia
22 foi bloqueio de linha. Nos dois, o painel ficou verde.

## O que já cobre isso hoje

O detector de mensagem perdida na entrada (item 4, ontem) foi feito exatamente para esta classe:
hoje cada uma dessas sete abriria incidente **na primeira**, com o componente
`recebimento:perdida-sem-conversa (meta-215168561689565)` — inclusive resolvendo o campo Cliente
do título pela instância entre parênteses, que é justamente o dado que faltou aqui. E o payload
cru passou a ser gravado antes de qualquer processamento, então a mensagem seria recuperável.

Se o dia 22 acontecesse hoje, ele teria recebido um alerta às 11:25:06.

## Regra nova

As duas regras que ele ditou falavam em *migration*. O estrago do dia 22 não veio de migration
nenhuma — veio de arquivo em `supabase/.temp/`. O buraco foi fechado no CLAUDE.md: o preâmbulo
de `lock_timeout`/`statement_timeout` e a janela fora do horário comercial valem para **qualquer
SQL contra produção**, e ensaio que termina em `ROLLBACK` não é exceção.

## Aberto

- **Ensaiar exclusão em cima do tenant real.** O `ARNES 2` deletava a PELE de verdade para medir.
  O certo é clonar o volume num tenant descartável, ou medir com `EXPLAIN` em vez de executar.
  Não há hoje um tenant de carga para isso.
- **`admin_delete_tenant_data` sem teto de duração.** Um `alter function … set statement_timeout`
  limitaria por quanto tempo a exclusão pode segurar as linhas. Não coloquei porque não tenho o
  custo real medido da função depois dos índices de FK, e chutar o teto quebra exclusão legítima
  de conta grande. Precisa de uma medição antes.
- **`cron.max_running_jobs = 32` maior que a folga de conexão**, herdado da investigação de 24/09.
