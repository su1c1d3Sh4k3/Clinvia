// Janela dedicada a convênio de uma sala, resolvida por dia da semana.
// Espelho da parte de horário de supabase/functions/_shared/convenio-schedule.ts
// — manter em sincronia. No front serve só para PINTAR a agenda: o encaixe
// manual continua livre (a restrição vale para IA/APIs/link público).

export interface ConvenioHours {
    start?: string | number | null;
    end?: string | number | null;
}

export interface ConvenioScheduleFields {
    convenio_enabled?: boolean | null;
    convenio_days?: number[] | null;
    convenio_hours?: ConvenioHours | null;
    convenio_use_daily?: boolean | null;
    convenio_hours_daily?: Record<string, ConvenioHours> | null;
}

export interface MinuteRange { start: number; end: number; }

export interface WorkWindow {
    start: number;
    end: number;
    breakStart: number | null;
    breakEnd: number | null;
}

/** "14:30" | 14.5 | null → minutos do dia. */
export function parseTimeToMinutes(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string") {
        const s = t.trim();
        if (!s) return null;
        if (s.includes(":")) {
            const [h, m] = s.split(":").map(Number);
            if (isNaN(h)) return null;
            return h * 60 + (m || 0);
        }
    }
    const num = parseFloat(String(t));
    return isNaN(num) ? null : num * 60;
}

export function getConvenioHoursForDay(
    prof: ConvenioScheduleFields,
    weekday: number,
): ConvenioHours | null {
    if (!prof?.convenio_enabled) return null;
    const days = prof.convenio_days || [];
    if (!days.includes(weekday)) return null;
    if (prof.convenio_use_daily && prof.convenio_hours_daily) {
        return prof.convenio_hours_daily[String(weekday)] || null;
    }
    return prof.convenio_hours || null;
}

/**
 * Faixas realmente dedicadas no dia: a janela cortada pelo expediente e pelo
 * intervalo. Pode devolver duas faixas quando o intervalo parte a janela.
 */
export function convenioRanges(
    prof: ConvenioScheduleFields,
    weekday: number,
    work: WorkWindow,
): MinuteRange[] {
    const hours = getConvenioHoursForDay(prof, weekday);
    if (!hours) return [];

    const rawStart = parseTimeToMinutes(hours.start);
    const rawEnd = parseTimeToMinutes(hours.end);
    if (rawStart === null || rawEnd === null || rawEnd <= rawStart) return [];

    const start = Math.max(rawStart, work.start);
    const end = Math.min(rawEnd, work.end);
    if (end <= start) return [];

    if (work.breakStart === null || work.breakEnd === null || work.breakEnd <= work.breakStart) {
        return [{ start, end }];
    }

    const ranges: MinuteRange[] = [];
    if (work.breakStart > start) ranges.push({ start, end: Math.min(end, work.breakStart) });
    if (work.breakEnd < end) ranges.push({ start: Math.max(start, work.breakEnd), end });
    return ranges.filter((r) => r.end > r.start);
}
