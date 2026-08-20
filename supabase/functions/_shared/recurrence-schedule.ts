// ---------------------------------------------------------------------------
// Recorrência — cálculo do horário de disparo das campanhas diárias (R18).
// Módulo PURO (sem Deno/DOM): usado pelo gerador diário e pelos testes vitest.
// Regra: hora base X (BRT, profiles.recurrence_dispatch_hour, padrão 9) ⇒
// cada campanha inicia em um instante ALEATÓRIO dentro de [X:00, X+1:00) BRT.
// ---------------------------------------------------------------------------

const BRT_UTC_OFFSET_HOURS = 3; // BRT = UTC-3 (sem horário de verão)

/** Normaliza a hora configurada para 0..23 (fallback 9). */
export function clampDispatchHour(hour: unknown): number {
    const h = typeof hour === "number" && Number.isFinite(hour) ? Math.trunc(hour) : 9;
    return h >= 0 && h <= 23 ? h : 9;
}

/**
 * Sorteia o instante de disparo em UTC para o dia `dateISO` (yyyy-MM-dd, dia BRT)
 * com hora base `hour` BRT: resultado ∈ [X:00:00, X+1:00:00) BRT.
 * `rand` injetável para testes (default Math.random).
 */
export function randomDispatchTimeUtc(
    dateISO: string,
    hour: number,
    rand: () => number = Math.random,
): string {
    const h = clampDispatchHour(hour);
    const [y, m, d] = dateISO.split("-").map((p) => parseInt(p, 10));
    const offsetSeconds = Math.min(3599, Math.floor(rand() * 3600));
    const ms = Date.UTC(y, m - 1, d, h + BRT_UTC_OFFSET_HOURS, 0, offsetSeconds);
    return new Date(ms).toISOString();
}

/** Rótulo humano da janela: 9 → "entre 9h e 10h" (23 → "entre 23h e 0h"). */
export function dispatchWindowLabel(hour: number): string {
    const h = clampDispatchHour(hour);
    return `entre ${h}h e ${(h + 1) % 24}h`;
}
