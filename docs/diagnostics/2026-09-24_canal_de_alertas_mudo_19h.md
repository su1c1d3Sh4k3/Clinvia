# Canal de alertas mudo por 19h com o painel verde (23-24/09/2026)

**Sintoma relatado:** "desde ontem não recebi mais nenhum alerta, isso foi depois
da janela de 24hs, verifica se os envios estão funcionando."

**Veredito:** não estavam. O canal ficou mudo de **23/09 ~17:04 SP** até o
conserto, em 24/09 ~11:47 SP — cerca de 19 horas. O banco registrava tudo como
entregue.

---

## 1. A linha do tempo

| Quando (SP) | O quê |
|---|---|
| 22/09 16:58 | última mensagem **recebida** dele. Começa a contar a janela de 24h da Meta |
| 23/09 16:03 | último alerta que ele **de fato recebeu** |
| 23/09 16:58 | a janela de 24h fecha |
| 23/09 17:04 | primeiro alerta rejeitado com `131047` — gravado como `sent` |
| 23/09 → 24/09 11:27 | mais 12 rejeições idênticas, todas gravadas como `sent` |
| 24/09 11:45 | o detector novo dispara sozinho e manda a 2ª via por e-mail |
| 24/09 11:47 | correção aplicada |

`incident_notifications` em 24/09: 8 envios (6 `recorrencia`, 2 `resumo`), todos
`status='sent'`, todos `via='whatsapp'`, todos com wamid real, nenhum erro.

Os logs (`source='function_logs'`) contavam outra história — 13 linhas:

```
[meta-webhook] Message failed: wamid.… [{"code":131047,"title":"Re-engagement message",
"error_data":{"details":"Message failed to send because more than 24 hours have passed
since the customer last replied…"}}]
```

**Os 13 wamids batem um a um com as linhas gravadas como `sent`.**

---

## 2. A causa — cinco falhas em série

### 2.1 O 200 síncrono da Meta não é prova de entrega

Fora da janela de 24h a Meta **aceita** texto livre: responde HTTP 200 com um
`wamid` legítimo e só depois derruba a mensagem, por webhook assíncrono de
`statuses`, com `131047`.

É o mesmo padrão já conhecido das campanhas (`131048`, spam rate limit — caso
BOTOX, 831 "sent" e 246 entregues). A lição não tinha sido transferida para o
canal de alertas.

### 2.2 `graphSend` tratava 200 como sucesso

`alert-notify/index.ts`, `graphSend`: qualquer resposta `resp.ok` sem
`data.error` virava `{ ok: true }`.

### 2.3 Logo, o template nunca era tentado

`enviarAlerta` mandava texto livre primeiro e template como plano B. Com
`livre.ok === true`, o plano B nunca rodava.

**E os templates estavam APROVADOS.** Conferido na WABA `497613820103663` em
24/09: `sys_alerta_incidente_v2` e `sys_alerta_resumo_v2`, ambos `APPROVED`,
`pt_BR`, `UTILITY`. O caminho que funciona fora da janela existia desde 22/09 e
nunca foi tomado. (O comentário no topo da função dizia "enquanto os templates
não estiverem APPROVED o plano B também falha" — estava desatualizado.)

### 2.4 Logo, a 2ª via por e-mail nunca disparou

`segundaViaEmail` só é chamada no ramo de falha. Sem falha registrada, não há
segunda via. O canal deixou de ser ponto único em 23/09 (`aa43b93`) e voltou a
ser, por um caminho que a prova daquele dia não cobria.

### 2.5 Logo, o detector de canal mudo ficou calado

`canal_alertas_scan` tinha três motivos — `meta_recusou`, `fila_parada`,
`sem_saida`. Os três exigem que a falha **já esteja registrada**. Aqui não
estava: só havia `sent`.

E não havia como registrar. `alert-notify` fala direto com o Graph e **de
propósito não cria linha em `messages`** (senão cada erro da plataforma viraria
contato + conversa + card de CRM no inbox do tenant Bruno Admin). Sem linha em
`messages`, `webhook-handle-status` não tem em que casar o wamid: a falha
assíncrona caía no chão.

---

## 3. A correção

Migration `20260924120000_alerta_janela_24h_e_reconciliacao.sql`
(+ `_rollback.sql`), `alert-notify` e `meta-webhook`.

### (a) A janela é consultada ANTES de enviar

`alert_recipients.last_inbound_at` — última mensagem recebida do destinatário.
Backfill a partir de `messages` (recorte de 30 dias; mais velho que isso é
janela fechada de qualquer jeito, e NULL já é o valor seguro). Mantido pelo
`meta-webhook` via `alert_recipient_inbound()`.

`alert-notify` passa a decidir o caminho:

- **janela aberta** → texto livre (aceita `\n`, layout completo), template como
  plano B se a Meta recusar na hora;
- **janela fechada ou desconhecida** → **template direto**, sem tentar texto
  livre. Tentar seria pior que não tentar: seria aceito com 200 e gravaria um
  `sent` falso por cima da falha real.

Margem de 30 min sobre as 24h: a janela conta pelo relógio da Meta, não pelo
nosso `created_at`. Meia hora de folga custa um template `UTILITY` (~US$0,008) e
evita o silêncio.

O mesmo conserto vale para o caminho do **resumo**, que era metade dos alertas
perdidos.

### (b) O wamid passa a ser reconciliado

`meta-webhook` casa o wamid do alerta pela RPC `alert_notification_status()`:

- `failed` → `incident_notifications.status='failed'` + `error_code`, e o
  **incidente volta para a fila** (`notified_count-1`, `notify_claimed_at=null`,
  `notify_next_attempt_at=now()`);
- `delivered`/`read` → preenche `delivered_at`.

`status='sent'` agora significa **"a Meta aceitou"**. Entrega é `delivered_at`.

**Autocorreção:** se o `131047` chegar mesmo assim, a reconciliação **zera o
`last_inbound_at`** — na tentativa seguinte o alerta já sai como template. O
rastreamento pode errar uma vez; não pode errar sempre.

**Idempotência:** o `UPDATE` filtra `status='sent'`. A Meta reenvia o mesmo
status, e sem esse filtro cada reenvio devolveria o incidente para a fila em
laço.

**Custo:** não dá para chamar a RPC em todo status — seriam milhares por dia de
mensagem de tenant. O corte é o telefone do destinatário
(`status.recipient_id`) comparado com a lista de `alert_recipients`, que tem
meia dúzia de linhas e muda quase nunca: cache de 5 min no módulo.

### (c) Motivo novo no detector: `sem_confirmacao`

Aceito pela Meta, 15 min de carência, nenhuma confirmação de entrega. É o único
motivo que teria pego este incidente **no momento em que ele começou** — os
outros três precisavam que alguém já soubesse da falha.

15 min e não menos porque celular desligado atrasa a confirmação de forma
legítima.

**Provou-se sozinho:** às 11:45, minutos depois da migration, o
`alert-channel-watch` disparou e mandou a 2ª via por e-mail. Texto do detector:

> 7 alerta(s) aceito(s) pela Meta nas ultimas 6h sem NENHUMA confirmacao de
> entrega (o mais antigo ha 269 min). A Meta devolve 200 com wamid e falha a
> mensagem depois: aceito nao e entregue.

---

## 4. Verificação

`supabase/tests/security/item_alerta_janela_24h/verify.sql` — 13 linhas, todas
`ok`. Cobre: colunas criadas; `EXECUTE` fechado para `anon`/`authenticated` nas
três funções (a pegadinha do grant a `PUBLIC`); `search_path` fixo; wamid
desconhecido e telefone desconhecido devolvem `false` sem efeito colateral; o
detector conhece o motivo novo; o backfill achou a janela do destinatário real.

### O canal provado de ponta a ponta (24/09 12:21)

Entre o conserto (11:47) e 12:21 nada chegou — e isso **não** era falha: a fila
estava vazia, a recorrência é de hora em hora e a última tinha sido 11:27. Em
vez de esperar a próxima, forcei um envio pelo canal real:

```
12:21:05  enviado   via template sys_alerta_incidente_v2
12:21:14  entregue  confirmação da Meta — 9 segundos
```

**Primeira confirmação de entrega real que este sistema já teve.** Antes só
existia "a Meta aceitou".

Duas coisas que esse minuto ensina, além do conserto:

- **Silêncio na fila não é canal quebrado.** Antes de concluir qualquer coisa a
  partir de "não chegou nada", olhar quantos incidentes estavam esperando
  despacho na janela observada.
- **Quando a pergunta é "por que não está chegando", a resposta não é análise —
  é fazer chegar.** O disparo manual se identifica como teste (severidade
  `baixa`, origem "Disparo manual de teste"), então não confunde com alerta
  real, mas quem dispara avisa na mesma hora que foi ele.

---

## 5. O que fica em aberto

- **Nenhuma notificação antiga foi corrigida retroativamente.** Marcar os 13
  como `failed` devolveria 13 incidentes à fila de uma vez e produziria uma
  rajada no telefone. Ficam como estão, com este documento explicando.
- **Só o texto livre tem os quatro blocos completos.** O template v2 tem 8
  variáveis e nenhuma sobra para "o que esse serviço faz", que entra colado em
  `{{3}}`. Fora da janela o alerta é um pouco mais apertado. Criar um v3 custa
  outra aprovação da Meta.

---

## 6. A lição que vale além deste caso

**Confirmação síncrona de provedor externo não é prova de efeito.** Já
sabíamos disso em três lugares independentes deste projeto:

1. `net.http_post` é fire-and-forget e o `pg_cron` diz `succeeded` para uma
   chamada que voltou 401 (`alert-notify`, semanas de 401 invisível);
2. `cron.job_run_details.status` não é sinal de saúde (`cron-health-watch`);
3. campanhas da Meta com 131048 (caso BOTOX).

Este é o quarto. O padrão é sempre o mesmo: **o registro de sucesso é escrito
por quem despachou, não por quem recebeu.** Onde isso acontecer, é preciso uma
segunda escrita, vinda do outro lado, para que o sucesso signifique alguma
coisa — e um detector que reclame do silêncio dela.
