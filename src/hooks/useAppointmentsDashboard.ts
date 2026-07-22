import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashProfessional {
    id: string;
    name: string;
    photo_url: string | null;
    work_days: number[] | null;
    work_hours: {
        start?: string;
        end?: string;
        break_start?: string;
        break_end?: string;
    } | null;
}

export interface DashAppointment {
    id: string;
    status: string;
    start_time: string;
    end_time: string;
    price: number | null;
    professional_id: string | null;
    professional_name: string | null;
    service_id: string | null;
    service_name: string | null;
    service: {
        id: string;
        name: string;
        price: number | null;
        service_name: { name: string } | null;
    } | null;
}

export function useProfessionalsDashboard() {
    return useQuery({
        queryKey: ["professionals-dashboard"],
        queryFn: async (): Promise<DashProfessional[]> => {
            const { data, error } = await supabase
                .from("professionals" as any)
                .select("id, name, photo_url, work_days, work_hours")
                .order("name");
            if (error) throw error;
            return (data || []) as unknown as DashProfessional[];
        },
    });
}

export function useAppointmentsRange(startISO: string, endISO: string) {
    return useQuery({
        queryKey: ["appointments-dashboard", startISO, endISO],
        queryFn: async (): Promise<DashAppointment[]> => {
            const { data, error } = await supabase
                .from("appointments" as any)
                .select(
                    "id, status, start_time, end_time, price, professional_id, professional_name, service_id, service_name, service:services_client(id, name, price, service_name:service_name(name))"
                )
                .gte("start_time", startISO)
                .lte("start_time", endISO)
                .eq("type", "appointment")
                .limit(10000);
            if (error) throw error;
            return (data || []) as unknown as DashAppointment[];
        },
    });
}

export const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

// Parse "HH:MM" or decimal hour into decimal hours (e.g. "09:30" -> 9.5)
export function parseHour(value: string | number | undefined, fallback: number): number {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "number") return value;
    if (value.includes(":")) {
        const [h, m] = value.split(":").map(Number);
        return (h || 0) + (m || 0) / 60;
    }
    const n = parseFloat(value);
    return isNaN(n) ? fallback : n;
}

// Available work minutes of a professional on a given weekday (0=Sun..6=Sat)
export function dailyWorkMinutes(prof: DashProfessional, dayOfWeek: number): number {
    const workDays = prof.work_days || [];
    if (!workDays.includes(dayOfWeek)) return 0;
    const wh = prof.work_hours || {};
    const startH = parseHour(wh.start, 8);
    const endH = parseHour(wh.end, 18);
    const breakStartH = parseHour(wh.break_start, 0);
    const breakEndH = parseHour(wh.break_end, 0);
    let minutes = (endH - startH) * 60;
    if (breakStartH && breakEndH && breakEndH > breakStartH) {
        minutes -= (breakEndH - breakStartH) * 60;
    }
    return Math.max(0, minutes);
}
