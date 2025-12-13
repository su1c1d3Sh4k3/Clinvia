import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// =============================================
// Types
// =============================================

export interface Opportunity {
    id: string;
    user_id: string;
    type: 'service' | 'product';
    contact_id: string;
    product_service_id: string | null;
    professional_id: string | null;
    appointment_id: string | null;
    revenue_id: string | null;
    reference_date: string;
    alert_date: string;
    assigned_to: string | null;
    claimed_by: string | null;
    claimed_at: string | null;
    dismissed: boolean;
    created_at: string;
    // Joined data
    contact?: {
        id: string;
        push_name: string | null;
        profile_pic_url: string | null;
        number: string;
    };
    product_service?: {
        id: string;
        name: string;
        type: 'product' | 'service';
    };
    professional?: {
        id: string;
        name: string;
        photo_url: string | null;
    };
}

// =============================================
// Hooks
// =============================================

export function useOpportunities() {
    return useQuery({
        queryKey: ["opportunities"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("opportunities" as any)
                .select(`
                    *,
                    contact:contacts!contact_id (
                        id,
                        push_name,
                        profile_pic_url,
                        number
                    ),
                    product_service:products_services!product_service_id (
                        id,
                        name,
                        type
                    ),
                    professional:professionals!professional_id (
                        id,
                        name,
                        photo_url
                    )
                `)
                .eq('dismissed', false)
                .is('claimed_by', null)
                .lte('alert_date', new Date().toISOString().split('T')[0])
                .order('alert_date', { ascending: true });

            if (error) throw error;
            return data as Opportunity[];
        },
        refetchInterval: 60000, // Refetch every minute
    });
}

export function useClaimOpportunity() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ opportunityId }: { opportunityId: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const { error } = await supabase
                .from("opportunities" as any)
                .update({
                    claimed_by: user.id,
                    claimed_at: new Date().toISOString()
                })
                .eq("id", opportunityId);

            if (error) throw error;
            return { opportunityId, userId: user.id };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["opportunities"] });
            toast({
                title: "Oportunidade assumida!",
                description: "Você assumiu esta oportunidade.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao assumir oportunidade",
                description: error.message,
                variant: "destructive",
            });
        },
    });
}

export function useDismissOpportunity() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ opportunityId }: { opportunityId: string }) => {
            const { error } = await supabase
                .from("opportunities" as any)
                .update({ dismissed: true })
                .eq("id", opportunityId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["opportunities"] });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao dispensar oportunidade",
                description: error.message,
                variant: "destructive",
            });
        },
    });
}

export function useGenerateOpportunities() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke("generate-opportunities", {});
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["opportunities"] });
            const total = (data?.serviceOpportunities || 0) + (data?.productOpportunities || 0);
            if (total > 0) {
                toast({
                    title: "Oportunidades geradas!",
                    description: `${total} nova(s) oportunidade(s) encontrada(s).`,
                });
            }
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao gerar oportunidades",
                description: error.message,
                variant: "destructive",
            });
        },
    });
}

// =============================================
// Helper functions for generating messages
// =============================================

export function generateServiceOpportunityMessage(
    contactName: string | null,
    serviceName: string,
    serviceDate: string,
    professionalName: string | null
): string {
    const firstName = contactName?.split(' ')[0] || 'Cliente';
    const formattedDate = new Date(serviceDate).toLocaleDateString('pt-BR');

    // Determine gender (simple heuristic based on name ending)
    const isFemale = professionalName?.toLowerCase().endsWith('a') &&
        !professionalName?.toLowerCase().endsWith('ia');
    const article = isFemale ? 'a' : 'o';
    const professionalTitle = professionalName || 'nosso profissional';

    return `Olá ${firstName}, no dia ${formattedDate} você realizou um serviço de ${serviceName} com ${article} ${professionalTitle}, e gostaríamos de saber se podemos agendar um novo serviço para você?`;
}

export function generateProductOpportunityMessage(
    contactName: string | null,
    productName: string,
    purchaseDate: string
): string {
    const firstName = contactName?.split(' ')[0] || 'Cliente';
    const formattedDate = new Date(purchaseDate).toLocaleDateString('pt-BR');

    return `Olá ${firstName}, no dia ${formattedDate} você comprou um ${productName} conosco, e gostaríamos de saber o que achou do produto e se poderíamos te ajudar com outro ${productName}?`;
}
