// supabase/functions/_shared/slot-engine.ts
// -----------------------------------------------------------------------------
// TZ-aware availability slot engine for Delivery Automation.
//
// IMPORTANT: This is an independent implementation from /check-availability.
// We keep them separate on purpose: the existing /check-availability has quirks
// around work_hours parsing (Number(...) on "HH:MM" strings) that would change
// behavior if "fixed" now. We do NOT touch it. This engine produces correct
// BRT-local slots using the shared timezone helper.
//
// Input: professional_id + service_id + targetDate (YYYY-MM-DD in Brasília).
// Output: array of { time: "HH:MM", utcStart: Date } — free slots in BRT wall
// clock, plus the corresponding UTC Date ready for insertion.
// -----------------------------------------------------------------------------

import {
    brasiliaDateTimeToUTC,
    utcToBrasiliaParts,
} from "./timezone.ts";

export interface Slot {
    time: string;       // 'HH:MM' in Brasília wall clock
    utcStart: Date;     // matching UTC start instant
}

export interface ComputeSlotsParams {
    supabase: any;
    userId: string;
    professionalId: string;
    serviceId: string;
    targetDateYmd: string;    // 'YYYY-MM-DD' Brasília
    slotStepMinutes?: number; // default 30
}

/** Flexible HH/MM parser — accepts "HH:MM", integer hour, decimal hour (8.5). */
function parseTimeComponent(value: unknown): { hh: number; mm: number } | null {
    if (value == null) return null;
    if (typeof value === "number") {
        const hh = Math.floor(value);
        const mm = Math.round((value - hh) * 60);
        return { hh, mm };
    }
    const s = String(value).trim();
    if (!s) return null;
    if (s.includes(":")) {
        const [h, m] = s.split(":");
        const hh = Number(h);
        const mm = Number(m);
        if (Number.isFinite(hh) && Number.isFinite(mm)) return { hh, mm };
        return null;
    }
    const n = Number(s);
    if (Number.isFinite(n)) {
        const hh = Math.floor(n);
        const mm = Math.round((n - hh) * 60);
        return { hh, mm };
    }
    return null;
}

function hmToMinutes(hh: number, mm: number): number {
    return hh * 60 + mm;
}

function minutesToHM(mins: number): string {
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function computeAvailableSlots(
    params: ComputeSlotsParams,
): Promise<Slot[]> {
    const {
        supabase,
        userId,
        professionalId,
        serviceId,
        targetDateYmd,
        slotStepMinutes = 30,
    } = params;

    // 1. Fetch professional
    const { data: professional, error: profErr } = await supabase
        .from("professionals")
        .select("id, work_days, work_hours")
        .eq("id", professionalId)
        .maybeSingle();
    if (profErr) throw profErr;
    if (!professional) return [];

    // 2. Fetch service duration
    const { data: service, error: svcErr } = await supabase
        .from("products_services")
        .select("id, duration_minutes")
        .eq("id", serviceId)
        .maybeSingle();
    if (svcErr) throw svcErr;
    const serviceDuration = Math.max(5, Number(service?.duration_minutes || 60));

    // 3. Validate weekday
    const workDays: number[] = professional.work_days && professional.work_days.length > 0
        ? professional.work_days
        : [0, 1, 2, 3, 4, 5, 6];

    // Determine weekday in Brasília for the target date (use midday anchor)
    const anchorUtc = brasiliaDateTimeToUTC(targetDateYmd, "12:00");
    const { weekday } = utcToBrasiliaParts(anchorUtc);
    if (!workDays.includes(weekday)) return [];

    // 4. Parse work_hours (flexible: "HH:MM" or decimal number)
    const wh = professional.work_hours || {};
    const start = parseTimeComponent(wh.start) || { hh: 9, mm: 0 };
    const end = parseTimeComponent(wh.end) || { hh: 18, mm: 0 };
    const breakStart = parseTimeComponent(wh.break_start);
    const breakEnd = parseTimeComponent(wh.break_end);

    const startMin = hmToMinutes(start.hh, start.mm);
    const endMin = hmToMinutes(end.hh, end.mm);
    const breakStartMin = breakStart ? hmToMinutes(breakStart.hh, breakStart.mm) : null;
    const breakEndMin = breakEnd ? hmToMinutes(breakEnd.hh, breakEnd.mm) : null;

    if (endMin <= startMin) return [];

    // 5. Fetch existing appointments for this professional on this BRT date
    //    (comparing via UTC window covering the full BRT day).
    const dayStartUtc = brasiliaDateTimeToUTC(targetDateYmd, "00:00").toISOString();
    const dayEndUtc = brasiliaDateTimeToUTC(targetDateYmd, "23:59").toISOString();

    const [aptRes, clinicRes] = await Promise.all([
        supabase
            .from("appointments")
            .select("start_time, end_time, status")
            .eq("professional_id", professionalId)
            .gte("start_time", dayStartUtc)
            .lte("start_time", dayEndUtc),
        supabase
            .from("appointments")
            .select("start_time, end_time, type")
            .is("professional_id", null)
            .eq("type", "absence")
            .not("google_event_id", "is", null)
            .gte("start_time", dayStartUtc)
            .lte("start_time", dayEndUtc),
    ]);
    if (aptRes.error) throw aptRes.error;

    // Convert blocked ranges to BRT minute offsets on the target date
    const blocked: Array<{ startMin: number; endMin: number }> = [];
    const pushBlocked = (start_time: string, end_time: string) => {
        const s = utcToBrasiliaParts(new Date(start_time));
        const e = utcToBrasiliaParts(new Date(end_time));
        // If the appointment spans midnight across BRT dates, clamp to this day.
        const sMin = s.ymd === targetDateYmd ? hmToMinutes(s.hour, s.minute) : 0;
        const eMin = e.ymd === targetDateYmd ? hmToMinutes(e.hour, e.minute) : 24 * 60;
        if (eMin > sMin) blocked.push({ startMin: sMin, endMin: eMin });
    };

    for (const a of aptRes.data || []) {
        if ((a as any).status === "canceled") continue;
        pushBlocked(a.start_time, a.end_time);
    }
    for (const a of clinicRes.data || []) {
        pushBlocked(a.start_time, a.end_time);
    }

    // 6. Generate candidate slots
    const slots: Slot[] = [];
    for (let m = startMin; m + serviceDuration <= endMin; m += slotStepMinutes) {
        const slotStart = m;
        const slotEnd = m + serviceDuration;

        // Break conflict
        if (breakStartMin !== null && breakEndMin !== null) {
            const overlapsBreak = slotStart < breakEndMin && breakStartMin < slotEnd;
            if (overlapsBreak) continue;
        }

        // Appointment / absence conflict
        const conflict = blocked.some(
            (b) => slotStart < b.endMin && b.startMin < slotEnd,
        );
        if (conflict) continue;

        const hm = minutesToHM(slotStart);
        slots.push({
            time: hm,
            utcStart: brasiliaDateTimeToUTC(targetDateYmd, hm),
        });
    }

    return slots;
}
