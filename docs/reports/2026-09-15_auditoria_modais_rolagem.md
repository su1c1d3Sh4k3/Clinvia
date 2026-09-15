# Auditoria de modais — altura máxima e rolagem (2026-09-15)

## Regra (user)

> Nenhum modal pode passar da tela. Se não couber inteiro com margem em cima e
> embaixo, a rolagem precisa ser ativada — e a barra de rolagem é invisível.

## Escopo auditado

133 modais em `src/` (fora de `src/components/ui/`):

| Primitiva            | Ocorrências |
| -------------------- | ----------- |
| `DialogContent`      | 106         |
| `AlertDialogContent` | 25          |
| `SheetContent`       | 4           |

Também foram verificados os overlays que **não** usam Radix
(`createPortal` / `fixed inset-0`): só existem 2, ambos em
`src/components/dev-manager/` (`DevManagerSettings`, `TicketAlerts`) e ambos já
tinham `maxHeight: 90vh` + `overflow-y-auto`.

Script da auditoria: `supabase/.temp/_audit_modals.cjs` e `_audit_modals2.cjs`.

## Diagnóstico

| Grupo                                                     | Qtd    | Situação                                                                    |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| A) sem nenhum limite de altura                              | **70** | estouravam a tela; conteúdo abaixo da dobra ficava inalcançável              |
| B) altura limitada, sem `overflow` no container             | 18     | OK — todos têm rolagem interna (`ScrollArea` / `flex-1 overflow-y-auto`)     |
| C) `overflow-hidden` explícito                              | 14     | OK menos 1 (ver abaixo) — dependem de rolagem interna própria                |
| D) margem menor que 5vh (`max-h-[95vh]`+)                   | 0      | —                                                                            |

Causa raiz do grupo A: a primitiva `DialogContent`/`AlertDialogContent` do
shadcn **não define altura máxima nem overflow**. Só os modais que lembravam de
escrever `max-h-[90vh] overflow-y-auto` na mão ficavam contidos — 70 de 133 não
lembravam.

A barra invisível já era garantida globalmente desde antes
(`src/index.css:215-223`: `*::-webkit-scrollbar { width:0; height:0 }` +
`scrollbar-width: none`). Nada a fazer nessa frente.

## Correção

Em vez de editar 70 arquivos, o padrão foi para a **primitiva** — todo modal
nasce contido, e quem tem layout próprio continua sobrescrevendo:

- `src/components/ui/dialog.tsx` e `src/components/ui/alert-dialog.tsx`:
  base ganhou `max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain`
  (2rem de margem garantida em cima e embaixo; `dvh` para não brigar com a barra
  do navegador no celular).
- `src/components/ui/sheet.tsx`: `overflow-y-auto overscroll-contain` na base e
  `max-h-dvh` nos lados `top`/`bottom`.
- `src/components/ContactDetailsDialog.tsx`: era o único modal com
  `overflow-hidden` **sem** rolagem interna e **sem** altura máxima — conteúdo
  simplesmente cortado. O `overflow-hidden` foi removido (o `overflow-y-auto`
  padrão também recorta os cantos arredondados, então nada mudou visualmente).

### Por que não quebra quem já tinha layout próprio

`cn()` usa `tailwind-merge`, que resolve os conflitos na ordem certa:

| className do modal                       | resultado                                   |
| ---------------------------------------- | ------------------------------------------- |
| _(nenhuma)_                              | `max-h-[calc(100dvh-4rem)]` + `overflow-y-auto` |
| `max-h-[80vh] flex flex-col`             | `max-h-[80vh]` + `overflow-y-auto`          |
| `max-h-[90vh] overflow-hidden`           | `max-h-[90vh]` + `overflow-hidden` (rolagem interna preservada) |
| `h-[90vh] overflow-hidden`               | altura fixa preservada, clampada pelo `max-h` em telas baixas |

Ou seja: os 14 modais com rolagem interna (`ScrollArea`, wizards, chat) seguem
exatamente como estavam.

## Ponto conhecido (não alterado)

O botão "X" das primitivas é `absolute right-4 top-4` dentro do próprio
container de rolagem — em modal longo ele sai de vista ao rolar. Já era assim
nos ~46 modais que rolavam antes desta mudança; fechar por `Esc` ou clique fora
continua funcionando. Tornar o X fixo exigiria envolver os filhos num wrapper de
rolagem, o que quebraria os layouts `flex flex-col` + `flex-1` de todos os
modais com rolagem interna.
