// O motivo do erro de uma edge function não chega na tela sozinho.
//
// Quando a function responde não-2xx, o supabase-js NÃO entrega o corpo: ele
// devolve um `FunctionsHttpError` cuja `message` é sempre a mesma frase fixa
// ("Edge Function returned a non-2xx status code") e guarda a Response real em
// `error.context`. Quem faz `toast({ description: error.message })` mostra a
// frase fixa — a function explicou o que houve e a explicação morreu no meio do
// caminho.
//
// Medido em 24/09/2026: 75 chamadas a `functions.invoke` em `src/`, 54 delas
// sem desembrulhar o corpo. Foi isso que transformou "esse token já venceu, só
// reconectando" em "Edge Function returned a non-2xx status code" na tela.

import type { PostgrestError } from "@supabase/supabase-js";

/** Erros da API vêm no contrato de `_shared/api-errors.ts`. */
type CorpoDeErro = { message?: string; error?: string; code?: string | number };

/**
 * Lê o corpo de erro que o supabase-js escondeu em `error.context`.
 *
 * Devolve `null` quando não há corpo JSON (erro de rede, resposta vazia,
 * 502 do gateway) — aí quem chama decide o texto de reserva.
 */
export async function corpoDoErroDaFuncao(error: unknown): Promise<CorpoDeErro | null> {
    const contexto = (error as {
        context?: { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } };
    })?.context;
    if (!contexto) return null;
    try {
        // `context` é uma Response, e o corpo de uma Response só pode ser lido
        // UMA vez. Sem o clone, a segunda leitura estoura e o chamador recebe
        // `null` achando que a function não explicou nada — quem quer o motivo
        // E o corpo cru (telas de diagnóstico) perdia um dos dois em silêncio.
        const fonte = contexto.clone?.() ?? contexto;
        const corpo = await fonte.json?.();
        return (corpo as CorpoDeErro) ?? null;
    } catch {
        return null;
    }
}

/** Código HTTP que a function devolveu, quando o erro carrega a Response. */
export function statusDoErroDaFuncao(error: unknown): number | null {
    const status = (error as { context?: { status?: number } })?.context?.status;
    return typeof status === "number" ? status : null;
}

/**
 * Texto humano do erro de uma edge function, pronto para o toast.
 *
 *     const { data, error } = await supabase.functions.invoke("x", { body });
 *     if (error) throw new Error(await mensagemDoErroDaFuncao(error, "Falha ao ..."));
 *
 * `traduz` permite trocar um código estável do contrato (`code`) por uma frase
 * em português sem depender do texto que a function escreveu.
 */
export async function mensagemDoErroDaFuncao(
    error: unknown,
    reserva: string,
    traduz?: (code: string | undefined, corpo: CorpoDeErro) => string | undefined,
): Promise<string> {
    const corpo = await corpoDoErroDaFuncao(error);
    if (corpo) {
        const traduzido = traduz?.(corpo.code == null ? undefined : String(corpo.code), corpo);
        if (traduzido) return traduzido;
        if (corpo.message) return corpo.message;
        if (corpo.error) return corpo.error;
    }
    const msg = (error as Error | PostgrestError | null)?.message;
    // A frase fixa do supabase-js não informa nada — é pior que a reserva.
    if (msg && !msg.includes("non-2xx status code")) return msg;
    return reserva;
}
