import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SalesReport } from "@/types/sales";

// Lista de relatórios salvos
export function useSalesReports() {
    return useQuery({
        queryKey: ['sales-reports'],
        queryFn: async (): Promise<SalesReport[]> => {
            const { data, error } = await supabase
                .from('sales_reports' as any)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []) as unknown as SalesReport[];
        },
    });
}

// Gerar relatório com IA
export function useGenerateSalesReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            startDate,
            endDate,
            reportName,
        }: {
            startDate: string;
            endDate: string;
            reportName: string;
        }) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Não autenticado');

            const response = await supabase.functions.invoke('generate-sales-report', {
                body: {
                    startDate,
                    endDate,
                    reportName,
                },
            });

            if (response.error) throw response.error;
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales-reports'] });
            toast.success('Relatório gerado com sucesso!');
        },
        onError: (error) => {
            toast.error('Erro ao gerar relatório: ' + error.message);
        },
    });
}

// Excluir relatório
export function useDeleteSalesReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('sales_reports' as any)
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales-reports'] });
            toast.success('Relatório excluído');
        },
        onError: (error) => {
            toast.error('Erro ao excluir: ' + error.message);
        },
    });
}
