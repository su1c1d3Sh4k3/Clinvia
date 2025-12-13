import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export interface FinancialReport {
    id: string;
    user_id: string;
    name: string;
    start_date: string;
    end_date: string;
    content: ReportContent;
    raw_data: RawFinancialData;
    status: string;
    created_at: string;
}

export interface ReportContent {
    resumoExecutivo: string;
    receitas: string;
    despesas: string;
    receitasXDespesas: string;
    marketing: string;
    receitasPorAtendente: string;
    receitasPorProfissional: string;
    pontosPositivos: string[];
    pontosNegativos: string[];
    pontosDeMelhoria: string[];
    insights: {
        curtoPrazo: string[];
        medioPrazo: string[];
        longoPrazo: string[];
    };
    parseError?: boolean;
}

export interface RawFinancialData {
    period: { startDate: string; endDate: string };
    revenues: { total: number; paid: number; pending: number; overdue: number; count: number };
    expenses: { total: number; paid: number; pending: number; overdue: number; count: number };
    teamCosts: { total: number; salaries: number; commissions: number; bonuses: number; deductions: number; count: number };
    marketing: { investment: number; leads: number; conversions: number; costPerLead: number; costPerConversion: number; conversionRate: number; count: number };
    balance: { grossProfit: number; netProfit: number; profitMargin: number };
    revenueByAgent: { name: string; total: number; count: number }[];
    revenueByProfessional: { name: string; total: number; count: number }[];
    revenueByCategory: { name: string; total: number; count: number }[];
    expenseByCategory: { name: string; total: number; count: number }[];
}

// Hook: List saved reports
export function useFinancialReports() {
    return useQuery({
        queryKey: ['financial-reports'],
        queryFn: async (): Promise<FinancialReport[]> => {
            const { data, error } = await supabase
                .from('financial_reports')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []) as FinancialReport[];
        },
    });
}

// Hook: Get single report
export function useFinancialReport(id: string | null) {
    return useQuery({
        queryKey: ['financial-report', id],
        queryFn: async (): Promise<FinancialReport | null> => {
            if (!id) return null;

            const { data, error } = await supabase
                .from('financial_reports')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data as FinancialReport;
        },
        enabled: !!id,
    });
}

// Hook: Generate new report
export function useGenerateFinancialReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ startDate, endDate, reportName }: { startDate: string; endDate: string; reportName: string }) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('Usuário não autenticado');
            }

            const response = await supabase.functions.invoke('generate-financial-report', {
                body: { startDate, endDate, reportName },
            });

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao gerar relatório');
            }

            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-reports'] });
            toast.success('Relatório gerado com sucesso!');
        },
        onError: (error) => {
            console.error('Error generating report:', error);
            toast.error('Erro ao gerar relatório: ' + error.message);
        },
    });
}

// Hook: Delete report
export function useDeleteFinancialReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('financial_reports')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-reports'] });
            toast.success('Relatório excluído com sucesso!');
        },
        onError: (error) => {
            toast.error('Erro ao excluir relatório: ' + error.message);
        },
    });
}
