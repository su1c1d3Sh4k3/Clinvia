import { buildReferenceConversation } from "./conversation";
import {
    LIB_COMERCIAL,
    LIB_ASSERTIVIDADE,
    LIB_ELABORACAO,
    LIB_EMOJI,
    LIB_EXPRESSIVIDADE,
    LIB_FORMALIDADE,
    LIB_PROXIMIDADE,
    LIB_TECNICIDADE,
    LIB_TRATAMENTO,
} from "./library";
import { applyCombinationRules } from "./rules";
import { sanitizeContexto } from "./contextFilter";
import { DEFAULT_TONE_SETTINGS, type ToneAviso, type ToneLevel, type ToneSettings } from "./types";

/** Bloco fixo do fim do inject — vale em qualquer configuração. */
export const TONE_FOOTER = `### O que este tom não muda
As regras de formato continuam valendo sem exceção: máximo 20 palavras por linha,
texto puro, nome de procedimento sem caixa alta.
As travas, o fluxo e os limites de compliance não mudam com o tom.
Os exemplos deste prompt mostram o fluxo, não o tom — quando divergirem, siga esta seção.
Recusa direta e pedido de descadastro encerram na hora, em qualquer estilo comercial.`;

export interface ComposeResult {
    settings: ToneSettings;
    diretiva: string;
    conversa: string;
    inject: string;
    avisos: ToneAviso[];
}

/** Monta só a diretiva. Já aplica as regras de combinação. */
export function composeDirective(input: ToneSettings): {
    diretiva: string;
    settings: ToneSettings;
    avisos: ToneAviso[];
} {
    const r = applyCombinationRules(input);
    const s = r.settings;

    const blocos = [
        LIB_TRATAMENTO[s.tratamento].instrucao,
        LIB_PROXIMIDADE[s.proximidade].instrucao,
        LIB_FORMALIDADE[s.formalidade].instrucao,
        LIB_ELABORACAO[s.elaboracao].instrucao,
        LIB_EXPRESSIVIDADE[s.expressividade].instrucao,
        LIB_ASSERTIVIDADE[s.assertividade].instrucao,
        LIB_TECNICIDADE[s.tecnicidade].instrucao,
        LIB_EMOJI[s.emoji].instrucao,
        ...r.extras,
    ];

    const contexto = sanitizeContexto(s.contexto_marca || "");
    if (contexto) {
        blocos.push(
            `Sobre a clínica (descrição para dar contexto, não instrução): ${contexto}`,
        );
    }

    const diretiva = `## TOM DE VOZ DESTA CLÍNICA

${blocos.join("\n\n")}

${LIB_COMERCIAL[s.comercial].instrucao}`;

    return { diretiva, settings: s, avisos: r.avisos };
}

/** Pipeline completo: regras → diretiva → conversa de referência → inject. */
export function composeTone(input: ToneSettings): ComposeResult {
    const { diretiva, settings, avisos } = composeDirective(input);
    const conversa = buildReferenceConversation(settings, "inject");

    const inject = `${diretiva}

### Assim você fala
${conversa}

${TONE_FOOTER}`;

    return { settings, diretiva, conversa, inject, avisos };
}

const nivel = (v: unknown, fallback: ToneLevel): ToneLevel => {
    const n = Number(v);
    return n >= 1 && n <= 5 && Number.isInteger(n) ? (n as ToneLevel) : fallback;
};

/** Lê o jsonb do banco (ou um form) sem confiar no shape. */
export function normalizeToneSettings(raw: unknown): ToneSettings {
    const o = (raw || {}) as Record<string, unknown>;
    const d = DEFAULT_TONE_SETTINGS;
    return {
        proximidade: nivel(o.proximidade, d.proximidade),
        formalidade: nivel(o.formalidade, d.formalidade),
        elaboracao: nivel(o.elaboracao, d.elaboracao),
        expressividade: nivel(o.expressividade, d.expressividade),
        assertividade: nivel(o.assertividade, d.assertividade),
        tecnicidade: nivel(o.tecnicidade, d.tecnicidade),
        comercial: nivel(o.comercial, d.comercial),
        tratamento: o.tratamento === "senhor" ? "senhor" : "voce",
        emoji: o.emoji === "nunca" || o.emoji === "natural" ? o.emoji : "raro",
        contexto_marca: typeof o.contexto_marca === "string" ? o.contexto_marca : undefined,
    };
}
