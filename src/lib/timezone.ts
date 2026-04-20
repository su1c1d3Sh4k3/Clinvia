// src/lib/timezone.ts
// Frontend mirror of supabase/functions/_shared/timezone.ts
// Wraps date-fns-tz (already a dep) with the same API signatures so that
// date logic can be shared conceptually between frontend and edge functions.

import { toZonedTime, fromZonedTime, format as formatTz } from "date-fns-tz";

export const BR_TZ = "America/Sao_Paulo";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Returns the current date in Brasília as 'YYYY-MM-DD'. */
export function todayInBrasilia(now: Date = new Date()): string {
    return formatTz(toZonedTime(now, BR_TZ), "yyyy-MM-dd", { timeZone: BR_TZ });
}

/** Convert a Brasília wall-clock (ymd + 'HH:MM') into a UTC Date. */
export function brasiliaDateTimeToUTC(ymd: string, hm: string): Date {
    // Create a date string in ISO format (naive, no timezone) and interpret in BR_TZ.
    const local = `${ymd}T${hm}:00`;
    return fromZonedTime(local, BR_TZ);
}

/** Get Brasília-zoned parts of a UTC Date. */
export function utcToBrasiliaParts(d: Date): {
    ymd: string; year: number; month: number; day: number;
    hour: number; minute: number; weekday: Weekday;
} {
    const zoned = toZonedTime(d, BR_TZ);
    const ymd = formatTz(zoned, "yyyy-MM-dd", { timeZone: BR_TZ });
    return {
        ymd,
        year: zoned.getFullYear(),
        month: zoned.getMonth() + 1,
        day: zoned.getDate(),
        hour: zoned.getHours(),
        minute: zoned.getMinutes(),
        weekday: zoned.getDay() as Weekday,
    };
}

/** True if the given UTC Date is BEFORE 12:00 Brasília. */
export function isMorningBR(d: Date): boolean {
    return utcToBrasiliaParts(d).hour < 12;
}

/**
 * Returns the next Brasília date (YYYY-MM-DD) — at or after `fromYmd` —
 * whose weekday equals `target`.
 */
export function getNextWeekdayInBrasilia(fromYmd: string, target: Weekday): string {
    let cursor = brasiliaDateTimeToUTC(fromYmd, "12:00");
    for (let i = 0; i < 14; i++) {
        const parts = utcToBrasiliaParts(cursor);
        if (parts.weekday === target) return parts.ymd;
        cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
    }
    return fromYmd;
}

/** Add N days to a Brasília YYYY-MM-DD string, returning the new YYYY-MM-DD. */
export function addDaysBR(ymd: string, n: number): string {
    const anchor = brasiliaDateTimeToUTC(ymd, "12:00");
    const shifted = new Date(anchor.getTime() + n * 24 * 3600 * 1000);
    return utcToBrasiliaParts(shifted).ymd;
}

/** 'YYYY-MM-DD' → 'DD/MM' */
export function formatDDMM(ymd: string): string {
    const [, m, d] = ymd.split("-");
    return `${d}/${m}`;
}

/** Portuguese weekday name for 0..6. */
export function weekdayNamePt(w: Weekday): string {
    return [
        "domingo", "segunda-feira", "terça-feira", "quarta-feira",
        "quinta-feira", "sexta-feira", "sábado",
    ][w];
}

export function weekdayNamePtCap(w: Weekday): string {
    const n = weekdayNamePt(w);
    return n.charAt(0).toUpperCase() + n.slice(1);
}
