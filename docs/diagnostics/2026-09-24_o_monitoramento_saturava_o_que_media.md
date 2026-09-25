# O monitoramento saturava o pool que depois reportava como problema

**24/09/2026** · componente `cron-infra:rajada` · migration `20260924230000`

## O que estava em risco

Nenhum cliente teve mensagem perdida ou agendamento quebrado. O que quebrava era
**rotina de fundo**: nos minutos de rajada, de 3 a 10 jobs agendados simplesmente não
partiam. Entre eles, nesta semana, caíram `alert-dispatch`, `campaign-dispatch-worker`,
`check-reminders` e `delivery-automation-worker` — ou seja, a rajada atrasava o despacho
de alerta, o disparo de campanha e o lembrete de consulta em até um ciclo.

Nada disso se perdeu de vez: todos esses jobs rodam de minuto em minuto ou de 10 em 10 e
o ciclo seguinte recuperava. **O custo real foi atraso, e a suspeita dele estava certa —
éramos nós.**

## A pergunta dele, respondida na ordem

**1. Quantos jobs ativos hoje contra uma semana atrás?** **42 hoje, ~32 há uma semana.**
Os **14 novos são todos de monitoramento**, criados nesta semana: `alert-dispatch`
(`* * * * *`), `incident-analyze-scan` (`*/2`), `cron-health-watch` (`*/5`),
`openai-provision-worker` (`*/5`), `incident-scan-db-sources` (`*/10`),
`entrada-invalida-scan` (`*/10`), `alert-channel-watch` (`*/15`), `provisionamento-scan`
(`*/15`), `alert-summary`, `openai-saldo-scan`, `openai-usage-sync-hourly`,
`openai-usage-sync-daily`, `openai-alerts-scan`, `calibrate-cache-ratio`.

A contagem de "uma semana atrás" não saiu do banco: `cleanup-cron-history` poda
`cron.job_run_details`. Veio do histórico de migrations, que é onde o `cron.schedule`
está escrito.

**2. Tamanho do pool.** `max_connections = 60`, `superuser_reserved_connections = 3` ⇒
57 utilizáveis. Num minuto calmo já havia **43 conexões abertas** — só o `authenticator`
do PostgREST segura 21. **Folga real: 14.**

**3. Conexões simultâneas nos minutos das rajadas.** A medição decisiva, 8 dias:

| jobs no minuto | minutos | com falha | % |
|---:|---:|---:|---:|
| 6 | 629 | 0 | 0,0 |
| 8 | 630 | 0 | 0,0 |
| 17 | 16 | 1 | 6,3 |
| 18 | 66 | 4 | 6,1 |
| 25 | 30 | 5 | 16,7 |
| 26 | 7 | 1 | 14,3 |

**Até 14 jobs no mesmo minuto: zero falha em 1.259 minutos.** O degrau cai exatamente
onde a folga de conexão acaba.

**4. Os jobs que falharam coincidem com os minutos de maior concorrência?** Sim, sem
exceção. As **11 rajadas** da série (não 2: 8 delas foram hoje) caem **todas** em
`:00`, `:10`, `:20`, `:30`, `:40` ou `:50`, e a mensagem é sempre a mesma:
`connection failed`.

## A causa

`*/5`, `*/10`, `*/15` e `*/30` no cron **todos partem do offset zero**. Não é bug de
ninguém: é o default. Com 32 jobs isso cabia; com 42 não cabe mais.

```
minuto 00 → 6 (todo minuto) + 2 (*/2) + 3 (*/5) + 7 (*/10) + 3 (*/15) + 2 (*/30) + …  = 25-26
minutos ímpares → 6
```

E `cron.max_running_jobs = 32` é **maior que a folga de 14**: o pg_cron alegremente
tenta iniciar mais jobs do que existe conexão, e o Postgres responde `connection failed`.
O monitoramento então registra essa falha como incidente — o vigia tropeçando no próprio
pé e relatando o tropeço.

## O conserto

**Só o offset.** Nenhuma frequência mudou, nenhum job foi removido, nenhum comando foi
reescrito (`cron.alter_job` troca apenas o schedule). O `*/5` continua de 5 em 5 minutos;
passa a rodar em 1, 6, 11, … em vez de 0, 5, 10, …

28 jobs reagendados em três camadas: os `*/2` em par/ímpar; os `*/5` nos offsets 0-2; os
sete `*/10` nos offsets 0, 1, 2, 3, 5, 6, 7 — deixando 4, 8 e 9 livres de propósito, que
é onde os `*/15` e `*/30` pousam; as seis rotinas horárias nos minutos terminados em 3,
os mais vazios do relógio; e as cinco diárias que largavam juntas às 08:00 e às 03:00,
espalhadas.

| | antes | depois |
|---|---:|---:|
| pico por hora | 27 | **9** |
| vale | 6 | 8 |
| pior minuto do dia | 30 (08:00) | **10** (03:00) |
| folga de conexão | 14 | 15 |

**O pool não foi tocado.** `max_connections` continua 60 — a instrução foi espalhar, e
espalhar resolveu sem comprar nada.

Ordem preservada onde ela importa: `openai-saldo-scan` (:13) antes de
`openai-usage-sync-hourly` (:23) antes de `openai-alerts-scan` (:33), como era com
15 < 20 < 30. E `cleanup-pg-net-responses`, que poda `net._http_response`, deixou de
cair no mesmo minuto de `cron-health-watch`, que lê essa tabela — disputavam o minuto.

## A severidade: ele estava certo, e ela já estava certa

O pedido foi *"rajada isolada que se recuperou no ciclo seguinte é média, não alta. Alta
só se repetir dentro de 2h"*. O bloco B1 do `cron_health_scan` **já faz exatamente isso**
(`v_rajadas_jan >= 2` ⇒ `alta`), e os 7 incidentes da série provam no dado:

| quando | minutos de rajada na janela | severidade | notificou? |
|---|---:|---|---|
| 23/09 18:10 | 1 | media | não |
| 23/09 18:25 | **2** | **alta** | **sim** |
| 24/09 09:10 | 1 | media | não |
| 24/09 11:30 | 1 | media | não |
| 24/09 13:30 | 1 | media | não |
| 24/09 13:50 | **2** | **alta** | **sim** |
| 24/09 16:30 | 1 | media | não |

As duas `alta` foram repetições legítimas dentro de 2h. **Não mexi**: consertar o que
está certo é como se apaga calibragem boa. O teste de acesso fixa a regra ao texto da
função para que a próxima re-emissão não a apague sem querer — foi assim que a guarda de
23/09 do canal mudo sumiu.

Os 7 incidentes foram resolvidos com a nota da causa raiz.

## O que fica

Teste de acesso: `supabase/tests/security/item_rajada_conexoes/verify.sql`, **8/9**. A
nona é `CONFERIR` porque a janela de 2h ainda contém a rajada das 16:30, anterior à
migration (aplicada 17:25); ela sai sozinha.

As checagens 1 e 2 **não leem a lista de jobs que a migration mexeu** — elas recalculam o
pico expandindo os schedules de `cron.job`. Job novo cadastrado no offset zero falha aqui,
que é o ponto: a próxima rajada tem que ser barrada no code review, não no telefone dele.

## Segundo caso da mesma família, sem ser a mesma causa

Em 22/09 a PELE DERMATOLOGIA perdeu **7 mensagens de paciente** na entrada, também com o painel
verde — mas por **bloqueio de linha**, não por conexão: um ensaio meu que apagava o maior tenant
ativo e terminava em `ROLLBACK` segurou `conversations` e `contacts` por minutos e a entrada
morreu na fila. Apurado em `2026-09-25_o_ensaio_que_derrubou_a_entrada.md`.

O que as duas têm em comum não é o mecanismo: é **trabalho nosso de manutenção disputando
recurso com o tráfego vivo do cliente**.

**Aberto:** `cron.max_running_jobs = 32` continua maior que a folga de 14. Hoje é
inofensivo porque o pico é 10, mas é um teto que não protege de nada — se alguém
cadastrar 20 jobs novos no mesmo offset, o pg_cron tentará iniciar os 20. Baixá-lo para
perto da folga transformaria "connection failed" em "job enfileirado", que é uma falha
melhor. Não mexi porque exige `ALTER SYSTEM` + reload e não era o que foi pedido.
