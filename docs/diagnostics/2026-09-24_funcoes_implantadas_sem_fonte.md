# 19 edge functions rodando em produção sem fonte no repositório

**Data:** 24/09/2026
**Projeto:** `swfshqvvbohnahdyndch`
**Natureza:** leitura pura. Nada foi apagado, desativado nem alterado em produção.

---

## 0. Resposta curta

| Pergunta dele | Resposta medida |
|---|---|
| Os 3 webhooks têm checagem de autenticação? | **Nenhum dos três tem. Zero.** `verify_jwt=false` + cliente `service_role` + nenhuma conferência de header no código. |
| Qual dos três recebe mensagem de verdade hoje? | **Nenhum.** O webhook registrado na UAZAPI aponta para `webhook-queue-receiver`. A migração terminou do lado do provedor; o que nunca terminou foi a limpeza. |
| A remoção de ontem foi só no repositório? | **Nenhuma das duas hipóteses.** As duas funções **nunca estiveram no repositório** — 0 commits na história do git. E o `instagram-enrich-profiles` **foi** removido dos dois lados; ali eu errei a favor dele. O padrão real é mais velho e pior (§4). |

E uma correção minha, antes de tudo: **o veredito que dei ontem sobre o `uzapi-webhook-refactor` estava errado.** Detalhe em §2.3.

---

## 1. O que existe

`supabase/tests/security/deploy_drift/check.py` (novo, leitura pura) compara a lista de funções
implantadas com os diretórios de `supabase/functions/`:

```
implantadas: 155   com fonte no repo: 138
IMPLANTADAS SEM FONTE NO REPO (19)
NO REPO E NUNCA PUBLICADAS (2):  _webhook-template, evolution-webhook.disabled
```

As 19 estão **ACTIVE**. 17 com `verify_jwt=false` (alcançáveis por qualquer um na internet, sem
credencial nenhuma); as 2 restantes (`backfill-instagram-photos`, `whatsapp-webhook`) têm
`verify_jwt=true` e só passam com um JWT válido do projeto.

O código delas foi recuperado do bundle publicado (`GET /v1/projects/{ref}/functions/<slug>/body`,
formato ESZIP2.3 — o parser está em `supabase/.temp/_orfas/eszip.py`) e está preservado em
`supabase/tests/security/deploy_drift/fontes_recuperadas/<slug>/index.ts`. Hoje essa é a **única
cópia legível** do que roda nessas 19 URLs.

**Nenhuma das 19 tem chamador vivo** em `src/`, `supabase/functions/` ou `supabase/migrations/`.
Os 3 aparentes são: uma auto-referência dentro da cópia `.disabled`, um `console.log` desatualizado
em `src/pages/WhatsAppConnection.tsx:178` (o `invoke` acima dele chama `uzapi-manager`) e um
comentário de migration.

---

## 2. Os três webhooks

### 2.1 `evolution-webhook` (v68) — **o único que ainda escreve sem autenticação**

- **Autenticação:** nenhuma. Não lê um único header da requisição.
- **Tabelas que o código escreve:** `instances` (update), `contacts` (upsert), `conversations`
  (insert/update), `messages` (upsert).
- **O que de fato executa hoje:** só o caminho `connection.update`. Ele começa com
  `instances.select('*')`, que não pode falhar por coluna inexistente, e termina em:

  ```js
  await supabaseClient.from('instances')
    .update({ status, qr_code: null })
    .eq('id', instance.id);
  ```

  O caminho de mensagem morre antes de escrever: o upsert de `contacts` usa
  `onConflict:'remote_jid'` (coluna que não existe mais → 42703) e o de `messages` usa
  `onConflict:'evolution_id'`, para o qual não há índice único (só existe
  `idx_messages_evolution_per_conversation (evolution_id, conversation_id)` → 42P10).

- **Alcance do estrago:** injetar mensagem falsa, **não**. Mas um POST anônimo com
  `{"instance":"<nome>","event":"connection.update","data":{"state":"close"}}` marca a instância
  como `disconnected`. E `instances.status = 'connected'` é portão em 16 lugares — entre eles
  `_shared/automation-instance.ts`, `process-auto-messages`, `delivery-automation-dispatcher`,
  `send-satisfaction-survey`, `recurrence-template-sync` e toda a cadeia `instagram-*`. Ou seja:
  **uma requisição sem credencial nenhuma desliga em silêncio a saída automatizada de um cliente.**
  Nomes de instância são adivinháveis: `meta-<phone_number_id>` (5 instâncias Meta conectadas),
  `pele-10`, `confirmação-agenda`.

### 2.2 `uzapi-webhook` (v50) — inerte

- **Autenticação:** nenhuma.
- **Tabelas no código:** `instances`, `contacts`, `conversations`, `messages`.
- **Por que não escreve:** resolve a instância com um `.single()` sem filtro sobre uma tabela de 7
  linhas (erro garantido) e usa `contacts.remote_jid`, coluna que não existe mais.

### 2.3 `uzapi-webhook-refactor` (v82) — inerte, **e aqui eu errei ontem**

Ontem eu escrevi que essa função estava "alinhada com o schema atual e plenamente funcional — o
caminho de injeção real". **Está errado.** O que eu não tinha conferido é a primeira consulta que
ela faz:

```js
const { data: instance, error: instanceError } = await supabaseClient.from('instances')
  .select('id, apikey, user_id, webhook_url, default_queue_id')
  .eq('instance_name', instanceName).single();
if (instanceError || !instance) { return 404; }
```

`instances.default_queue_id` **não existe**. Conferi de duas formas: varredura de
`information_schema.columns` para as 32 colunas que a função toca (só essa dá `NAO EXISTE`) e
reprodução da consulta exata com a service key, que devolve
`{"code":"42703","message":"column instances.default_queue_id does not exist"}`. Ela responde 404
**antes de qualquer escrita**.

O que continua verdadeiro do meu diagnóstico de ontem é o resto: as outras 31 colunas estão
corretas, os inserts em `contacts`/`conversations`/`messages` são de schema atual. **Ela voltaria a
funcionar por inteiro no instante em que essa coluna reaparecesse** — e é por isso que ela é a mais
perigosa das três a médio prazo, mesmo sendo a mais inofensiva hoje.

Consequência prática da correção: isto **deixa de ser crítico que sobe na frente de tudo** e vira
alto sem emergência. Preferi dizer isso em voz alta a deixar você decidir em cima do número errado.

### 2.4 `whatsapp-webhook` (v47) — duplamente morto

`verify_jwt=true` (só passa com JWT do projeto), usa `contacts.remote_jid` (não existe) e status
`'pendente'`/`'aberto'` em português, que saíram do produto.

### 2.5 Quem recebe mensagem de verdade

Consultei os webhooks registrados nas instâncias UAZAPI:

- `pele-10` → `https://swfshqvvbohnahdyndch.supabase.co/functions/v1/webhook-queue-receiver`
- `confirmação-agenda` → `null` (nenhum webhook registrado)

Nenhuma instância aponta para os três. A migração que você suspeitou estar pela metade **terminou**
do lado do provedor há muito tempo. O que ficou pela metade foi a remoção.

---

## 3. Achado que não estava no escopo: `uzapi-configure-webhook` (v45)

É o pior dos 19 que não é webhook de mensagem:

```js
const { instanceId } = await req.json();
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const { data: instance } = await supabase.from("instances").select("apikey").eq("id", instanceId).single();
await fetch("https://clinvia.uazapi.com/webhook", {
  method: "POST",
  headers: { "token": instance.apikey },
  body: JSON.stringify({ enabled: true, url: "…/webhook-queue-receiver",
                         events: ["messages","connection","messages_update"], … })
});
```

Sem autenticação, `verify_jwt=false`, cliente `service_role`. Qualquer um que adivinhe ou obtenha um
UUID de `instances` faz a plataforma **reconfigurar o webhook da UAZAPI daquele cliente usando o
token privado dele**. A URL de destino é fixa e aponta para o receptor certo, então hoje isso não
redireciona tráfego para um atacante — mas é escrita não autenticada na configuração do provedor de
um cliente, e o conjunto de eventos que ela grava **não inclui `groups`**, que o `pele-10` tem
registrado hoje. Uma chamada anônima quebra o monitoramento de grupo dele.

Só 2 das 19 leem algum header: `storage-uploader` (`x-upload-secret` comparado com a string
`"clinvia-upload-2026"`, **em texto puro dentro do bundle publicado**) e `send-push-notification`
(`x-webhook-secret`). As outras 17 não leem nenhum.

---

## 4. O descompasso "removido": nem uma hipótese nem a outra

Você levantou duas: ou a remoção não foi executada, ou foi executada só no repositório. **É uma
terceira, e ela é pior.**

**`instagram-debug-enrich` e `send-push-notification` nunca estiveram no repositório.** Zero commits
na história do git para os dois diretórios. Não existe remoção "só no repo" de algo que nunca esteve
lá, e não há commit nem documento que tenha afirmado a remoção delas. O que houve foi eu tratar
"sumiu da minha lista mental" como "removido". Isso é meu erro de relato, não uma execução falha.

**E o `instagram-enrich-profiles` está errado a seu favor:** ele **não** aparece entre as 155
implantadas. O commit `92fae5d2` removeu dos dois lados. A "primeira ocorrência" que você lembrava
não foi uma ocorrência.

**A ocorrência real é bem mais velha e aconteceu 3 vezes, sempre como dano colateral:**

| Função | Commit que apagou o diretório | Data | Estado hoje |
|---|---|---|---|
| `evolution-webhook` | `b5636271` (renomeou para `evolution-webhook.disabled/`) | 03/02/2026 | ACTIVE v68 |
| `uzapi-webhook` | `0d6e940c` | 18/02/2026 | ACTIVE v50 |
| `uzapi-webhook-refactor` | `0d6e940c` | 18/02/2026 | ACTIVE v82 |

O `b5636271` é a prova mais clara do mal-entendido: alguém tentou **desligar uma função renomeando o
diretório dela**. Isso não tem efeito nenhum sobre a implantação. O `evolution-webhook.disabled/`
está lá no repo até hoje, com 19.477 bytes, e a função continua no ar servindo o bundle antigo há 7
meses e meio.

### O que muda no procedimento

A raiz é que **apagar o diretório não remove a função**, e nada no repositório tornava isso visível.
A migration `20260923240000_remove_instagram_enrich_profiles.sql` carrega a chamada de deleção
**apenas como comentário na linha 22** — depende de alguém ler o comentário e executar à mão.

Três mudanças, uma delas já feita:

1. **Feito:** `supabase/tests/security/deploy_drift/check.py`. Leitura pura, sai com código 1 quando
   há qualquer função implantada sem fonte no repo, e imprime o ritual dos dois lados. Passa a ser a
   verificação que eu rodo antes de afirmar que algo foi removido.
2. **"Removido" só pode ser dito depois de ver os dois lados**: `git rm -r supabase/functions/<slug>`
   **e** `npx supabase functions delete <slug> --project-ref swfshqvvbohnahdyndch`, com a saída do
   `check.py` como comprovação. Nunca renomear diretório para desativar.
3. Nunca deixar uma deleção de função como comentário em migration. Ou é executada no mesmo passo,
   ou não é afirmada.

---

## 5. Tráfego: a janela é 91 dias, não 7

A retenção de log de edge function deste projeto foi medida por busca binária: **91 dias têm
tráfego, 92 não**. A nota que eu tinha na memória ("≈7 dias") está errada e foi corrigida.

Dois detalhes que mudam a leitura do número:

- O endpoint `analytics/endpoints/logs` **limita toda consulta a uma fatia de 24h a partir de
  `iso_timestamp_start` e ignora o `iso_timestamp_end`** — por isso a varredura é dia a dia, e por
  isso ela demora.
- O campo do caminho é `log_attributes['request.pathname']` e vale `/functions/v1/<slug>`, não
  `/<slug>`. Minha primeira varredura devolveu zero para tudo por causa disso; o número abaixo já
  está corrigido.

### O número

**Janela de retenção: 2026-06-25 a 2026-09-24 (92 dias).**
**Medição COMPLETA (fechada em 24/09): os 92 dias varridos, um a um. Invocações das 19 órfãs:
ZERO. Todas. Nenhuma exceção, nenhum dia com uma única requisição.**

Não é amostra nem extrapolação — é a retenção inteira, dia a dia, porque o endpoint de logs trava
toda consulta em fatia de 24h. A varredura levou horas: o backend de analytics da conta entra em
*throttling* depois de uso sustentado e passa a devolver HTTP 500 em consulta trivial
(`supabase/.temp/_orfas/_trafego.py`, retomável — grava o JSON a cada dia e pula o que já mediu).

O que isso encerra e o que **não** encerra: encerra a dúvida "alguém está batendo nelas hoje, ou
bateu em algum momento dos últimos três meses?" — não, ninguém. Não encerra a dúvida sobre as
sazonais de mão única (backfill, upload de manual): três meses de silêncio provam que ninguém
rodou, não que ninguém vá querer rodar.

**A distinção que você pediu, por função.** Como o resultado até aqui é zero uniforme, a diferença
entre "morto" e "sazonal adormecido" não vem do tráfego — vem de quem poderia chamar:

| Situação | Funções | Por que zero já é conclusivo (ou não) |
|---|---|---|
| Sem chamador possível no código e sem registro no provedor | as 19 | Nenhuma linha em `src/`, `supabase/functions/` ou `supabase/migrations/` invoca qualquer uma delas, e nenhuma instância UAZAPI aponta para elas. **Zero aqui não é "ninguém usou"; é "não existe caminho que use".** |
| Sazonal de verdade — uso manual, por humano, em evento raro | `upload-manuals`, `upload-support-manual`, `storage-uploader`, `backfill-instagram-photos`, `refresh-contact-photos`, `instagram-debug-enrich` | São scripts de mão única (backfill / upload de manual). Zero em 92 dias **não** prova que ninguém vá querer rodar de novo — prova que ninguém rodou. Para essas, a decisão é de conveniência, não de risco de quebrar produção. |
| Substituídas por função viva no repo | `uzapi-check-connection`→`uzapi-manager:check_connection`, `uzapi-check-status`→`uzapi-manager:check_status`, `uzapi-configure-webhook`/`uzapi-set-webhook`/`uzapi-setup-webhook`→`uzapi-manager:configure_webhook`, `send-push-notification`→`send-push`, os 3 webhooks→`webhook-queue-receiver` | Aqui zero é confirmação: o trabalho migrou e o substituto está no repo, com tráfego. |
| Provedor que o produto não usa mais | `evolution-*` (4) | A Evolution API saiu; o produto é UAZAPI + Meta. Zero é esperado e definitivo. |

---

## 6. Os três baldes

Invocações = os 92 dias de retenção, varredura FECHADA. **Nada foi apagado.**

### Balde A — reintegrar ao repositório (0)

**Vazio, e isso é um resultado, não uma omissão.** Nenhuma das 19 faz trabalho que o produto ainda
precise e que não tenha substituto vivo no repo. Não há código aqui que valha a pena resgatar.

O único item que exige uma decisão sua antes de sair é `refresh-contact-photos` (228 linhas,
atualiza `contacts.profile_pic_url` em lote via UAZAPI). É o único utilitário operacional real do
conjunto. Se você quiser manter essa capacidade, ela deve **voltar como código no repo e com
autenticação**, não continuar como está.

### Balde B — aposentar direto (16)

Sem substituto a construir: ou já têm um vivo, ou servem a coisa que saiu do produto.

| Função | Invocações (92/92 dias) | Por quê |
|---|---|---|
| `evolution-webhook` v68 | 0 | **Prioridade 1.** Único que ainda escreve sem autenticação (`instances.status`). Evolution API saiu do produto. Entrada viva = `webhook-queue-receiver`. |
| `uzapi-configure-webhook` v45 | 0 | **Prioridade 2.** Reconfigura o webhook do cliente na UAZAPI com o token privado dele, sem autenticação. Substituto: `uzapi-manager:configure_webhook`. |
| `uzapi-set-webhook` v41 | 0 | mesmo trabalho, mesma ausência de auth |
| `uzapi-setup-webhook` v42 | 0 | idem, e ainda escreve em `instances` |
| `uzapi-webhook` v50 | 0 | inerte (`.single()` sem filtro + `contacts.remote_jid`) |
| `whatsapp-webhook` v47 | 0 | `verify_jwt=true`; inerte (schema e status em português obsoletos) |
| `uzapi-check-connection` v50 | 0 | substituto `uzapi-manager:check_connection` |
| `uzapi-check-status` v41 | 0 | substituto `uzapi-manager:check_status` |
| `evolution-check-connection` v50 | 0 | provedor fora do produto |
| `evolution-create-instance` v52 | 0 | provedor fora do produto |
| `evolution-test-connection` v51 | 0 | provedor fora do produto |
| `send-push-notification` v17 | 0 | substituto `send-push`, com 8 chamadores vivos |
| `storage-uploader` v17 | 0 | segredo `"clinvia-upload-2026"` em texto puro no bundle; bucket `manuals` era da Bia, que foi removida |
| `upload-manuals` v22 | 0 | idem |
| `upload-support-manual` v22 | 0 | idem |
| `instagram-debug-enrich` v12 | 0 | ferramenta de depuração; você já tinha mandado remover |

### Balde C — aposentar depois de migrar (3)

Fazem trabalho que ainda tem valor, mas não têm hoje um substituto pronto no repo.

| Função | Invocações (92/92) | O que precisa antes |
|---|---|---|
| `refresh-contact-photos` v11 | 0 | Único utilitário de manutenção real (foto de contato em lote, UAZAPI). Se for manter: reescrever no repo com autenticação. Se não: cai no balde B. **Decisão sua.** |
| `backfill-instagram-photos` v16 | 0 | Backfill de mão única já executado. `verify_jwt=true`, então não é buraco de segurança. Sai assim que você confirmar que o backfill não vai se repetir. |
| `uzapi-webhook-refactor` v82 | 0 | A mais bem escrita das três (763 linhas, schema atual, trata grupos/mídia/follow-up). Está inerte só por causa de UMA coluna. Ou ela morre junto com as outras duas, ou alguém decide que partes dela valem para o `webhook-queue-receiver`. **Enquanto ela ficar no ar sem autenticação, ela é uma bomba armada esperando `instances.default_queue_id` voltar.** Minha recomendação é balde B. |

### O que eu recomendo, se você quiser um caminho curto

Se o objetivo é parar o sangramento hoje sem decidir os 19 casos, existe um passo intermediário que
não apaga nada e é reversível em um comando: **`verify_jwt=true` nas 17 que estão com `false`.** Isso
fecha o acesso anônimo de todas de uma vez, mantém o código no ar, e qualquer coisa que quebrar
aparece imediatamente. Mas é escrita em produção, então não fiz — só deixo a opção na mesa.

---

## 7. O que eu não fiz, de propósito

- Não apaguei, não desativei e não alterei `verify_jwt` de nada. Você decide em cima do tráfego.
- Não toquei em `src/pages/Suporte.tsx` nem em `_shared/support-knowledge.ts` — exceção acordada
  para trabalho interno.
