import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hooks da aba "Minha Conta" (Dashboard, admin-only): consumo de tokens do
// tenant unificado (IA n8n + IA do sistema) em BRL, agregado server-side via
// RPCs (migration 20260822120000) — nunca somar token_usage_log no front
// (cap de 1000 linhas do PostgREST).
// Types não regenerados → (supabase.rpc as any).

export interface MyTokenStats {
    total_tokens: number;
    total_cost_brl: number;
    month_tokens: number;
    month_cost_brl: number;
    today_tokens: number;
    today_cost_brl: number;
}

export interface MyTokenMonthly {
    year_month: string; // "YYYY-MM"
    total_tokens: number;
    total_cost_brl: number;
}

export interface MyTokenDaily {
    usage_date: string; // "YYYY-MM-DD"
    total_tokens: number;
    total_cost_brl: number;
}

export function useMyTokenStats() {
    return useQuery({
        queryKey: ["my-token-stats"],
        queryFn: async (): Promise<MyTokenStats | null> => {
            const { data, error } = await (supabase.rpc as any)("get_my_token_stats");
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return null;
            return {
                total_tokens: Number(row.total_tokens) || 0,
                total_cost_brl: Number(row.total_cost_brl) || 0,
                month_tokens: Number(row.month_tokens) || 0,
                month_cost_brl: Number(row.month_cost_brl) || 0,
                today_tokens: Number(row.today_tokens) || 0,
                today_cost_brl: Number(row.today_cost_brl) || 0,
            };
        },
    });
}

export interface MyMetaSendStats {
    total_count: number;
    total_cost_brl: number;
    month_count: number;
    month_cost_brl: number;
    today_count: number;
    today_cost_brl: number;
}

// Consumo estimado com envio de templates Meta (template_sends × preço por
// categoria do template × cotação USD-BRL) — RPC migration 20260822150000
export function useMyMetaSendStats() {
    return useQuery({
        queryKey: ["my-meta-send-stats"],
        queryFn: async (): Promise<MyMetaSendStats | null> => {
            const { data, error } = await (supabase.rpc as any)("get_my_meta_send_stats");
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return null;
            return {
                total_count: Number(row.total_count) || 0,
                total_cost_brl: Number(row.total_cost_brl) || 0,
                month_count: Number(row.month_count) || 0,
                month_cost_brl: Number(row.month_cost_brl) || 0,
                today_count: Number(row.today_count) || 0,
                today_cost_brl: Number(row.today_cost_brl) || 0,
            };
        },
    });
}

export interface MyMetaSendMonthly {
    year_month: string; // "YYYY-MM"
    send_count: number;
    cost_brl: number;
}

export interface MyMetaSendDaily {
    usage_date: string; // "YYYY-MM-DD"
    send_count: number;
    cost_brl: number;
}

// Séries dos envios Meta p/ os gráficos (migration 20260822170000)
export function useMyMetaSendMonthly(year: string) {
    return useQuery({
        queryKey: ["my-meta-send-monthly", year],
        queryFn: async (): Promise<MyMetaSendMonthly[]> => {
            const { data, error } = await (supabase.rpc as any)("get_my_meta_send_monthly", {
                p_year: year,
            });
            if (error) throw error;
            return (data || []).map((r: any) => ({
                year_month: String(r.year_month),
                send_count: Number(r.send_count) || 0,
                cost_brl: Number(r.cost_brl) || 0,
            }));
        },
        enabled: !!year,
    });
}

export function useMyMetaSendDaily(days: number) {
    return useQuery({
        queryKey: ["my-meta-send-daily", days],
        queryFn: async (): Promise<MyMetaSendDaily[]> => {
            const { data, error } = await (supabase.rpc as any)("get_my_meta_send_daily", {
                p_days: days,
            });
            if (error) throw error;
            return (data || []).map((r: any) => ({
                usage_date: String(r.usage_date),
                send_count: Number(r.send_count) || 0,
                cost_brl: Number(r.cost_brl) || 0,
            }));
        },
    });
}

export function useMyTokenYears() {
    return useQuery({
        queryKey: ["my-token-years"],
        queryFn: async (): Promise<string[]> => {
            const { data, error } = await (supabase.rpc as any)("get_my_token_years");
            if (error) throw error;
            return (data || []).map((r: any) => String(r.usage_year));
        },
    });
}

export function useMyTokenMonthly(year: string) {
    return useQuery({
        queryKey: ["my-token-monthly", year],
        queryFn: async (): Promise<MyTokenMonthly[]> => {
            const { data, error } = await (supabase.rpc as any)("get_my_token_monthly", {
                p_year: year,
            });
            if (error) throw error;
            return (data || []).map((r: any) => ({
                year_month: String(r.year_month),
                total_tokens: Number(r.total_tokens) || 0,
                total_cost_brl: Number(r.total_cost_brl) || 0,
            }));
        },
        enabled: !!year,
    });
}

export function useMyTokenDaily(days: number) {
    return useQuery({
        queryKey: ["my-token-daily", days],
        queryFn: async (): Promise<MyTokenDaily[]> => {
            const { data, error } = await (supabase.rpc as any)("get_my_token_daily", {
                p_days: days,
            });
            if (error) throw error;
            return (data || []).map((r: any) => ({
                usage_date: String(r.usage_date),
                total_tokens: Number(r.total_tokens) || 0,
                total_cost_brl: Number(r.total_cost_brl) || 0,
            }));
        },
    });
}
