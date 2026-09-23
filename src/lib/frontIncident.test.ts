// O que este arquivo protege é a regra 2 do frontIncident: NUNCA mandar dado
// pessoal. Isso sai do navegador de um usuário real, e a URL deste produto
// carrega nome e telefone de paciente com frequência — `/agendar?d=<base64>`
// é o caso mais direto.
//
// Uma regressão em `rotaSegura` não quebra tela nenhuma e não aparece em
// nenhum teste de UI: o app continua funcionando e o vazamento acontece em
// silêncio, no painel. Por isso o mascaramento é testado por fora.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rotaSegura, reportarErroDoFront } from "@/lib/frontIncident";

describe("rotaSegura", () => {
    it("descarta a query string inteira", () => {
        // O base64 aqui decodifica para um nome de paciente. Se um dia algum
        // parâmetro passar a ser considerado "seguro", este teste tem de ser
        // reescrito de propósito, não por acidente.
        expect(rotaSegura("https://app.clinbia.ai/agendar?d=eyJjb250YWN0X25hbWUiOiJNYXJpYSJ9"))
            .toBe("/agendar");
    });

    it("mascara uuid na rota", () => {
        expect(rotaSegura("/crm/8f2c1a4e-3b7d-4f5a-9c1e-2d6b8a0f3e7c")).toBe("/crm/:id");
    });

    it("mascara sequência longa de dígitos (telefone, id numérico)", () => {
        expect(rotaSegura("/contatos/5511987654321")).toBe("/contatos/:num");
    });

    it("preserva a forma do caminho, que é o que agrupa o incidente", () => {
        expect(rotaSegura("/scheduling")).toBe("/scheduling");
    });

    it("hash não vaza: o pathname é o único pedaço que atravessa", () => {
        expect(rotaSegura("/crm#paciente-joao-silva")).toBe("/crm");
    });
});

describe("reportarErroDoFront", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("não reporta o ruído que o app já ignorava de propósito", () => {
        // removeChild vem de extensão de navegador mexendo no DOM; chunk vem de
        // deploy novo, e a página se recarrega sozinha. Os dois já eram
        // engolidos no ErrorBoundary muito antes deste monitoramento existir.
        reportarErroDoFront({ tipo: "render", erro: new Error("Failed to execute 'removeChild' on 'Node'") });
        reportarErroDoFront({ tipo: "promise", erro: new Error("Failed to fetch dynamically imported module") });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("um erro que o monitoramento não pode derrubar: fetch rejeitado não propaga", async () => {
        // Regra 1: um monitor que derruba a tela que ele deveria vigiar é pior
        // que monitor nenhum.
        vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
        expect(() =>
            reportarErroDoFront({ tipo: "global", erro: new Error("erro unico para este caso " + Date.now()) })
        ).not.toThrow();
    });
});
