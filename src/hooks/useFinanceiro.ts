import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

/**
 * Dados da página /financial (abas Orçamentos e Vendas).
 * Todas as RPCs são SECURITY DEFINER e resolvem o tenant por get_owner_id(),
 * então funcionam para admin, supervisor e atendente.
 */

export interface OrcamentoCards {
    orcamentos: number;
    total_valor: number;
    total_itens: number;
    aprovado_valor: number;
    aprovado_itens: number;
    rejeitado_valor: number;
    rejeitado_itens: number;
    pendente_valor: number;
    pendente_itens: number;
}

export interface OrcamentoMonthPoint {
    mes: string; // "YYYY-MM"
    realizados: number;
    fechados: number;
    perdidos: number;
    pendentes: number;
}

export interface OrcamentoRow {
    id: string;
    created_at: string;
    contact_id: string | null;
    contact_name: string | null;
    contact_number: string | null;
    responsavel_name: string | null;
    criado_por: string | null;
    indicacao: string | null;
    validade: string | null;
    notes: string | null;
    itens: number;
    valor_total: number;
    valor_vendido: number;
    pendentes: number;
    vendidos: number;
    recusados: number;
    expirados: number;
}

export interface OrcamentoPorResponsavel {
    id: string;
    name: string;
    role: string | null;
    photo_url: string | null;
    orcamentos: number;
    itens: number;
    valor: number;
}

export interface ServicoOrcado {
    name: string;
    itens: number;
    valor: number;
    vendidos: number;
}

export interface SaleRow {
    id: string;
    sale_date: string;
    created_at: string;
    product_name: string | null;
    category: string | null;
    quantity: number;
    unit_price: number;
    total_amount: number;
    payment_type: string;
    installments: number;
    contact_id: string | null;
    contact_name: string | null;
    responsavel_name: string | null;
    sala_name: string | null;
    atendente_name: string | null;
    appointment_id: string | null;
    orcamento_item_id: string | null;
    appointment_alert: string | null;
    scheduled: boolean | null;
    ia_scheduling: boolean | null;
    parcelas_total: number;
    parcelas_pagas: number;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn as any, args as any);
    if (error) throw error;
    return data as T;
}

export function useOrcamentoCards(start: string | null, end: string | null) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-orcamento-cards", ownerId, start, end],
        enabled: !!ownerId,
        queryFn: () => rpc<OrcamentoCards>("get_orcamento_cards", { p_start: start, p_end: end }),
    });
}

export function useOrcamentoMonthly() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-orcamento-monthly", ownerId],
        enabled: !!ownerId,
        queryFn: () => rpc<OrcamentoMonthPoint[]>("get_orcamento_monthly_counts", {}),
    });
}

export function useOrcamentosTable(limit = 300) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-orcamentos-table", ownerId, limit],
        enabled: !!ownerId,
        queryFn: () => rpc<OrcamentoRow[]>("get_orcamentos_table", { p_limit: limit, p_offset: 0 }),
    });
}

export function useOrcamentosByResponsavel(start: string | null, end: string | null) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-orcamentos-responsavel", ownerId, start, end],
        enabled: !!ownerId,
        queryFn: () => rpc<OrcamentoPorResponsavel[]>("get_orcamentos_by_responsavel", { p_start: start, p_end: end }),
    });
}

export function useRankingServicosOrcados(start: string | null, end: string | null) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-ranking-servicos", ownerId, start, end],
        enabled: !!ownerId,
        queryFn: () => rpc<ServicoOrcado[]>("get_ranking_servicos_orcados", { p_start: start, p_end: end }),
    });
}

export function useSalesTable(limit = 300) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["fin-sales-table", ownerId, limit],
        enabled: !!ownerId,
        queryFn: () => rpc<SaleRow[]>("get_sales_table", { p_limit: limit, p_offset: 0 }),
    });
}
