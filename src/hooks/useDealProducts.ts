import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMDealProduct } from "@/types/crm";
import { toast } from "sonner";

// Buscar produtos de uma negociação
export function useDealProducts(dealId: string) {
    return useQuery({
        queryKey: ['deal-products', dealId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('crm_deal_products' as any)
                .select(`
                    *,
                    product_service:products_services(id, name, type, price)
                `)
                .eq('deal_id', dealId);

            if (error) throw error;
            return data as CRMDealProduct[];
        },
        enabled: !!dealId,
    });
}

// Adicionar produto à negociação
export function useAddDealProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ dealId, productServiceId, quantity, unitPrice }: {
            dealId: string;
            productServiceId: string;
            quantity: number;
            unitPrice: number;
        }) => {
            const { data, error } = await supabase
                .from('crm_deal_products' as any)
                .insert({
                    deal_id: dealId,
                    product_service_id: productServiceId,
                    quantity,
                    unit_price: unitPrice
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_, { dealId }) => {
            queryClient.invalidateQueries({ queryKey: ['deal-products', dealId] });
            queryClient.invalidateQueries({ queryKey: ['crm-deals'] }); // Atualizar deals list se necessário
            toast.success('Produto adicionado à negociação');
        },
        onError: (error) => {
            toast.error('Erro ao adicionar produto: ' + error.message);
        }
    });
}

// Remover produto da negociação
export function useRemoveDealProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('crm_deal_products' as any)
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            // Preciso invalidar deal-products, mas não tenho dealId fácil aqui.
            // Posso invalidar tudo com 'deal-products'
            queryClient.invalidateQueries({ queryKey: ['deal-products'] });
            queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
            toast.success('Produto removido');
        },
        onError: (error) => {
            toast.error('Erro ao remover produto: ' + error.message);
        }
    });
}

// Atualizar quantidade ou preço
export function useUpdateDealProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<CRMDealProduct> }) => {
            const { error } = await supabase
                .from('crm_deal_products' as any)
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['deal-products'] });
            queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
        },
        onError: (error) => {
            toast.error('Erro ao atualizar produto: ' + error.message);
        }
    });
}
