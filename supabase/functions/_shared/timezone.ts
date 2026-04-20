// supabase/functions/_shared/timezone.ts
// -----------------------------------------------------------------------------
// Shared timezone helpers for Delivery Automation (and any other edge function
// that needs Brasília <-> UTC conversions).
//
// The system stores appointments/timestamps as TIMESTAMPTZ (UTC) but ALL
// user-facing dates and times are Brasília (America/Sao_Paulo, UTC-3, no DST
// since 2019).
//
// Pure JS/TS — uses Intl.DateTimeFormat only. No external deps.
// -----------------------------------------------------------------------------

export const BR_TZ = "America/Sao_Paulo";

/** Brasília weekday: 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface BRParts {
    ymd: string;       // 'YYYY-MM-DD'
    year: number;
    month: number;     // 1..12
    day: number;       // 1..31
    hour: number;      // 0..23
    minute: number;    // 0..59
    weekday: Weekday;
}

const _weekdayMap: Record<string, Weekday> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function _parts(d: Date): BRParts {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: BR_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "short",
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(d)) {
        if (p.type !== "literal") parts[p.type] = p.value;
    }
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    // hour '24' (midnight) → 0
    const rawHour = Number(parts.hour);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(parts.minute);
    const weekday = _weekdayMap[parts.weekday] ?? 0;
    const ymd = `${parts.year}-${parts.month}-${parts.day}`;
    return { ymd, year, month, day, hour, minute, weekday };
}

/** Returns the current date in Brasília as 'YYYY-MM-DD'. */
export function todayInBrasilia(now: Date = new Date()): string {
    return _parts(now).ymd;
}

/** Returns detailed Brasília-zoned parts of a UTC Date. */
export function utcToBrasiliaParts(d: Date): BRParts {
    return _parts(d);
}

/** True if the given UTC Date is BEFORE 12:00 Brasília local time. */
export function isMorningBR(d: Date): boolean {
    return _parts(d).hour < 12;
}

/**
 * Convert a Brasília wall-clock date+time (e.g., 2026-04-22 at 14:30 local)
 * into a UTC Date. Uses offset-sampling to be robust against potential DST
 * reintroduction — BR has no DST as of 2019 but defensive anyway.
 */
export function brasiliaDateTimeToUTC(ymd: string, hm: string): Date {
    const [y, mo, d] = ymd.split("-").map(Number);
    const [h, mi] = hm.split(":").map(Number);

    // Initial guess: treat the given wall clock AS IF it were UTC.
    // Then compare with what BR says for that instant → delta is the BR offset.
    let guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0));
    for (let i = 0; i < 3; i++) {
        const p = _parts(guess);
        const guessAsBRLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
        const targetAsUTC = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
        const delta = targetAsUTC - guessAsBRLocal;
        if (delta === 0) break;
        guess = new Date(guess.getTime() + delta);
    }
    return guess;
}

/**
 * Given a starting Brasília date (YYYY-MM-DD), return the next Brasília date
 * (YYYY-MM-DD) whose weekday equals `target` (0=Sun..6=Sat).
 * If `fromYmd` itself matches, returns `fromYmd` (caller can +1 day if needed).
 */
export function getNextWeekdayInBrasilia(fromYmd: string, target: Weekday): string {
    const [y, mo, d] = fromYmd.split("-").map(Number);
    // Build a stable midday-BR anchor so DST edges don't shift the weekday
    let cursor = brasiliaDateTimeToUTC(fromYmd, "12:00");
    for (let i = 0; i < 14; i++) {
        const p = _parts(cursor);
        if (p.weekday === target) return p.ymd;
        cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
    }
    // Safety fallback (shouldn't be reachable)
    return fromYmd;
}

/**
 * Add N days to a Brasília YYYY-MM-DD string, returning the new YYYY-MM-DD.
 * Works via a midday anchor to avoid DST off-by-one.
 */
export function addDaysBR(ymd: string, n: number): string {
    const anchor = brasiliaDateTimeToUTC(ymd, "12:00");
    const shifted = new Date(anchor.getTime() + n * 24 * 3600 * 1000);
    return _parts(shifted).ymd;
}

/** 'YYYY-MM-DD' → 'DD/MM' */
export function formatDDMM(ymd: string): string {
    const [, m, d] = ymd.split("-");
    return `${d}/${m}`;
}

/** Portuguese weekday name for 0..6 (BR convention). */
export function weekdayNamePt(w: Weekday): string {
    return [
        "domingo",
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
    ][w];
}

/** Capitalized Portuguese weekday name. */
export function weekdayNamePtCap(w: Weekday): string {
    const n = weekdayNamePt(w);
    return n.charAt(0).toUpperCase() + n.slice(1);
}
