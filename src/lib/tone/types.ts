export type ToneLevel = 1 | 2 | 3 | 4 | 5;
export type ToneTratamento = "voce" | "senhor";
export type ToneEmoji = "nunca" | "raro" | "natural";

/** Eixos de 1 a 5. A ordem aqui é a ordem em que os blocos entram na diretiva. */
export type ToneAxis =
    | "proximidade"
    | "formalidade"
    | "elaboracao"
    | "expressividade"
    | "assertividade"
    | "tecnicidade"
    | "comercial";

export interface ToneSettings {
    proximidade: ToneLevel;
    formalidade: ToneLevel;
    elaboracao: ToneLevel;
    expressividade: ToneLevel;
    assertividade: ToneLevel;
    tecnicidade: ToneLevel;
    comercial: ToneLevel;

    tratamento: ToneTratamento;
    emoji: ToneEmoji;

    /** Máx. 240 caracteres. Descreve a marca — nunca instrui a IA. */
    contexto_marca?: string;
}

/** Aviso de regra de combinação: o valor foi ajustado e o front precisa mostrar. */
export interface ToneAviso {
    campo: ToneAxis | "emoji";
    texto: string;
}

export const CONTEXTO_MARCA_MAX = 240;

/** Reproduz o comportamento atual da IA — é o que toda conta recebe na migração. */
export const DEFAULT_TONE_SETTINGS: ToneSettings = {
    proximidade: 3,
    formalidade: 3,
    elaboracao: 3,
    expressividade: 3,
    assertividade: 3,
    tecnicidade: 3,
    comercial: 3,
    tratamento: "voce",
    emoji: "raro",
};
