# Título do alerta em 4 campos (24/09/2026)

**Pedido dele:** *"quero que mude o titulo dos alertas Componente | Origem da falha | Cliente |
Resolução. Formate o titulo dessa forma pra que apenas vendo o titulo eu consiga entender o
problema, o impacto e a solução. Não precisa mudar nada no codigo e tals, apenas a estrutura do
título."*

Continuação direta de `2026-09-24_alerta_sem_hierarquia.md`.

---

## 1. O que já existia e o que teve de nascer

Dos quatro campos, **dois já estavam no alerta** (componente e conta) e **dois não existiam**:

| campo | de onde vem |
|---|---|
| Componente | `incidents.component`, já era a 1ª linha do corpo |
| Origem da falha | `incidents.origem`, existia como frase longa — virou rótulo curto |
| Cliente | `resolverConta()`, existia mas **mentia** (§3) |
| Resolução | **não existia em lugar nenhum** — derivado (§2) |

A origem precisou de um rótulo curto porque o texto que ela tinha (`"Webhook de terceiro
(Meta/UAZAPI/Instagram)"`, 43 caracteres) sozinho já estoura a linha e recria a parede de texto que
o título existe para evitar.

**Não existe "banco de dados" na lista que ele citou.** O classificador nunca emite esse valor: um
erro de Postgres chega como `cron` ou `edge_interna`, conforme quem chamou. Inventar a etiqueta
faria o título prometer uma distinção que o dado não tem.

## 2. Resolução: derivada da origem, não do que a IA escreveu

O caminho óbvio era usar `ai_fix_system` × `ai_fix_n8n`. **Medido em 24/09, não serve:** dos 9
incidentes com origem `ia_n8n`, **7 tinham os DOIS campos preenchidos**. A IA escreve os dois quase
sempre, então como discriminador binário eles valem zero.

A origem, sim, decide quem consegue mexer:

| origem | resolução |
|---|---|
| `cron`, `edge_interna`, `front` | Claude Code |
| `ia_n8n` | Humano (n8n) |
| `webhook_externo`, `integracao_externa` | Humano (provedor) |
| `multiplas`, `nao_identificada` | **A definir** |

As duas últimas caem em "A definir" de propósito: sem saber de onde veio não dá para dizer quem
conserta, e chutar "Claude Code" faria o título mentir justamente no campo criado para ele decidir
se age.

O `"(inferida)"` acompanha o rótulo curto porque **39 de 41 incidentes da série têm origem
deduzida** — e a incerteza da origem contamina o campo Resolução inteiro.

## 3. O campo Cliente estava mentindo — e a primeira versão piorava

A regra dele é *"qual o nome da empresa ou se for geral coloque todos"*. Traduzir "sem dono" para
"Todos os clientes" parecia óbvio. **A medição derrubou:**

| situação | incidentes |
|---|---|
| tem `owner_id` | 6 |
| **sem `owner_id` e sem `affected_tenants`** | **44** |

Entre esses 44 há `api-public-booking`, `instagram`, `delivery-automation-worker` e `n8n` — todos
de **um** cliente. Carimbar "Todos os clientes" neles faria o título **exagerar o impacto no campo
que ele criou para medir impacto**. Dois defeitos concretos que apareceram no ensaio:

1. `affected_tenants` com **exatamente 1** item caía no mesmo ramo do cron e era anunciado como
   "Todos os clientes";
2. `n8n:FLUXO CLIENTE - PELE DERMATOLOGIA (pelemaceio - INSTAGRAM)` saía como "Todos os clientes",
   com o nome do cliente visível na própria linha.

Cadeia final: dono → 1 tenant afetado → N tenants → **instância no componente** → origem global.

O quarto degrau é o que recupera a família mais comum: o componente do n8n carrega a instância entre
parênteses, e ela casa em `instances.instance_name` (WhatsApp) ou, tirando o sufixo `" - INSTAGRAM"`,
em `instagram_instances.account_name` (Direct). Só então, e **só para origem `cron`/`front`** (código
e rotina compartilhados), vale "Todos os clientes". Fora disso o título diz **"Conta não
identificada"** — que é a verdade, e é ela própria um sinal: o monitor não conseguiu atribuir.

## 4. O componente repetia o cliente

`n8n:FLUXO CLIENTE - PELE DERMATOLOGIA (meta-215168561689565) | n8n | PELE DERMATOLOGIA | Humano (n8n)`

114 caracteres, nome do cliente duas vezes. `componenteNoTitulo()` tira só a duplicata e **preserva
o que está entre parênteses** — a instância é a chave para achar o incidente no painel depois, e
encurtar a ponto de perdê-la trocaria uma leitura boa por uma busca impossível. Fica em 81.

## 5. O título não esperou a Meta

O v3 continua `PENDING` desde ontem e a Meta não promete prazo. Entregar o título só na aprovação do
v4 deixaria o pedido dele parado por tempo indeterminado, **e o template é hoje o caminho permanente**
(janela de 24h fechada desde 23/09).

Então os três templates carregam o título, cada um como cabe no corpo que já está aprovado:

| template | como o título entra |
|---|---|
| `sys_alerta_incidente_v4` | 4 variáveis próprias, linha 2 em negrito (desenho ideal) |
| `sys_alerta_incidente_v3` | `{{2}}` = `componente \| resolução`; origem e conta já têm linha |
| `sys_alerta_incidente_v2` | `{{2}}` = título inteiro, atrás do rótulo fixo `Componente:` |

O v2 fica com um rótulo torto (`Componente: x | y | z | w`) **e isso é deliberado**: rótulo torto
hoje vale mais que rótulo certo em data desconhecida. Quando o v4 aprovar, o v2 para de ser usado
sozinho — `enviarTemplate` tenta v4 → v3 → v2 e só desce um degrau em `132001`/`132015`/`132016`.

## 6. Por que template novo em vez de editar o v3

`POST /{template_id}` no v3 PENDING:

```
code 100, error_subcode 2388003
"Apenas é possível editar modelos de mensagem caso estes tenham sido rejeitados."
```

**A Meta só aceita edição de template REJEITADO.** Medido, não suposto. Daí o nome novo. O v3 não
foi apagado: apagar bloqueia reuso do nome por 30 dias, e ele ainda é o degrau do meio.

## 7. O resumo NÃO recebeu o título

De propósito. O resumo de 2h agrega N incidentes de componentes, clientes e origens diferentes —
componente, cliente e resolução não têm valor único. Um título de 4 campos ali seria invenção.

## 8. Estado na entrega

| template | status |
|---|---|
| `sys_alerta_incidente_v4` | **PENDING** (id `1094221013200609`) |
| `sys_alerta_incidente_v3` | **PENDING** |
| `sys_alerta_resumo_v3` | **PENDING** |
| `sys_alerta_incidente_v2` | APPROVED — **já entrega o título** |
| `sys_alerta_resumo_v2` | APPROVED |

Function deployada e bundle publicado conferido. **Não disparei alerta de teste para o telefone
dele** — a prova vem no próximo alerta real.
