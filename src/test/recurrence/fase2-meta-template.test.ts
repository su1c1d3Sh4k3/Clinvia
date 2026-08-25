import { describe, it, expect } from "vitest";
import {
    RECURRENCE_META_VAR_KEYS,
    RECURRENCE_META_EXAMPLES,
    convertRecurrenceMessageToMeta,
    buildRecurrenceTemplateName,
    buildDefaultRecurrenceTemplateName,
    parseRecurrenceTemplateVersion,
    deriveRecurrenceBadge,
} from "../../../supabase/functions/_shared/recurrence-meta-template";
import { RECURRENCE_VARIABLES } from "@/lib/recurrenceTemplate";

const UUID = "a1b2c3d4-e5f6-7890-abcd-ef0123456789";

describe("Fase 2 — catálogo espelhado", () => {
    it("mantém as mesmas variáveis do editor (src/lib/recurrenceTemplate)", () => {
        expect([...RECURRENCE_META_VAR_KEYS]).toEqual(RECURRENCE_VARIABLES.map((v) => v.key));
    });

    it("tem exemplo para toda variável do catálogo", () => {
        for (const key of RECURRENCE_META_VAR_KEYS) {
            expect(RECURRENCE_META_EXAMPLES[key]).toBeTruthy();
        }
    });
});

describe("Fase 2 — convertRecurrenceMessageToMeta (named vars → {{n}})", () => {
    it("converte as 6 variáveis na ordem de aparição", () => {
        const text =
            "Oi {{nome_cliente}}! Seu {{servico}} ({{aplicacao}}) com {{profissional}} na {{nome_clinica}} por {{preco}}.";
        const result = convertRecurrenceMessageToMeta(text);
        expect(result.body).toBe(
            "Oi {{1}}! Seu {{2}} ({{3}}) com {{4}} na {{5}} por {{6}}.",
        );
        expect(result.variableMap).toEqual([
            "nome_cliente", "servico", "aplicacao", "profissional", "nome_clinica", "preco",
        ]);
        expect(result.exampleValues).toEqual([
            "Maria", "Botox", "Botox Full Face", "Dra. Ana", "Clínica Exemplo", "R$ 1.200,00",
        ]);
    });

    it("variável repetida reusa o mesmo número (variable_map sem duplicata)", () => {
        const result = convertRecurrenceMessageToMeta(
            "{{nome_cliente}}, volta {{nome_cliente}}? Seu {{servico}} espera.",
        );
        expect(result.body).toBe("{{1}}, volta {{1}}? Seu {{2}} espera.");
        expect(result.variableMap).toEqual(["nome_cliente", "servico"]);
    });

    it("texto sem variáveis → variableMap vazio e corpo intacto", () => {
        const result = convertRecurrenceMessageToMeta("Olá! Está na hora de renovar.");
        expect(result.body).toBe("Olá! Está na hora de renovar.");
        expect(result.variableMap).toEqual([]);
        expect(result.exampleValues).toEqual([]);
    });

    it("aceita espaços dentro das chaves ({{ nome_cliente }})", () => {
        const result = convertRecurrenceMessageToMeta("Oi {{ nome_cliente }}!");
        expect(result.body).toBe("Oi {{1}}!");
        expect(result.variableMap).toEqual(["nome_cliente"]);
    });

    it("variável fora do catálogo ainda converte (validação é do editor) com exemplo genérico", () => {
        const result = convertRecurrenceMessageToMeta("Use {{cupom}}!");
        expect(result.body).toBe("Use {{1}}!");
        expect(result.variableMap).toEqual(["cupom"]);
        expect(result.exampleValues).toEqual(["exemplo"]);
    });
});

describe("Fase 2 — buildRecurrenceTemplateName / parseRecurrenceTemplateVersion", () => {
    it("gera rec_<id8>_msg<N>_v<K> a partir do uuid", () => {
        expect(buildRecurrenceTemplateName(UUID, 2, 3)).toBe("rec_a1b2c3d4_msg2_v3");
    });

    it("nome sempre passa na regex da Meta (^[a-z0-9_]+$)", () => {
        for (const msg of [1, 2, 3]) {
            for (const v of [1, 5, 42]) {
                expect(buildRecurrenceTemplateName(UUID, msg, v)).toMatch(/^[a-z0-9_]+$/);
            }
        }
    });

    it("normaliza uuid com letras maiúsculas", () => {
        expect(buildRecurrenceTemplateName(UUID.toUpperCase(), 1, 1)).toBe("rec_a1b2c3d4_msg1_v1");
    });

    it("parse extrai a versão e faz roundtrip com build", () => {
        const name = buildRecurrenceTemplateName(UUID, 3, 7);
        expect(parseRecurrenceTemplateVersion(name)).toBe(7);
    });

    it("template padrão da conta: rec_default_msg<N>_v<K>", () => {
        expect(buildDefaultRecurrenceTemplateName(2, 3)).toBe("rec_default_msg2_v3");
        expect(parseRecurrenceTemplateVersion("rec_default_msg2_v3")).toBe(3);
    });

    it("parse retorna null para nomes fora do padrão", () => {
        expect(parseRecurrenceTemplateVersion("sys_confirm_24h_v1")).toBeNull();
        expect(parseRecurrenceTemplateVersion("rec_a1b2c3d4_msg4_v1")).toBeNull();
        expect(parseRecurrenceTemplateVersion("rec_a1b2c3d4_msg1")).toBeNull();
        expect(parseRecurrenceTemplateVersion("")).toBeNull();
    });

    it("versão incrementa a partir do nome existente (fluxo de resubmissão)", () => {
        const existing = buildRecurrenceTemplateName(UUID, 1, 2);
        const next = (parseRecurrenceTemplateVersion(existing) ?? 0) + 1;
        expect(buildRecurrenceTemplateName(UUID, 1, next)).toBe("rec_a1b2c3d4_msg1_v3");
    });
});

describe("Fase 2 — deriveRecurrenceBadge (pior status entre templates 1-3)", () => {
    it("sem templates → null (badge oculto)", () => {
        expect(deriveRecurrenceBadge([])).toBeNull();
        expect(deriveRecurrenceBadge([null, undefined])).toBeNull();
    });

    it("todos APPROVED → approved", () => {
        expect(deriveRecurrenceBadge(["APPROVED", "APPROVED", "APPROVED"])).toBe("approved");
        expect(deriveRecurrenceBadge(["approved"])).toBe("approved");
    });

    it("qualquer REJECTED/DISABLED domina → rejected", () => {
        expect(deriveRecurrenceBadge(["APPROVED", "REJECTED", "PENDING"])).toBe("rejected");
        expect(deriveRecurrenceBadge(["APPROVED", "DISABLED"])).toBe("rejected");
    });

    it("mix sem rejeição → pending", () => {
        expect(deriveRecurrenceBadge(["APPROVED", "PENDING"])).toBe("pending");
        expect(deriveRecurrenceBadge(["PENDING"])).toBe("pending");
        expect(deriveRecurrenceBadge(["PAUSED", "APPROVED"])).toBe("pending");
    });
});
