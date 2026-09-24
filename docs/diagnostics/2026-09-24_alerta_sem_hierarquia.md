# Alerta virou parede de texto (24/09/2026)

**Relato dele:** *"As mensagens de alerta estão vindo todas desformatadas sem quebras de linha, as
que vinham sem template ontem vinha no formato correto, as de hoje está vindo todas sem quebra de
linha nem hierarquia."*

Ele descreveu o sintoma com precisão, inclusive a data em que mudou. O que ele não podia saber é que
**a causa foi o conserto de ontem** — e que ela é permanente, não passageira.

---

## 1. A medição: o alerta trocou de caminho às 12:21 de hoje

| dia | texto livre | template |
|---|---|---|
| 23/09 | 35 | 0 |
| 24/09 | 9 — **todos antes de 12:21** | 3 — **todos depois de 12:21** |

12:21 é quando subiu o conserto do canal mudo (`6415fde`, migration `20260924120000`). Aquele
conserto passou a consultar `alert_recipients.last_inbound_at` **antes** de enviar: janela de 24h
fechada ⇒ template direto, porque texto livre fora da janela é aceito com 200 e derrubado depois por
webhook assíncrono (`131047`).

`last_inbound_at` do número dele: **22/09 16:58**. A janela fechou em 23/09 16:58 e **só reabre se
ele responder**. Ou seja: **o template deixou de ser exceção e virou o caminho normal.** O comentário
no código que chamava o template de "plano B" estava velho desde ontem.

## 2. Por que o template é feio — e por que não dava para consertar só no código

Corpo aprovado do `sys_alerta_incidente_v2`, lido direto da WABA:

```
*Alerta Clinbia* - {{1}}
Componente: {{2}}
Erro: {{3}}
Ocorrencias: {{4}}
Conta: {{5}}
Causa provavel: {{6}}
O que fazer: {{7}}
Painel: {{8}}
Mensagem automatica do monitoramento interno.
```

Nove linhas coladas, **nenhuma linha em branco, nenhum título de seção**. Pior: o v2 tem 8 variáveis
e o alerta tem 10 campos, então dois blocos foram espremidos:

- `{{3}}` = `"<o que esse serviço faz> — FALHOU: <o que falhou>"` — as duas frases mais longas do
  alerta viram **uma linha só**;
- `{{5}}` = `"<conta> · origem: <origem>"`.

**E não dá para resolver pelo parâmetro.** A Meta recusa `\n`, `\t` e 4+ espaços dentro de variável
(erro 132000) — por isso existe o `sanitizeParam`, que troca tudo por espaço. **O único lugar onde a
quebra de linha sobrevive é o CORPO do template.** Logo, hierarquia só entra criando template novo.

## 3. O conserto

`sys_alerta_incidente_v3` (10 variáveis, uma por campo) e `sys_alerta_resumo_v3` (4), ambos
`UTILITY`/`pt_BR`, criados na WABA `497613820103663`. O corpo do v3 carrega a estrutura que o texto
livre tinha:

```
*Alerta Clinbia — {{1}}*
Componente: {{2}}
Origem: {{3}}
Conta: {{4}}
Ocorrências: {{5}}

*O QUE ESSE SERVIÇO FAZ*
{{6}}

*O QUE ACONTECEU*
{{7}}

*CAUSA PROVÁVEL*
{{8}}

*O QUE FAZER*
{{9}}

Painel: {{10}}
```

No código, `enviarTemplate(sender, to, novo, reserva)`: manda o v3 e **só** cai no v2 se a Meta
responder `132001` (não existe nessa língua), `132015` (pausado) ou `132016` (desabilitado).
Qualquer outro código é falha de envio e é relatada como falha — cair no v2 ali esconderia o defeito
real.

Duas consequências deliberadas dessa escolha:

1. **O teste de disponibilidade é o próprio erro da Meta, não uma consulta de status.** Enquanto o v3
   estiver `PENDING` o alerta sai no v2; no minuto em que a Meta aprovar, passa a sair no v3 sozinho
   — sem redeploy e sem depender de `message_templates` estar sincronizada com a WABA.
2. `incident_notifications.template_name` passa a gravar **qual template de fato saiu**. Gravar o
   nome fixo deixaria o log mentindo justamente sobre o layout que chegou no telefone dele.

O mesmo vale para o resumo de 2 em 2 horas (`enviarTemplateResumo`).

## 4. Estado na entrega

| template | status |
|---|---|
| `sys_alerta_incidente_v3` | **PENDING** |
| `sys_alerta_resumo_v3` | **PENDING** |
| `sys_alerta_incidente_v2` | APPROVED (reserva) |
| `sys_alerta_resumo_v2` | APPROVED (reserva) |

Function deployada. **Até a Meta aprovar, o alerta continua chegando no layout v2** — a troca é
automática e não precisa de mais nada de nenhum dos dois lados.
