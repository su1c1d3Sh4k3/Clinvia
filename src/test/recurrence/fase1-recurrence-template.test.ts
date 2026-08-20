import { describe, it, expect } from "vitest";
import {
    RECURRENCE_VARIABLES,
    RECURRENCE_VARIABLE_KEYS,
    extractRecurrenceVariables,
    findUnknownRecurrenceVariables,
    renderRecurrencePreview,
    insertRecurrenceVariable,
} from "@/lib/recurrenceTemplate";

describe("Fase 1 — catálogo de variáveis", () => {
    it("contém as 6 variáveis definidas pelo usuário (R4 + R17)", () => {
        expect(RECURRENCE_VARIABLE_KEYS).toEqual([
            "nome_cliente",
            "nome_clinica",
            "servico",
            "aplicacao",
            "preco",
            "profissional",
        ]);
    });

    it("toda variável tem label e exemplo não vazios", () => {
        for (const v of RECURRENCE_VARIABLES) {
            expect(v.label.length).toBeGreaterThan(0);
            expect(v.example.length).toBeGreaterThan(0);
        }
    });
});

describe("Fase 1 — extração de variáveis", () => {
    it("extrai na ordem, com repetição e espaços tolerados", () => {
        const text = "Oi {{nome_cliente}}, seu {{servico}} na {{ nome_clinica }} — {{servico}}!";
        expect(extractRecurrenceVariables(text)).toEqual([
            "nome_cliente",
            "servico",
            "nome_clinica",
            "servico",
        ]);
    });

    it("texto sem variáveis retorna vazio", () => {
        expect(extractRecurrenceVariables("Olá, tudo bem?")).toEqual([]);
        expect(extractRecurrenceVariables("")).toEqual([]);
    });

    it("chaves malformadas não são extraídas", () => {
        expect(extractRecurrenceVariables("{{nome cliente}} {nome_cliente} {{}}")).toEqual([]);
    });
});

describe("Fase 1 — validação de variáveis desconhecidas", () => {
    it("aceita todas as variáveis do catálogo", () => {
        const text = RECURRENCE_VARIABLE_KEYS.map((k) => `{{${k}}}`).join(" ");
        expect(findUnknownRecurrenceVariables(text)).toEqual([]);
    });

    it("aponta variável fora do catálogo (sem duplicar)", () => {
        const text = "Oi {{nome_cliente}}, use {{cupom}} e {{cupom}} até {{validade}}";
        expect(findUnknownRecurrenceVariables(text)).toEqual(["cupom", "validade"]);
    });
});

describe("Fase 1 — preview", () => {
    it("substitui pelas amostras padrão", () => {
        const out = renderRecurrencePreview("Oi {{nome_cliente}}! {{servico}} com {{profissional}}.");
        expect(out).toBe("Oi Maria! Botox com Dra. Ana.");
    });

    it("aceita valores customizados", () => {
        const out = renderRecurrencePreview("{{preco}} na {{nome_clinica}}", {
            preco: "R$ 500,00",
            nome_clinica: "PELE",
        });
        expect(out).toBe("R$ 500,00 na PELE");
    });

    it("mantém intacta variável desconhecida", () => {
        expect(renderRecurrencePreview("Use {{cupom}}")).toBe("Use {{cupom}}");
    });
});

describe("Fase 1 — inserção no cursor", () => {
    it("insere o token na posição do cursor e devolve novo cursor", () => {
        const r = insertRecurrenceVariable("Olá !", 4, "nome_cliente");
        expect(r.text).toBe("Olá {{nome_cliente}}!");
        expect(r.cursor).toBe(4 + "{{nome_cliente}}".length);
    });

    it("cursor fora dos limites é normalizado", () => {
        expect(insertRecurrenceVariable("abc", 99, "servico").text).toBe("abc{{servico}}");
        expect(insertRecurrenceVariable("abc", -5, "servico").text).toBe("{{servico}}abc");
    });

    it("texto vazio", () => {
        expect(insertRecurrenceVariable("", 0, "preco").text).toBe("{{preco}}");
    });
});
