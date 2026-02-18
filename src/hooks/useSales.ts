import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type {
    Sale,
    SaleInstallment,
    SaleFormData,
    SalesSummary,
    AnnualSalesItem,
    TopProductService,
    SalesProjection,
    SalesByPerson,
} from "@/types/sales";
import { useOwnerId } from "@/hooks/useOwnerId";

// =============================================
// HELPER: Get owner_id for RLS compatibility
// =============================================
async function getOwnerId(authUserId: string): Promise<string> {
    let { data: teamMember } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

    if (!teamMember) {
        const { data: adminMember } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('user_id', authUserId)
            .eq('role', 'admin')
            .maybeSingle();
        teamMember = adminMember;
    }

    return teamMember?.user_id || authUserId;
}

// =============================================
// HOOKS DE CONSULTA (READ)
// =============================================

// Lista de Vendas
export function useSales(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: ['sales', startDate, endDate],
        queryFn: async (): Promise<Sale[]> => {
            let query = supabase
                .from('sales' as any)
                .select(`
                    *,
                    product_service:products_services(id, name, type, price),
                    team_member:team_members(id, name, avatar_url),
                    professional:professionals(id, name, photo_url)
                `);

            if (startDate && endDate) {
                query = query
                    .gte('sale_date', startDate)
                    .lte('sale_date', endDate);
            }

            const { data, error } = await query.order('sale_date', { ascending: false });
            if (error) throw error;
            return (data || []) as Sale[];
        },
    });
}

// Contatos do usuário (para select de cliente em vendas)
export function useContacts() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ['contacts-for-sales', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from('contacts' as any)
                .select('id, push_name, number')
                .eq('user_id', ownerId)
                .not('number', 'ilike', '%@g.us')
                .order('push_name', { ascending: true });
            if (error) throw error;
            return (data || []) as { id: string; push_name: string; number?: string }[];
        },
        enabled: !!ownerId,
    });
}

// Resumo de Vendas do Mês
export function useSalesSummary(month: number, year: number) {
    return useQuery({
        queryKey: ['sales-summary', month, year],
        queryFn: async (): Promise<SalesSummary> => {
            const { data, error } = await supabase.rpc('get_sales_summary', {
                p_month: month,
                p_year: year
            });
            if (error) throw error;
            return data as SalesSummary;
        },
    });
}

// Vendas Anuais (12 meses) - baseado no total de vendas por mês
export function useAnnualSales(year?: number) {
    return useQuery({
        queryKey: ['annual-sales', year],
        queryFn: async (): Promise<AnnualSalesItem[]> => {
            const targetYear = year || new Date().getFullYear();
            const startDate = `${targetYear}-01-01`;
            const endDate = `${targetYear}-12-31`;

            const { data: sales, error } = await supabase
                .from('sales' as any)
                .select('sale_date, total_amount, payment_type')
                .gte('sale_date', startDate)
                .lte('sale_date', endDate)
                .neq('payment_type', 'pending');

            if (error) throw error;

            // Agrupar por mês
            const monthlyData: Record<number, number> = {};
            for (let m = 1; m <= 12; m++) {
                monthlyData[m] = 0;
            }

            (sales || []).forEach((sale: any) => {
                const month = new Date(sale.sale_date).getMonth() + 1;
                monthlyData[month] = (monthlyData[month] || 0) + Number(sale.total_amount);
            });

            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return Object.entries(monthlyData).map(([month, revenue]) => ({
                month_num: parseInt(month),
                month: monthNames[parseInt(month) - 1],
                revenue
            }));
        },
    });
}

// Vendas Diárias do Mês (para gráfico mensal) - baseado no total de vendas por dia
export function useMonthlySales(month: number, year: number) {
    return useQuery({
        queryKey: ['monthly-sales', month, year],
        queryFn: async () => {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);

            const { data: sales, error } = await supabase
                .from('sales' as any)
                .select('sale_date, total_amount, payment_type')
                .gte('sale_date', startDate.toISOString().split('T')[0])
                .lte('sale_date', endDate.toISOString().split('T')[0])
                .neq('payment_type', 'pending');

            if (error) throw error;

            // Agrupar por dia
            const dailyData: Record<number, number> = {};
            const daysInMonth = endDate.getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                dailyData[d] = 0;
            }

            (sales || []).forEach((sale: any) => {
                const day = new Date(sale.sale_date).getDate();
                dailyData[day] = (dailyData[day] || 0) + Number(sale.total_amount);
            });

            return Object.entries(dailyData).map(([day, revenue]) => ({
                day: parseInt(day),
                revenue
            }));
        },
    });
}

// Produto/Serviço Mais Vendido
export function useTopProductService(month: number, year: number) {
    return useQuery({
        queryKey: ['top-product-service', month, year],
        queryFn: async (): Promise<TopProductService | null> => {
            const { data, error } = await supabase.rpc('get_top_product_service', {
                p_month: month,
                p_year: year
            });
            if (error) throw error;
            return data?.id ? data as TopProductService : null;
        },
    });
}

// Projeção de Faturamentos
export function useSalesProjection(year?: number) {
    return useQuery({
        queryKey: ['sales-projection', year],
        queryFn: async (): Promise<SalesProjection> => {
            const { data, error } = await supabase.rpc('get_sales_projection', {
                p_year: year || new Date().getFullYear()
            });
            if (error) throw error;
            return data as SalesProjection;
        },
    });
}

// Vendas por Atendente
export function useSalesByAgent(month?: number, year?: number) {
    return useQuery({
        queryKey: ['sales-by-agent', month, year],
        queryFn: async (): Promise<SalesByPerson[]> => {
            const { data, error } = await supabase.rpc('get_sales_by_agent', {
                p_month: month || null,
                p_year: year || null
            });
            if (error) throw error;
            return (data || []) as SalesByPerson[];
        },
    });
}

// Vendas por Profissional
export function useSalesByProfessional(month?: number, year?: number) {
    return useQuery({
        queryKey: ['sales-by-professional', month, year],
        queryFn: async (): Promise<SalesByPerson[]> => {
            const { data, error } = await supabase.rpc('get_sales_by_professional', {
                p_month: month || null,
                p_year: year || null
            });
            if (error) throw error;
            return (data || []) as SalesByPerson[];
        },
    });
}

// Top 10 Produtos/Serviços Mais Vendidos
export interface TopSeller {
    product_id: string;
    product_name: string;
    product_type: 'product' | 'service';
    total_quantity: number;
    total_value: number;
}

export function useTopSellers(month?: number, year?: number) {
    return useQuery({
        queryKey: ['top-sellers', month, year],
        queryFn: async (): Promise<TopSeller[]> => {
            let startDate: string | undefined;
            let endDate: string | undefined;

            if (month && year) {
                startDate = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            } else if (year) {
                startDate = `${year}-01-01`;
                endDate = `${year}-12-31`;
            }

            let query = supabase
                .from('sales' as any)
                .select(`
                    product_service_id,
                    quantity,
                    total_amount,
                    product_service_id,
                    product_name,
                    quantity,
                    total_amount,
                    product_service:products_services(id, name, type)
                `);

            if (startDate && endDate) {
                query = query.gte('sale_date', startDate).lte('sale_date', endDate);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Agrupar por produto
            const productMap: Record<string, TopSeller> = {};
            (data || []).forEach((sale: any) => {
                const prodId = sale.product_service_id;
                if (!prodId) return;

                if (!productMap[prodId]) {
                    productMap[prodId] = {
                        product_id: prodId || 'unknown',
                        product_name: sale.product_name || sale.product_service?.name || 'Produto desconhecido',
                        product_type: sale.product_service?.type || 'product',
                        total_quantity: 0,
                        total_value: 0,
                    };
                }
                productMap[prodId].total_quantity += Number(sale.quantity);
                productMap[prodId].total_value += Number(sale.total_amount);
            });

            // Ordenar por quantidade decrescente e retornar top 10
            return Object.values(productMap)
                .sort((a, b) => b.total_quantity - a.total_quantity)
                .slice(0, 10);
        },
    });
}

// Faturamento Anual Total - soma de todas as vendas do ano
export function useAnnualRevenue(year: number) {
    return useQuery({
        queryKey: ['annual-revenue', year],
        queryFn: async (): Promise<number> => {
            const startDate = `${year}-01-01`;
            const endDate = `${year}-12-31`;

            const { data, error } = await supabase
                .from('sales' as any)
                .select('total_amount, payment_type')
                .gte('sale_date', startDate)
                .lte('sale_date', endDate)
                .neq('payment_type', 'pending');

            if (error) throw error;
            return (data || []).reduce((sum: number, sale: any) => sum + Number(sale.total_amount), 0);
        },
    });
}

// Parcelas de uma Venda
export function useSaleInstallments(saleId: string) {
    return useQuery({
        queryKey: ['sale-installments', saleId],
        queryFn: async (): Promise<SaleInstallment[]> => {
            const { data, error } = await supabase
                .from('sale_installments' as any)
                .select('*')
                .eq('sale_id', saleId)
                .order('installment_number');
            if (error) throw error;
            return (data || []) as SaleInstallment[];
        },
        enabled: !!saleId,
    });
}

// =============================================
// HOOKS DE MUTAÇÃO (CREATE/UPDATE/DELETE)
// =============================================

// Criar Venda
export function useCreateSale() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: SaleFormData) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            const dbData = {
                user_id: ownerId,
                category: data.category,
                product_service_id: data.product_service_id || null, // Allow null
                product_name: data.product_name, // Save snapshot name
                quantity: data.quantity,
                unit_price: data.unit_price,
                total_amount: data.total_amount,
                payment_type: data.payment_type,
                installments: data.payment_type === 'cash' || data.payment_type === 'pending' ? 1 : data.installments,
                interest_rate: data.payment_type === 'cash' || data.payment_type === 'pending' ? 0 : data.interest_rate,
                sale_date: data.sale_date,
                team_member_id: data.team_member_id || null,
                professional_id: data.professional_id || null,
                notes: data.notes || null,
                contact_id: data.contact_id || null,
            };

            const { data: result, error } = await supabase
                .from('sales' as any)
                .insert(dbData)
                .select()
                .single();

            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-projection'] });
            queryClient.invalidateQueries({ queryKey: ['sales-by-agent'] });
            queryClient.invalidateQueries({ queryKey: ['sales-by-professional'] });
            queryClient.invalidateQueries({ queryKey: ['top-product-service'] });
            toast.success('Venda registrada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao registrar venda: ' + error.message);
        },
    });
}

// Atualizar Venda
export function useUpdateSale() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<SaleFormData> }) => {
            // First delete existing installments
            await supabase
                .from('sale_installments' as any)
                .delete()
                .eq('sale_id', id);

            // Update sale - trigger will regenerate installments
            const { data: result, error } = await supabase
                .from('sales' as any)
                .update({
                    ...data,
                    installments: data.payment_type === 'cash' ? 1 : data.installments,
                    interest_rate: data.payment_type === 'cash' ? 0 : data.interest_rate,
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-projection'] });
            toast.success('Venda atualizada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar venda: ' + error.message);
        },
    });
}

// Excluir Venda (parcelas excluídas em cascata)
export function useDeleteSale() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('sales' as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-sales'] });
            queryClient.invalidateQueries({ queryKey: ['sales-projection'] });
            queryClient.invalidateQueries({ queryKey: ['sales-by-agent'] });
            queryClient.invalidateQueries({ queryKey: ['sales-by-professional'] });
            toast.success('Venda excluída com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao excluir venda: ' + error.message);
        },
    });
}

// Marcar Parcela como Paga
export function usePayInstallment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, paidDate }: { id: string; paidDate: string }) => {
            const { data: result, error } = await supabase
                .from('sale_installments' as any)
                .update({
                    status: 'paid',
                    paid_date: paidDate,
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sale-installments'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-sales'] });
            queryClient.invalidateQueries({ queryKey: ['monthly-sales'] });
            toast.success('Parcela marcada como paga');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar parcela: ' + error.message);
        },
    });
}
