import type { ToneLevel, ToneSettings, ToneTratamento } from "./types";

/**
 * Conversa de referência (Parte 8 da spec).
 *
 * As 60 frases são a biblioteca — não reformular sem rodar o teste T8.
 * Regras de toda frase: máx. 20 palavras, sem markdown, sem promessa de resultado,
 * sem preço e sem nome de profissional. {PROC} e {VOCE} são resolvidos pelos modificadores.
 */

export type Faixa = "baixa" | "media" | "alta";
/** Versão normal e curta. O trecho entre {{ }} fica na string — quem resolve é o M1. */
export interface Variantes {
    normal: string;
    curta: string;
}

type Levels<T> = Record<ToneLevel, Record<Faixa, T>>;

export const faixaDe = (v: number): Faixa => (v <= 2 ? "baixa" : v === 3 ? "media" : "alta");

/** SLOT A — abertura. Primário: proximidade. Secundário: expressividade. */
export const LIB_A: Levels<string> = {
    1: {
        baixa: "A clínica realiza {PROC} na testa.",
        media: "A clínica realiza {PROC} na testa. É um procedimento de rotina.",
        alta: "A clínica realiza {PROC} na testa. É um dos procedimentos mais procurados.",
    },
    2: {
        baixa: "{PROC} na testa é atendido aqui.",
        media: "Sim, {PROC} na testa é atendido aqui.",
        alta: "Sim! {PROC} na testa é um dos procedimentos que mais atendemos.",
    },
    3: {
        baixa: "{PROC} na testa a gente faz.",
        media: "{PROC} na testa a gente faz, sim.",
        alta: "{PROC} na testa a gente faz, sim! Boa escolha.",
    },
    4: {
        baixa: "Entendi. {PROC} na testa a gente faz.",
        media: "Entendi! {PROC} na testa a gente faz, sim.",
        alta: "Que bom que {VOCE} veio! {PROC} na testa a gente faz, sim.",
    },
    5: {
        baixa: "{PROC} na testa, entendi. A gente cuida disso junto.",
        media: "{PROC} na testa, entendi! A gente resolve isso junto.",
        alta: "Adorei! {PROC} na testa a gente faz, e eu já te ajudo com isso.",
    },
};

/** SLOT B — oferta da avaliação. Primário: assertividade. Secundário: formalidade. */
export const LIB_B: Levels<Variantes> = {
    1: {
        baixa: {
            normal:
                "Se quiser, dá pra começar pela avaliação, que é de graça{{ e define o que faz sentido}}. Tenho terça ou quinta, se alguma servir.",
            curta: "Se quiser, a avaliação é de graça. Terça ou quinta, se servir.",
        },
        media: {
            normal:
                "Se quiser, a gente começa pela avaliação, que é gratuita{{ e é onde a equipe define o que faz sentido}}. Tenho terça ou quinta, caso alguma sirva.",
            curta: "Se quiser, a avaliação é gratuita. Terça ou quinta, caso sirva.",
        },
        alta: {
            normal:
                "Caso deseje, podemos iniciar pela avaliação, que é gratuita{{ e na qual a equipe define o indicado}}. Há disponibilidade na terça ou na quinta.",
            curta: "Caso deseje, a avaliação é gratuita. Há vaga na terça ou na quinta.",
        },
    },
    2: {
        baixa: {
            normal:
                "Dá pra começar pela avaliação, que é de graça{{ e é onde a equipe vê o que faz sentido}}. Tenho terça ou quinta, qual é melhor?",
            curta: "A avaliação é de graça. Terça ou quinta?",
        },
        media: {
            normal:
                "A gente pode começar pela avaliação, que é gratuita{{ e é onde a equipe vê o que faz sentido}}. Tenho terça ou quinta, qual fica melhor?",
            curta: "A avaliação é gratuita. Terça ou quinta?",
        },
        alta: {
            normal:
                "Podemos iniciar pela avaliação, que é gratuita{{ e na qual a equipe define o mais indicado}}. Há vaga na terça ou na quinta; qual prefere?",
            curta: "A avaliação é gratuita. Terça ou quinta?",
        },
    },
    3: {
        baixa: {
            normal:
                "Primeiro a gente marca a avaliação, que é de graça{{ e é onde a equipe vê o que faz sentido}}. Tenho terça ou quinta, qual é melhor?",
            curta: "Primeiro a avaliação, de graça. Terça ou quinta?",
        },
        media: {
            normal:
                "Pra começar, a gente marca a avaliação, que é gratuita{{ e é onde a equipe vê o que faz sentido}}. Tenho terça ou quinta, qual fica melhor?",
            curta: "Pra começar, a avaliação, que é gratuita. Terça ou quinta?",
        },
        alta: {
            normal:
                "Para começar, agendamos a avaliação, que é gratuita{{ e na qual a equipe define o mais indicado}}. Há vaga na terça ou na quinta; qual prefere?",
            curta: "Para começar, a avaliação, gratuita. Terça ou quinta?",
        },
    },
    4: {
        baixa: {
            normal:
                "Vou marcar a avaliação pra {VOCE}, que é de graça{{ e é onde a equipe vê o seu caso}}. Terça ou quinta fica melhor?",
            curta: "Vou marcar a avaliação, de graça. Terça ou quinta?",
        },
        media: {
            normal:
                "Vou deixar sua avaliação marcada, ela é gratuita{{ e é onde a equipe vê o seu caso}}. Terça ou quinta fica melhor?",
            curta: "Vou marcar sua avaliação, gratuita. Terça ou quinta?",
        },
        alta: {
            normal:
                "Agendarei sua avaliação, que é gratuita{{ e na qual a equipe avalia o seu caso}}. Prefere terça ou quinta?",
            curta: "Agendarei sua avaliação, gratuita. Terça ou quinta?",
        },
    },
    5: {
        baixa: {
            normal:
                "Já separei a avaliação pra {VOCE}, que é de graça{{ e é onde a equipe vê o seu caso}}. Terça ou quinta?",
            curta: "Já separei a avaliação, de graça. Terça ou quinta?",
        },
        media: {
            normal:
                "Já deixei sua avaliação encaminhada, ela é gratuita{{ e é onde a equipe vê o seu caso}}. Terça ou quinta?",
            curta: "Já encaminhei sua avaliação, gratuita. Terça ou quinta?",
        },
        alta: {
            normal:
                "Sua avaliação já está encaminhada, sem custo{{ e nela a equipe avalia o seu caso}}. Terça ou quinta?",
            curta: "Sua avaliação está encaminhada, sem custo. Terça ou quinta?",
        },
    },
};

/** SLOT C — reação ao recuo. Primário: estilo comercial. Secundário: proximidade. */
export const LIB_C: Levels<Variantes> = {
    1: {
        baixa: {
            normal: "Certo. A clínica fica à disposição.",
            curta: "Certo. À disposição.",
        },
        media: {
            normal: "Claro, sem pressa. Quando quiser, é só me chamar.",
            curta: "Claro. Quando quiser, me chama.",
        },
        alta: {
            normal: "Claro, sem pressa nenhuma! Estou por aqui quando {VOCE} quiser.",
            curta: "Claro! Estou por aqui.",
        },
    },
    2: {
        baixa: {
            normal: "Certo. Se preferir, a avaliação pode ser agendada sem compromisso.",
            curta: "Certo. A avaliação é sem compromisso, se preferir.",
        },
        media: {
            normal:
                "Entendo. Se quiser, a avaliação é sem compromisso, só pra ter um direcionamento.",
            curta: "Entendo. A avaliação é sem compromisso, se quiser.",
        },
        alta: {
            normal:
                "Entendo, sem pressa! Se quiser, a avaliação é sem compromisso, só pra {VOCE} ter uma ideia.",
            curta: "Entendo! A avaliação é sem compromisso, se quiser.",
        },
    },
    3: {
        baixa: {
            normal:
                "Certo. Um esclarecimento: a avaliação não gera compromisso, e define o que faz sentido no seu caso.",
            curta: "Certo. A avaliação não gera compromisso e define o que faz sentido.",
        },
        media: {
            normal:
                "Entendo. Só pra ajudar: a avaliação não te compromete, e mostra o que faz sentido pra {VOCE}.",
            curta:
                "Entendo. A avaliação não te compromete, e mostra o que faz sentido pra {VOCE}.",
        },
        alta: {
            normal:
                "Entendo, e sem pressa! Só pra te ajudar: a avaliação não te compromete, e mostra o que faz sentido pra {VOCE}.",
            curta:
                "Entendo! A avaliação não te compromete, e mostra o que faz sentido pra {VOCE}.",
        },
    },
    4: {
        baixa: {
            normal: "Certo. Há algum ponto específico gerando dúvida?",
            curta: "Certo. Algum ponto específico em dúvida?",
        },
        media: {
            normal: "Claro. Posso te perguntar: tem algo específico que te deixou em dúvida?",
            curta: "Claro. Tem algo específico em dúvida?",
        },
        alta: {
            normal:
                "Claro, claro! Me conta: tem alguma coisa específica que ficou te deixando em dúvida?",
            curta: "Claro! Tem algo específico te deixando em dúvida?",
        },
    },
    5: {
        baixa: {
            normal: "Certo. Uma pergunta: adiar muda algo para {VOCE}?",
            curta: "Certo. Adiar muda algo para {VOCE}?",
        },
        media: {
            normal:
                "Claro. Me conta uma coisa: se {VOCE} deixar pra depois, muda alguma coisa pra {VOCE}?",
            curta: "Claro. Se deixar pra depois, muda algo pra {VOCE}?",
        },
        alta: {
            normal:
                "Claro! Só uma perguntinha: se {VOCE} adiar mais um pouco, isso muda alguma coisa pra {VOCE}?",
            curta: "Claro! Se adiar, muda alguma coisa pra {VOCE}?",
        },
    },
};

/** SLOT D — fechamento. Primário: expressividade. Secundário: proximidade. */
export const LIB_D: Levels<string> = {
    1: {
        baixa: "Certo.",
        media: "Certo. Até mais.",
        alta: "Certo. Fico por aqui.",
    },
    2: {
        baixa: "Certo. Qualquer dúvida, a clínica está disponível.",
        media: "Combinado. Qualquer coisa, é só chamar.",
        alta: "Combinado. Estou por aqui pra qualquer coisa.",
    },
    3: {
        baixa: "Combinado. A clínica fica à disposição.",
        media: "Combinado! Qualquer coisa, é só me chamar.",
        alta: "Combinado! Estou por aqui pra qualquer coisa que precisar.",
    },
    4: {
        baixa: "Ótimo. A clínica fica à disposição para quando desejar retomar.",
        media: "Ótimo! Quando quiser retomar, é só me chamar.",
        alta: "Ótimo! Quando quiser retomar, é só me chamar que eu resolvo com {VOCE}.",
    },
    5: {
        baixa: "Perfeito. A clínica aguarda seu contato.",
        media: "Perfeito! Te espero por aqui quando quiser.",
        alta: "Perfeito, maravilha! Te espero por aqui, viu? Foi um prazer!",
    },
};

// ─────────────────────────── modificadores ───────────────────────────
// Ordem: M1 elaboração → M4 léxico → M2 {PROC} → M3 {VOCE} → M5 emoji → wrap20.
// M4 age sobre o template, ANTES de qualquer token ser injetado: senão
// "pra {VOCE}" viraria "pra o senhor" em vez de "pro senhor".

/** M1 — remove as chaves mantendo o conteúdo (elaboração >= 4) ou corta o trecho. */
export function resolveOptional(text: string, keep: boolean): string {
    const out = keep ? text.replace(/\{\{(.*?)\}\}/g, "$1") : text.replace(/\{\{.*?\}\}/g, "");
    return normalizeSpacing(out);
}

/** M4 — dicionário léxico. Só as substituições listadas, todas com fronteira de palavra. */
const LEXICON: Record<ToneLevel, Array<[RegExp, string]>> = {
    1: [
        [/\bEstá\b/g, "Tá"],
        [/\bestá\b/g, "tá"],
        [/\bPara\b/g, "Pra"],
        [/\bpara\b/g, "pra"],
    ],
    2: [
        [/\bEstá\b/g, "Tá"],
        [/\bestá\b/g, "tá"],
        [/\bPara\b/g, "Pra"],
        [/\bpara\b/g, "pra"],
    ],
    3: [],
    4: [
        [/\bPra\b/g, "Para"],
        [/\bpra\b/g, "para"],
        [/\bTá\b/g, "Está"],
        [/\btá\b/g, "está"],
        [/\bme chama\b/g, "me chame"],
        [/\bperguntinha\b/g, "pergunta"],
        [/\s*viu\?/g, ""],
    ],
    5: [
        // Expressões longas primeiro: "me chama" casaria dentro de "me chamar".
        [/é só me chamar/g, "basta entrar em contato"],
        [/é só chamar/g, "basta entrar em contato"],
        [/Claro, claro!/g, "Certamente."],
        [/Adorei!/g, "Excelente."],
        [/,?\s*maravilha/g, ""],
        [/\bA gente\b/g, "A clínica"],
        [/\ba gente\b/g, "a clínica"],
        [/\bPra\b/g, "Para"],
        [/\bpra\b/g, "para"],
        [/\bTá\b/g, "Está"],
        [/\btá\b/g, "está"],
        [/\bme chama\b/g, "me chame"],
        [/\bperguntinha\b/g, "pergunta"],
        [/\s*viu\?/g, ""],
        [/\bte /g, "lhe "],
    ],
};

/** Termos que o dicionário M4 nunca pode tocar (teste T8). */
export const M4_TERMOS_INTOCAVEIS = [
    "botox",
    "toxina botulínica",
    "senhor",
    "senhora",
    "você",
];

export function applyLexicon(text: string, formalidade: ToneLevel): string {
    let out = text;
    for (const [re, to] of LEXICON[formalidade]) out = out.replace(re, to);
    return normalizeSpacing(out);
}

/** M2 — {PROC}. Capitaliza quando o token inicia a frase. */
export function replaceProc(text: string, proc: string): string {
    return text.replace(/\{PROC\}/g, (_m, offset: number) => {
        const before = text.slice(0, offset).trimEnd();
        const startsSentence = before.length === 0 || /[.!?]$/.test(before);
        return startsSentence ? proc.charAt(0).toUpperCase() + proc.slice(1) : proc;
    });
}

/**
 * M3 — {VOCE}. No inject vai a forma dupla ("o senhor/a senhora") e a IA concorda
 * pelo nome real; no preview do front resolve pelo nome de exemplo (Bruno).
 */
export function replaceVoce(
    text: string,
    tratamento: ToneTratamento,
    modo: "inject" | "preview" = "inject",
): string {
    if (tratamento === "voce") {
        return text
            .replace(/\bpra \{VOCE\}/g, "pra você")
            .replace(/\bpara \{VOCE\}/g, "para você")
            .replace(/\{VOCE\}/g, "você");
    }
    const contracao = modo === "inject" ? "pro senhor/pra senhora" : "pro senhor";
    const comArtigo = modo === "inject" ? "o senhor/a senhora" : "o senhor";
    return text
        .replace(/\bpra \{VOCE\}/g, contracao)
        .replace(/\bpara \{VOCE\}/g, `para ${comArtigo}`)
        .replace(/\{VOCE\}/g, comArtigo);
}

function normalizeSpacing(text: string): string {
    return text
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,;!?])/g, "$1")
        .trim();
}

const contaPalavras = (linha: string): number =>
    linha.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

/**
 * Quebra em linhas de no máximo 20 palavras. Roda POR ÚLTIMO, sempre depois de
 * todas as substituições — nunca sobre texto com {PROC} ou {VOCE} presentes.
 * Quebra preferencialmente em fim de frase; frase acima de 20 palavras quebra na
 * vírgula mais próxima do meio (ou no espaço, se não houver vírgula).
 * Emoji e pontuação não contam como palavra, e nunca ficam sozinhos numa linha.
 */
export function wrap20(text: string, indent = "    "): string {
    const frases = text.match(/[^.!?]+[.!?]*\s*/g)?.map((f) => f.trim()).filter(Boolean) ?? [text];

    const blocos: string[] = [];
    for (const frase of frases) {
        for (const parte of quebraFrase(frase)) {
            // Emoji ou pontuação solta gruda no bloco anterior.
            if (blocos.length && contaPalavras(parte) === 0) blocos[blocos.length - 1] += ` ${parte}`;
            else blocos.push(parte);
        }
    }

    const linhas: string[] = [];
    for (const bloco of blocos) {
        const atual = linhas[linhas.length - 1];
        if (atual && contaPalavras(`${atual} ${bloco}`) <= 20) linhas[linhas.length - 1] = `${atual} ${bloco}`;
        else linhas.push(bloco);
    }
    return linhas.join("\n" + indent);
}

function quebraFrase(frase: string): string[] {
    if (contaPalavras(frase) <= 20) return [frase];
    const meio = Math.floor(frase.length / 2);
    const candidatos: number[] = [];
    for (let i = 0; i < frase.length; i++) {
        if (frase[i] === ",") candidatos.push(i + 1);
    }
    const pontos = candidatos.length
        ? candidatos
        : frase.split("").reduce<number[]>((acc, ch, i) => (ch === " " ? [...acc, i] : acc), []);
    if (!pontos.length) return [frase];
    const corte = pontos.reduce((a, b) => (Math.abs(b - meio) < Math.abs(a - meio) ? b : a));
    const esquerda = frase.slice(0, corte).trim();
    const direita = frase.slice(corte).trim();
    if (!esquerda || !direita) return [frase];
    return [...quebraFrase(esquerda), ...quebraFrase(direita)];
}

/** Monta a conversa de referência. Função pura — a mesma roda no front e no save. */
export function buildReferenceConversation(
    s: ToneSettings,
    modo: "inject" | "preview" = "inject",
): string {
    let A = LIB_A[s.proximidade][faixaDe(s.expressividade)];
    let B = LIB_B[s.assertividade][faixaDe(s.formalidade)];
    let C = LIB_C[s.comercial][faixaDe(s.proximidade)];
    let D = LIB_D[s.expressividade][faixaDe(s.proximidade)];

    // M1 — elaboração
    const keep = s.elaboracao >= 4;
    let Bt = resolveOptional(s.elaboracao <= 2 ? B.curta : B.normal, keep);
    let Ct = resolveOptional(s.elaboracao <= 2 ? C.curta : C.normal, keep);

    // M4 — léxico. O slot B já é escrito na formalidade certa e não recebe.
    A = applyLexicon(A, s.formalidade);
    Ct = applyLexicon(Ct, s.formalidade);
    D = applyLexicon(D, s.formalidade);

    // M2 — tecnicidade
    const proc = s.tecnicidade >= 4 ? "toxina botulínica" : "botox";
    [A, Bt, Ct, D] = [A, Bt, Ct, D].map((t) => replaceProc(t, proc)) as [
        string,
        string,
        string,
        string,
    ];

    // M3 — tratamento
    [A, Bt, Ct, D] = [A, Bt, Ct, D].map((t) => replaceVoce(t, s.tratamento, modo)) as [
        string,
        string,
        string,
        string,
    ];

    // M5 — emoji
    if (s.emoji !== "nunca") {
        if (s.expressividade >= 3 || s.emoji === "natural") D += " \u{1F60A}";
        if (s.emoji === "natural" && s.expressividade >= 4) A += " \u{1F60A}";
    }

    return [
        "C: oi, queria fazer botox na testa",
        "IA: " + wrap20(`${A} ${Bt}`),
        "C: ah, vou pensar e te falo",
        "IA: " + wrap20(Ct),
        "C: tá bom então",
        "IA: " + wrap20(D),
    ].join("\n");
}
