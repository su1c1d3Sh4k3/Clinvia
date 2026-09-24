# O detector do canal mudo gritava com o canal funcionando

**24/09/2026** · componente `canal:whatsapp-alertas` · migration `20260924220000`

## O que estava em risco

Nenhum cliente. O afetado é o Super Admin, e o dano é do tipo que só aparece no pior
dia: **um vigia que grita quando está tudo bem ensina a ignorar o vermelho.** Entre
11:45 e 17:00 de hoje ele recebeu **8 e-mails** dizendo que o canal de alertas estava
mudo — enquanto os alertas do dia chegavam normalmente no WhatsApp dele. Foi ele quem
mandou desconfiar do detector, não do canal. Estava certo.

**Nenhuma mensagem se perdeu.** Todo alerta enviado desde 12:21 de hoje foi confirmado
como entregue em 2 a 18 segundos.

## O que foi medido, na ordem que ele pediu

**1. Existe webhook da Meta recebendo statuses?** Sim.
`GET /v21.0/497613820103663/subscribed_apps` devolve o app `1328505766119863` com
`override_callback_uri = https://<ref>.supabase.co/functions/v1/meta-webhook`.

**2. Está inscrito nesse campo?** Sim, e com prova de tráfego: só nas últimas 24h
entraram **1.727 recibos** `delivered`/`read` na tabela `messages`. A série de 7 dias
não tem um único dia zerado. Nunca houve buraco aqui.

**3. Quando chega, alguma coisa grava? Em qual tabela?** Duas coisas, e é aqui que
estava a assimetria:

| Tráfego | Recibo cai em | Desde quando |
|---|---|---|
| Mensagem de cliente | `messages.status` | sempre |
| **Alerta do Super Admin** | `incident_notifications.delivered_at` | **hoje, 12:21** |

O alerta **não passa por `messages`** — `alert-notify` fala direto com o Graph, sem
contato, sem conversa, sem card. Então até ontem nada casava o recibo com a
notificação. A reconciliação (`alert_notification_status()` no `meta-webhook`) só
nasceu em `20260924120000`, que subiu às 12:21 de hoje.

**4. Alguma confirmação já foi registrada?** Sim: **13**, todas depois das 12:21,
todas em 2 a 18 segundos. A premissa do detector é válida — ela passou a ser válida
hoje ao meio-dia.

## A causa

As **44 notificações anteriores a 12:21 nunca serão confirmadas.** Elas são de antes
do reconciliador existir, e a Meta não reenvia recibo. O ramo `sem_confirmacao` lê
uma janela deslizante de 6h e contava essas linhas como prova de canal mudo:

```
14:15 → janela 08:15–14:00 → 6 linhas pré-12:21 → "6 mensagens sem confirmação"
```

É exatamente o alerta que ele recebeu. E o detector ignorava que, na **mesma janela**,
6 outras notificações tinham sido confirmadas em segundos.

### A segunda falha, que é minha

Esse é o mesmo defeito que o ramo `meta_recusou` já teve em 23/09 — contar o que
falhou e ignorar o que deu certo no mesmo período. Aquela correção existia, na variável
`v_ok_recente`, e **a minha re-emissão de ontem (`20260924120000`) apagou.** O corpo
inteiro foi reescrito a partir da versão errada. O detector não quebra quando isso
acontece: ele volta a mentir, que é pior, e em silêncio.

## O conserto

Não se mexeu no envio. Não se reescreveu linha histórica — inventar um `delivered_at`
que nunca aconteceu seria mentir no único lugar onde medimos honestidade de entrega.

1. **Ramo (d) exige contraste:** só acusa se, na janela, **nenhuma** notificação foi
   confirmada. Uma única confirmação prova a cadeia inteira de pé (envio → Meta →
   webhook → reconciliação).
2. **Ramo (d) ignora linha sem `wamid`:** sem wamid não existe chave para o recibo
   casar, então essa ausência não depende do canal.
3. **Ramo (a) recupera `v_ok_recente`**, a guarda de 23/09.
4. O incidente aberto (`1b1fe137`, 22 eventos, 8 notificações) foi resolvido com a
   nota explicando o falso positivo.

Teste de acesso: `supabase/tests/security/item_canal_mudo_contraste/verify.sql`, **8/8**.
As checagens 1 a 4 fixam as duas guardas ao *texto* da função — a próxima re-emissão
que as apagar falha aqui, e não no telefone dele.

## O que fica aberto

- **`status` nunca vira `'delivered'`**, mesmo quando `delivered_at` é preenchido. Hoje
  isso é inofensivo (o predicado certo é `delivered_at is null`), mas a coluna diz
  "sent" para mensagem entregue e vai enganar a próxima leitura. Não mexi porque
  mudar o estado exigiria revisar todo consumidor de `status`.
- **9 notificações sem `wamid` nenhum** (fora as 7 por e-mail). Não sei ainda por que
  o envio não devolveu id.
- As 44 linhas pré-12:21 permanecem sem confirmação, de propósito. Elas somem da
  janela sozinhas.
