// Resolução de horário de atendimento por dia da semana.
// Espelho de src/lib/professionalSchedule.ts — manter em sincronia.

export interface DayHours {
    start?: string | number | null;
    end?: string | number | null;
    break_start?: string | number | null;
    break_end?: string | number | null;
}

export interface ScheduleFields {
    work_hours?: DayHours | null;
    work_hours_daily?: Record<string, DayHours> | null;
    use_daily_schedule?: boolean | null;
}

/**
 * Retorna o horário de expediente do profissional para um dia da semana (0=Dom..6=Sáb).
 * Com use_daily_schedule ligado usa work_hours_daily[dia]; fallback = work_hours global.
 */
export function getWorkHoursForDay(prof: ScheduleFields, weekday: number): DayHours {
    if (prof?.use_daily_schedule && prof.work_hours_daily) {
        const daily = prof.work_hours_daily[String(weekday)];
        if (daily) return daily;
    }
    return prof?.work_hours || {};
}
