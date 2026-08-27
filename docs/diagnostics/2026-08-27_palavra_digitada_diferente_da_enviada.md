# Cliente digita "convênio" e o sistema mostra/envia outra palavra

**Data:** 2026-08-27
**Relato:** *"o cliente digita 'convenio' mas o sistema envia a palavra 'convc'; algumas outras palavras também estão com erros parecidos, digita uma coisa e é enviada outra."*

## Resumo

Auditei o caminho inteiro da mensagem (caixa de texto → banco → provedor) e o texto **não é alterado em nenhum ponto do envio**. Não há no banco nenhum vestígio da corrupção relatada.

Encontrei, porém, um bug real e reproduzível **na exibição** que faz a primeira linha da mensagem sumir do painel — provável origem do relato, já corrigido.

## O que foi verificado

### 1. Banco: a string corrompida nunca existiu

`supabase/.temp/diag_convc.sql` e `diag_acentos.sql`:

| Busca | Resultado |
|---|---|
| `convc` em `messages` (ao vivo) | **0** |
| `convc` em `conversations.messages_history` (arquivado) | **0** |
| `conv` + consoante (heurística de palavra truncada) | **0** |
| prefixos soltos de palavra acentuada cortada (`voc`, `tamb`, `hor`, `aten`, `servi`, `est`, `ent`, `obrigad`, `conv`) | **0 cada** |
| `conv[eê]nio` escrito corretamente | **2.060** |
| total outbound analisado | **49.887** |

### 2. Caminho de envio: nenhuma transformação do texto

- `MessageInput.onSendClick` → só troca `@Nome` por `@LID`, **apenas em grupos** e **apenas em tokens iniciados por `@`**.
- `ChatArea.executeSendMessage` → repassa o texto sem tocar nele.
- `evolution-send-message` → única alteração é o prefixo de assinatura `*Nome:*\n`; grava em `messages.body` **exatamente** o que manda ao provedor (`insertBody = finalBody`).

Ou seja: o que está no inbox é, byte a byte, o que o cliente recebeu.

### 3. Bug encontrado (exibição) — corrigido

`MessageList.tsx:272` e `MessageBubble.tsx:90`:

```ts
body.replace(/^\*[^*]+:\*\n/, "")
```

A intenção era tirar do balão o prefixo de assinatura `*Nome do atendente:*\n`. Mas a regex aceita **qualquer** palavra em negrito seguida de dois-pontos na primeira linha. Então uma mensagem escrita pelo atendente como:

```
*Convênio:*
Atendemos Unimed e Bradesco.
```

era exibida no painel como apenas `Atendemos Unimed e Bradesco.` — **a palavra "Convênio" desaparecia da tela**, embora tivesse sido enviada normalmente ao cliente. Vale para qualquer título comum de clínica: `*Horário:*`, `*Endereço:*`, `*Valores:*`.

Confirmação em produção (`diag_prefixo_negrito.sql` / `diag_prefixo_sender.sql`): de todas as mensagens com esse prefixo, 5 **não** correspondem ao remetente — incluindo `*Vantagens das aulas ... em 30 minutos:*` (remetente "Clínica AutoEstima") e 4 mensagens digitadas no app do celular com assinatura manual.

**Correção:** helper único `stripSenderSignature(body, senderName)` em `src/components/chat/FormattedText.tsx` — a linha só é removida quando o negrito bate com `messages.sender_name`. Coberto por `FormattedText.test.tsx`.

### 4. Ajuste de digitação

`ChatArea` tinha um `useDeferredValue(message)` **sem nenhum uso**, que forçava uma segunda renderização do componente mais pesado do inbox a cada tecla. Removido. Não é a causa comprovada de nada, mas era custo puro no caminho da digitação — e digitação lenta em campo controlado é o mecanismo clássico de caractere perdido/embaralhado em palavras acentuadas (teclas mortas `^`, `~`, `´`).

## Conclusão

- Não existe caminho no sistema que troque uma palavra por outra no envio.
- O relato "digitei X e apareceu Y" tem explicação concreta e corrigida no caso de mensagens que começam com título em negrito.
- Se o cliente insistir que a palavra sai errada **no WhatsApp do paciente** (e não só no painel), é preciso o artefato literal para avançar: print da tela do paciente + print do inbox da mesma mensagem. Com o texto correto no inbox e errado no celular, o problema está no aparelho/teclado do atendente (autocorreção, teclas mortas) ou em ferramenta externa (tradutor do navegador, corretor tipo Grammarly) — mesmo desfecho do caso anterior, `2026-05-13_palavras_renderizando_errado.md`.

## Arquivos

- `src/components/chat/FormattedText.tsx` — `stripSenderSignature`
- `src/components/chat/MessageList.tsx`, `src/components/MessageBubble.tsx` — passam `msg.sender_name`
- `src/components/ChatArea.tsx` — remoção do `useDeferredValue` morto
- `src/components/chat/FormattedText.test.tsx` — testes
- `src/components/suporte/InboxGuide.tsx` — FAQ
