import { describe, it, expect } from "vitest";
import { stripSenderSignature } from "./FormattedText";

describe("stripSenderSignature", () => {
    it("remove a assinatura quando o negrito é o remetente", () => {
        expect(stripSenderSignature("*Maria:*\nBom dia!", "Maria")).toBe("Bom dia!");
    });

    it("ignora diferença de caixa e espaços", () => {
        expect(stripSenderSignature("*ADRIELLY CAMILLA:*\noi", "Adrielly Camilla ")).toBe("oi");
    });

    it("preserva título em negrito escrito pelo atendente", () => {
        const body = "*Convênio:*\nAtendemos Unimed e Bradesco.";
        expect(stripSenderSignature(body, "Maria")).toBe(body);
    });

    it("preserva o corpo quando a mensagem não tem remetente", () => {
        const body = "*Horário:*\nSeg a sex, 8h às 18h.";
        expect(stripSenderSignature(body, null)).toBe(body);
    });

    it("não mexe em mensagem sem prefixo", () => {
        expect(stripSenderSignature("convênio particular", "Maria")).toBe("convênio particular");
    });
});
