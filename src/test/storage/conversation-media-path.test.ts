import { describe, it, expect } from "vitest";
import { conversationMediaPath } from "@/lib/fileTypes";

// A RLS de storage.objects (migration 20260922200000) descobre o tenant pelo
// PRIMEIRO segmento do caminho. Anexo salvo na raiz do bucket `media` não
// pertence a ninguém: some da listagem e o upload é barrado. Era o caso do
// ConversationChatModal e do DealConversationModal (este último apontava para
// um bucket "chat-media" que nem existe).
const CONV = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("conversationMediaPath", () => {
    it("prefixa o caminho com o conversationId", () => {
        const path = conversationMediaPath(CONV, "exame.pdf");
        expect(path.startsWith(`${CONV}/`)).toBe(true);
        expect(path.split("/")).toHaveLength(2);
    });

    it("preserva a extensão do arquivo", () => {
        expect(conversationMediaPath(CONV, "exame.pdf").endsWith(".pdf")).toBe(true);
        expect(conversationMediaPath(CONV, "audio.ogg").endsWith(".ogg")).toBe(true);
    });

    it("remove acento, espaço e caractere especial do nome", () => {
        const path = conversationMediaPath(CONV, "Exame Sanguíneo (2ª via).pdf");
        const nome = path.split("/")[1];
        expect(nome).toMatch(/^\d+_[a-zA-Z0-9._-]+$/);
        expect(nome).toContain("Exame_Sanguineo");
    });

    it("não gera colisão entre dois envios do mesmo nome", () => {
        const a = conversationMediaPath(CONV, "foto.jpg");
        const b = conversationMediaPath(`${CONV}x`, "foto.jpg");
        expect(a).not.toBe(b);
    });

    it("recusa upload sem conversa (senão o arquivo iria para a raiz do bucket)", () => {
        expect(() => conversationMediaPath("", "foto.jpg")).toThrow();
    });
});
