// Normalização de notas NPS.
// contacts.nps é um array JSONB cujo campo "nota" pode ser:
//   - string numérica: "5".."1" (fluxo feedback_24h — add_nps_entry recebe TEXT)
//   - número: 5..1 (entradas antigas, antes da migração para TEXT)
//   - texto: "Excelente", "Muito Bom", "Bom", "Regular", "Ruim" (fluxo legado nps_*)
// Mesmo mapeamento texto→número da RPC get_attendance_metrics_for_owner.

const TEXT_TO_NUMBER: Record<string, number> = {
    "excelente": 5,
    "excellent": 5,
    "muito bom": 4,
    "very good": 4,
    "bom": 3,
    "good": 3,
    "regular": 2,
    "precisa melhorar": 2,
    "ruim": 1,
    "insatisfeito": 1,
    "pessimo": 1,
    "péssimo": 1,
    "bad": 1,
};

export function npsNotaToNumber(nota: unknown): number {
    if (typeof nota === "number") return nota;
    const s = String(nota ?? "").trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    return TEXT_TO_NUMBER[s.toLowerCase()] || 0;
}

// Labels da escala ativa (feedback_24h / RATING_MAP do respond)
const NUMBER_TO_LABEL: Record<number, string> = {
    5: "Excelente",
    4: "Muito bom",
    3: "Regular",
    2: "Precisa melhorar",
    1: "Insatisfeito",
};

// Texto exibível: mantém o texto original quando houver, senão converte o número
export function npsNotaLabel(nota: unknown): string {
    const s = String(nota ?? "").trim();
    if (s && !/^\d+(\.\d+)?$/.test(s) && typeof nota !== "number") return s;
    return NUMBER_TO_LABEL[npsNotaToNumber(nota)] || s;
}

export function npsAverage(entries: { nota: unknown }[]): number | null {
    const notas = entries.map((e) => npsNotaToNumber(e.nota)).filter((n) => n > 0);
    if (notas.length === 0) return null;
    return notas.reduce((a, b) => a + b, 0) / notas.length;
}
