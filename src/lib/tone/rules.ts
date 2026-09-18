import type { ToneAviso, ToneSettings } from "./types";

/**
 * Regras de combinação (Parte 7). Função pura, compartilhada entre front e back:
 * o front roda a cada movimento de slider — por isso R1 e R8, que ALTERAM valores,
 * aparecem na tela antes do save. O save roda de novo como defesa.
 */
export interface ToneRulesResult {
    settings: ToneSettings;
    extras: string[];
    avisos: ToneAviso[];
}

export function applyCombinationRules(input: ToneSettings): ToneRulesResult {
    const s: ToneSettings = { ...input };
    const extras: string[] = [];
    const avisos: ToneAviso[] = [];

    // R1 — emoji frequente não combina com linguagem formal.
    if (s.formalidade >= 4 && s.emoji === "natural") {
        s.emoji = "raro";
        avisos.push({
            campo: "emoji",
            texto:
                "Emojis frequentes não combinam com linguagem formal. Ajustamos para uso mínimo.",
        });
    }

    // R2
    if (s.formalidade === 5 && s.expressividade >= 4) {
        extras.push(
            "Demonstre entusiasmo pela escolha das palavras, não por pontuação. Máximo uma exclamação por mensagem.",
        );
    }

    // R3
    if (s.formalidade <= 2 && s.tratamento === "senhor") {
        extras.push(
            "Apesar do tom informal, mantenha senhor/senhora em todas as frases.",
        );
    }

    // R4
    if (s.elaboracao === 1 && s.proximidade >= 4) {
        extras.push(
            "Breve, mas nunca seco: uma palavra de acolhimento cabe em qualquer frase curta.",
        );
    }

    // R5
    if (s.assertividade === 5 && s.proximidade <= 2) {
        extras.push("Conduza sem pressionar: você avança o processo, não o cliente.");
    }

    // R6
    if (s.comercial >= 4 && s.assertividade <= 2) {
        extras.push("Sonde e argumente com suavidade: pergunta genuína, nunca cobrança.");
    }

    // R7
    if (s.comercial === 5 && s.proximidade === 1) {
        extras.push(
            "Mesmo distante, a sondagem tem que soar como interesse real, não interrogatório.",
        );
    }

    // R8 — abordagem consultiva não combina com condução muito diretiva.
    if (s.comercial <= 2 && s.assertividade === 5) {
        s.assertividade = 4;
        avisos.push({
            campo: "assertividade",
            texto:
                "Abordagem consultiva não combina com condução muito diretiva. Suavizamos um ponto.",
        });
    }

    return { settings: s, extras, avisos };
}
