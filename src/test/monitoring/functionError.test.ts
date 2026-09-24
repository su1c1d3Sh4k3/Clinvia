// O caso real que originou o helper (24/09/2026): a conta @suicideshake tinha
// token vencido em 05/07 e a edge function respondeu 401 com
// `{ code: "TOKEN_EXPIRED", error: "Token already expired..." }`. A tela mostrou
// "Edge Function returned a non-2xx status code" porque ninguem leu o corpo.

import { describe, expect, it } from "vitest";
import { corpoDoErroDaFuncao, mensagemDoErroDaFuncao } from "@/lib/functionError";

/** Imita o FunctionsHttpError do supabase-js: frase fixa + corpo em `context`. */
function erroHttp(corpo: unknown) {
    const e = new Error("Edge Function returned a non-2xx status code") as Error & {
        context?: { json: () => Promise<unknown> };
    };
    e.name = "FunctionsHttpError";
    e.context = { json: () => Promise.resolve(corpo) };
    return e;
}

describe("mensagemDoErroDaFuncao", () => {
    it("troca a frase fixa do supabase-js pelo motivo real do corpo", async () => {
        const erro = erroHttp({ success: false, message: "Nao ha template aprovado." });
        await expect(mensagemDoErroDaFuncao(erro, "reserva")).resolves.toBe(
            "Nao ha template aprovado.",
        );
    });

    it("aceita `error` quando a function nao mandou `message`", async () => {
        const erro = erroHttp({ success: false, error: "Instagram instance not found" });
        await expect(mensagemDoErroDaFuncao(erro, "reserva")).resolves.toBe(
            "Instagram instance not found",
        );
    });

    it("o tradutor vence o texto da function — TOKEN_EXPIRED vira pt-BR", async () => {
        const erro = erroHttp({
            success: false,
            error: "Token already expired. User must re-authenticate.",
            code: "TOKEN_EXPIRED",
        });
        const texto = await mensagemDoErroDaFuncao(erro, "reserva", (code) =>
            code === "TOKEN_EXPIRED" ? "Este token ja venceu." : undefined,
        );
        expect(texto).toBe("Este token ja venceu.");
    });

    it("tradutor que nao reconhece o codigo nao atrapalha", async () => {
        const erro = erroHttp({ message: "Outro motivo", code: 190 });
        const texto = await mensagemDoErroDaFuncao(erro, "reserva", (code) =>
            code === "TOKEN_EXPIRED" ? "nao deve aparecer" : undefined,
        );
        expect(texto).toBe("Outro motivo");
    });

    it("codigo numerico chega ao tradutor como string", async () => {
        const erro = erroHttp({ message: "Invalid OAuth access token", code: 190 });
        const texto = await mensagemDoErroDaFuncao(erro, "reserva", (code) =>
            code === "190" ? "Credencial recusada pela Meta." : undefined,
        );
        expect(texto).toBe("Credencial recusada pela Meta.");
    });

    it("NUNCA devolve a frase fixa do supabase-js — cai na reserva", async () => {
        const semCorpo = new Error("Edge Function returned a non-2xx status code");
        await expect(mensagemDoErroDaFuncao(semCorpo, "Nao foi possivel atualizar o token."))
            .resolves.toBe("Nao foi possivel atualizar o token.");
    });

    it("corpo que nao e JSON cai na reserva em vez de estourar", async () => {
        const erro = new Error("Edge Function returned a non-2xx status code") as Error & {
            context?: { json: () => Promise<unknown> };
        };
        erro.context = { json: () => Promise.reject(new SyntaxError("Unexpected token <")) };
        await expect(mensagemDoErroDaFuncao(erro, "reserva")).resolves.toBe("reserva");
        await expect(corpoDoErroDaFuncao(erro)).resolves.toBeNull();
    });

    it("erro de rede (sem context) preserva a mensagem propria", async () => {
        const rede = new Error("Failed to send a request to the Edge Function");
        await expect(mensagemDoErroDaFuncao(rede, "reserva")).resolves.toBe(
            "Failed to send a request to the Edge Function",
        );
    });
});
