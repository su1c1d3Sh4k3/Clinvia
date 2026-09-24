# A mensagem morre depois do 200 — 302 falhas em 7 dias, zero alertas

**Data:** 24/09/2026
**Gatilho:** reporte de um atendente que recebeu "falha ao enviar" ao responder um cliente, sem que nenhum alerta fosse emitido.
**Commits:** correção nesta entrega (`meta-webhook`, `webhook-handle-status`, migration `20260924160000`).

---

## 1. O que foi medido

Procurei primeiro em `messages` e achei 11 falhas em 3 dias. Quase parei aí. O número
está errado por um motivo bobo: **ticket encerrado apaga as linhas de `messages` e
arquiva tudo em `conversations.messages_history`**. Refazendo a conta nos dois lugares:

| Onde | Falhas de saída em 7 dias |
|---|---|
| `messages` (conversas abertas) | 11 |
| `conversations.messages_history` (tickets encerrados) | 291 |
| **Total** | **302** |

Distribuição por instância (todas Meta Cloud):

| Empresa | Instância | Falhas |
|---|---|---|
| PELE DERMATOLOGIA | `meta-1220713571131185` | 163 |
| Contourline | `meta-103057676058930` | 124 |
| PELE DERMATOLOGIA | `meta-215168561689565` | 4 |
| (demais) | | 11 |

**Incidentes gerados por tudo isso: zero.** Não existe, em toda a série de incidentes,
uma única linha de `evolution-send-message`, `meta-send-message` ou qualquer componente
de envio. O painel ficou verde durante os 7 dias.

### As 7 que são de gente

A maioria das 302 é automação e campanha. Sete são atendentes humanos respondendo
cliente — que é exatamente o reporte:

| Atendente | Empresa | Quando | Horas desde a msg do cliente |
|---|---|---|---|
| Caroline Lorrany Pereira | Contourline | 22/09 10:28 | −24,0 |
| Caroline Lorrany Pereira | Contourline | 22/09 10:27 | **+0,1** |
| Caroline Lorrany Pereira | Contourline | 22/09 10:13 | −0,4 |
| Caroline Lorrany Pereira | Contourline | 22/09 10:13 | **+0,1** |
| Marcelle Marques | PELE | 21/09 17:03 | **+0,8** |
| PATRICIA PEREIRA | PELE | 21/09 16:21 | −18,5 |
| Caroline Lorrany Pereira | Contourline | 17/09 11:15 | **+0,1** |

Duas coisas que essa tabela derruba:

1. **Não é a janela de 24 horas.** Várias falharam 6 minutos depois de o cliente
   escrever. A janela estava aberta.
2. **Todas têm corpo vazio**, o que em `messages` significa mídia (imagem, áudio,
   documento). O padrão aponta para falha no envio de mídia, não em texto.

Qual foi o código de erro da Meta em cada uma? **Não dá para saber.** Ver §3.

---

## 2. Por que o alerta não chegou

Três razões independentes. Nenhuma é "o alerta falhou" — é que **não havia alerta para
falhar**.

### 2.1 A recusa assíncrona produz 200 em toda a cadeia

Este é o motivo principal e é estrutural:

1. `meta-send-message` posta no Graph. **A Meta responde 200, com wamid de verdade.**
2. A mensagem é inserida em `messages` com status `sent`. Para o atendente, saiu.
3. Minutos depois chega o recibo de falha, por webhook assíncrono.
4. `meta-webhook` responde **200**.
5. `webhook-handle-status` vira o status para `failed` e responde **200**.

`serveMonitored` só relata resposta **≥ 500**. Não há um único 5xx nessa cadeia inteira,
então o monitoramento nunca vê. Não é um furo de configuração: é a classe de falha
desenhada para ser invisível para um monitor que olha código HTTP.

O atendente viu a falha porque o balão dele mudou para "falhou" na tela alguns minutos
depois de aparecer como enviado. Foi o único aviso que existiu no sistema inteiro.

### 2.2 O motivo da Meta era jogado fora

Em `meta-webhook`, o `status.errors[0]` — que é o único lugar onde a Meta diz **por que**
a mensagem morreu — ia para um `console.error` e acabava ali. O payload normalizado
repassado ao `webhook-handle-status` não carregava o código. O handler marcava `failed`
sem saber de quê, e não havia como distinguir "número não tem WhatsApp" de "template
pausado" de "conta com restrição" — problemas diferentes, com donos diferentes.

### 2.3 Os ramos 4xx das funções de envio são mudos de propósito

`evolution-send-message` e `meta-send-message` só chamam `reportIncident` em `status >= 500`.
Isso está **certo** para erro de quem chamou (`conversation_not_found`, `missing_conversation_id`).
Está **errado** para `instance_not_configured` e `meta_not_configured`, ambos 422, que são
defeito nosso e hoje somem sem deixar rastro. Fica anotado; não foi mexido nesta entrega.

---

## 3. O agravante: o armazém de logs do projeto não existe mais

O `console.error` da §2.2 era o último rastro. Ele hoje escreve em lugar nenhum.

Todas estas tabelas de log respondem `{"error":"Table \"X\" does not exist."}`:
`edge_logs`, `function_edge_logs`, `function_logs`, `postgres_logs`, `auth_logs`,
`realtime_logs`, `storage_logs`, `supavisor_logs`, `pgbouncer_logs`. O endpoint
`logs.all` responde **HTTP 410**.

Consequência prática, medida hoje: **não há como descobrir qual foi o código de erro das
302 falhas.** A informação existiu e foi descartada. É por isso que a correção abaixo
grava o código no incidente em vez de logar.

Isso é um ponto cego maior que o defeito que este documento corrige, e não se resolve do
lado do código. Fica como pendência de plataforma.

---

## 4. O que foi corrigido

### `meta-webhook`
O payload normalizado passa a carregar o motivo:

```ts
erro: erroDaMeta ? { code, title, details } : null
```

### `webhook-handle-status`
É o funil por onde passa **todo** recibo de falha dos dois provedores, tanto de conversa
aberta quanto de ticket arquivado (`apply_archived_message_status`). Quando uma mensagem
**real** vira `failed`, ele relata incidente:

```
envio:rejeitado-131042 (pele-10)
envio:bloqueado-131047 (meta-488512407686498)
```

Três decisões embutidas no formato do componente:

- **O código entra no nome** porque "número bloqueado" e "template pausado" não podem
  somar no mesmo contador.
- **A instância entre parênteses** é lida pela mesma cadeia que o `alert-notify` já usa
  para descobrir o cliente, então o campo *Cliente* do título resolve sem código novo.
- **Incidente é deduplicado por componente**, então 163 mensagens perdidas pelo mesmo
  motivo na mesma instância viram **um** incidente que acumula eventos. Supressão na
  origem, nunca na porta.

Guarda deliberada: só relata se `updated + archived > 0`. Recibo de wamid que não existe
em lugar nenhum é o alerta do próprio super admin, que não tem linha em `messages` —
relatar por aqui criaria um incidente que só poderia ser avisado pelo canal que acabou
de cair. Esse caso é do `canal:whatsapp-alertas`, que vive fora do canal de propósito.

### Duas famílias, não uma (migration `20260924160000`)

| Família | Piso | Quem é o primeiro respondente |
|---|---|---|
| `envio:rejeitado-` | **alta** | Nós. Saúde da conta, template pausado, limite estourado, código não classificado. |
| `envio:bloqueado-` | **media** | O fluxo. Destinatário não pode receber: 131026, 131047, 131049, 131051, 130472. |

Nenhuma das duas é `somente_painel`. Lembrando que o piso é **piso, não teto**: a IA pode
subir, e sobe.

---

## 5. Aberto, medido, não corrigido

- **`pele-10` está `disconnected` desde 10/09 com 34 falhas consecutivas de envio.** Em
  14 dias o único sinal que isso produziu foi uma linha na tabela `notifications` (aviso
  dentro do app, no dia 10). **`notifications` não é ligada a `incidents`** — ninguém
  nunca foi alertado.
- **`meta-1323435687512482` está com `restriction_active` e `META_DISPLAY_NAME_DECLINED`
  desde 18/08.**
- Os 422 `instance_not_configured` / `meta_not_configured` continuam mudos (§2.3).
- O armazém de logs (§3).

---

## 6. Como isto se prova

Não injetei falha: esta classe acontece sozinha em volume (≈43 por dia nas duas contas).
O primeiro recibo de falha real depois do deploy gera o incidente. É a mesma forma como o
conserto da janela de 24h se provou ontem.

Verificação de catálogo: `supabase/tests/security/item_envio_recusado_depois_do_200/verify.sql`
— 7 de 7.
