/**
 * Filtro do campo "Sobre a marca" (Parte 4.2).
 * É a única entrada de texto livre — e a única porta por onde alguém pode tentar
 * dar ordem à IA. Radical solto dá falso positivo ("resultado natural", "precisa
 * de avaliação"), então são duas listas de EXPRESSÕES com efeitos diferentes.
 */

/** Bloqueia o save: instrução dirigida à IA. */
export const CONTEXTO_LISTA_BLOQUEIO = [
    "sempre diga",
    "sempre fale",
    "nunca diga",
    "nunca fale",
    "nunca aceite",
    "você deve",
    "a ia deve",
    "a assistente deve",
    "o sistema deve",
    "insista",
    "não desista",
    "continue insistindo",
    "tente de novo",
    "ignore",
    "esqueça",
    "desconsidere",
    "finja",
    "diga que",
    "fale que",
    "afirme que",
    "responda que",
    "prioridade máxima",
    "prioridade sobre",
    "acima do prompt",
    "ignore o prompt",
    "temos vaga hoje",
    "só hoje",
    "última vaga",
    "últimas vagas",
    "vaga limitada",
    "garantimos o resultado",
    "resultado garantido",
    "sem risco",
];

/** Só avisa: pode ser legítimo, mas merece atenção. Casa por prefixo. */
export const CONTEXTO_LISTA_AVISO = [
    "garant",
    "desconto",
    "promoção",
    "grátis",
    "gratuito",
    "resultado",
    "melhor da região",
    "o melhor",
];

export const CONTEXTO_MSG_BLOQUEIO =
    "Este campo descreve a clínica. Para ajustar o comportamento da IA, use os controles acima.";

export const CONTEXTO_MSG_AVISO =
    "Atenção: este campo é só descrição. A IA não vai prometer nem oferecer nada com base nele.";

/** Remove quebras de linha, aspas duplas, chaves e sinais de menor/maior. */
export function sanitizeContexto(text: string): string {
    return text
        .replace(/[\r\n]+/g, " ")
        .replace(/["{}<>]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

const semAcento = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function casa(texto: string, expressao: string, prefixo: boolean): boolean {
    const fim = prefixo ? "" : "\\b";
    return new RegExp(`\\b${escapeRe(semAcento(expressao))}${fim}`).test(texto);
}

export interface ContextoCheck {
    bloqueado: boolean;
    termoBloqueado?: string;
    termoAviso?: string;
    mensagem?: string;
}

export function checkContextoMarca(raw: string | undefined | null): ContextoCheck {
    const texto = semAcento(sanitizeContexto(raw || ""));
    if (!texto) return { bloqueado: false };

    const bloqueio = CONTEXTO_LISTA_BLOQUEIO.find((e) => casa(texto, e, false));
    if (bloqueio) {
        return { bloqueado: true, termoBloqueado: bloqueio, mensagem: CONTEXTO_MSG_BLOQUEIO };
    }

    const aviso = CONTEXTO_LISTA_AVISO.find((e) => casa(texto, e, true));
    if (aviso) return { bloqueado: false, termoAviso: aviso, mensagem: CONTEXTO_MSG_AVISO };

    return { bloqueado: false };
}
