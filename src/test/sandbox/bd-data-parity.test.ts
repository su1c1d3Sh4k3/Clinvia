import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O fluxo do n8n é o MESMO para produção e sandbox: se o bd_data de um ganhar
 * uma chave que o outro não tem, a IA passa a se comportar diferente no teste.
 * Este teste lê os dois arquivos e compara a lista de chaves de topo.
 */

const raiz = resolve(__dirname, "../../../supabase/functions");

function lerBloco(arquivo: string, marcador: string): string {
    const texto = readFileSync(resolve(raiz, arquivo), "utf8");
    const inicio = texto.indexOf(marcador);
    expect(inicio, `marcador "${marcador}" não encontrado em ${arquivo}`).toBeGreaterThan(-1);

    // Fecha no primeiro ponto em que as chaves voltam ao nível do bloco.
    let profundidade = 0;
    let i = texto.indexOf("{", inicio);
    const abertura = i;
    for (; i < texto.length; i++) {
        if (texto[i] === "{") profundidade++;
        else if (texto[i] === "}") {
            profundidade--;
            if (profundidade === 0) return texto.slice(abertura, i + 1);
        }
    }
    throw new Error(`bloco "${marcador}" não fecha em ${arquivo}`);
}

/** Chaves no primeiro nível do objeto (ignora tudo que está aninhado). */
function chavesDeTopo(bloco: string): string[] {
    const chaves: string[] = [];
    let profundidade = 0;
    for (const linha of bloco.split("\n")) {
        const m = profundidade === 1 ? linha.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i) : null;
        if (m) chaves.push(m[1]);
        for (const ch of linha) {
            if (ch === "{" || ch === "[" || ch === "(") profundidade++;
            else if (ch === "}" || ch === "]" || ch === ")") profundidade--;
        }
    }
    return chaves.sort();
}

describe("bd_data — paridade produção x sandbox", () => {
    it("os dois payloads têm exatamente as mesmas chaves de topo", () => {
        const producao = chavesDeTopo(
            lerBloco("webhook-handle-message/index.ts", "bd_data: {"),
        );
        const sandbox = chavesDeTopo(
            lerBloco("_shared/sandbox-payload.ts", "    return {\n        user_id: userId,"),
        );

        // `sandbox: true` só existe no ambiente de teste — é o que o n8n usa
        // para saber que deve chamar as tools -sandbox.
        expect(sandbox).toContain("sandbox");
        expect(sandbox.filter((k) => k !== "sandbox")).toEqual(producao);
    });

    it("o bloco de campanha marca recorrência nos dois lados", () => {
        for (const arquivo of ["webhook-handle-message/index.ts", "_shared/sandbox-payload.ts"]) {
            const texto = readFileSync(resolve(raiz, arquivo), "utf8");
            expect(texto, arquivo).toContain("is_recurrence: isRecurrenceCamp");
            expect(texto, arquivo).toContain("recurrence_msg_number: isRecurrenceCamp ? recMsg : null");
        }
    });
});
