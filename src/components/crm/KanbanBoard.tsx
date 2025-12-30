import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMStage, CRMDeal } from "@/types/crm";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { toast } from "sonner";
import { RevenueModal } from "@/components/financial/RevenueModal";
import { LossReasonModal } from "./LossReasonModal"; // Loss Reason Modal
import type { RevenueFormData, PaymentMethod, FinancialStatus } from "@/types/financial";

import { CRMFiltersState } from "./CRMFilters";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";

interface KanbanBoardProps {
    funnelId: string;
    filters?: CRMFiltersState;
}

export function KanbanBoard({ funnelId, filters }: KanbanBoardProps) {
    const queryClient = useQueryClient();

    // Hooks para verificar role do usuário e obter team_member_id
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();

    // CRM-Financial integration state
    const [revenueModalOpen, setRevenueModalOpen] = useState(false);
    const [prefillRevenueData, setPrefillRevenueData] = useState<Partial<RevenueFormData> | null>(null);

    // Loss Reason Modal state
    const [lossReasonModalOpen, setLossReasonModalOpen] = useState(false);
    const [pendingLossDeal, setPendingLossDeal] = useState<{
        dealId: string;
        dealTitle: string;
        fromStageId: string;
        toStageId: string;
    } | null>(null);

    const { data: stages, isLoading: isLoadingStages } = useQuery({
        queryKey: ["crm-stages", funnelId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", funnelId)
                .order("position", { ascending: true });

            if (error) throw error;
            return data as unknown as CRMStage[];
        },
    });

    const { data: deals, isLoading: isLoadingDeals } = useQuery({
        queryKey: ["crm-deals", funnelId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deals" as any)
                .select(`
                    *, 
                    contacts(push_name, number, profile_pic_url, instagram_id, contact_tags(tags(id, name, color))),
                    product_service:products_services(id, name, type),
                    assigned_professional:professionals(id, name)
                `)
                .eq("funnel_id", funnelId);

            if (error) throw error;
            return data as unknown as CRMDeal[];
        },
    });

    const filteredDeals = deals?.filter(deal => {
        // FILTRO OBRIGATÓRIO PARA AGENTES:
        // Se o usuário é 'agent', só mostra deals atribuídos a ele
        if (userRole === 'agent' && currentTeamMember) {
            if (deal.responsible_id !== currentTeamMember.id) {
                return false;
            }
        }

        // Filtros opcionais de UI (tag, responsável manual, data)
        if (!filters) return true;

        // Filter by Tag
        if (filters.tagId) {
            const hasTag = deal.contacts?.contact_tags?.some((ct: any) => ct.tags.id === filters.tagId);
            if (!hasTag) return false;
        }

        // Filter by Responsible (filtro manual da UI)
        if (filters.responsibleId) {
            if (deal.responsible_id !== filters.responsibleId) return false;
        }

        // Filter by Date
        if (filters.dateRange?.from) {
            const dealDate = new Date(deal.created_at);
            const from = startOfDay(filters.dateRange.from);
            const to = filters.dateRange.to ? endOfDay(filters.dateRange.to) : endOfDay(from);

            if (!isWithinInterval(dealDate, { start: from, end: to })) {
                return false;
            }
        }

        return true;
    });

    const moveDealMutation = useMutation({
        mutationFn: async ({ dealId, stageId, fromStageId }: { dealId: string; stageId: string; fromStageId: string }) => {
            // Get positions of both stages to determine if this is a forward movement
            const fromStage = stages?.find(s => s.id === fromStageId);
            const toStage = stages?.find(s => s.id === stageId);

            // Update the deal's stage
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ stage_id: stageId })
                .eq("id", dealId);

            if (error) throw error;

            // If moving forward (to a stage with higher position), increment the history counter
            if (fromStage && toStage && toStage.position > fromStage.position) {
                const { error: historyError } = await supabase
                    .from("crm_stages" as any)
                    .update({ history: (toStage.history || 0) + 1 })
                    .eq("id", stageId);

                if (historyError) {
                    console.error("Error updating stage history:", historyError);
                }
            }
        },
        onSuccess: async (_, { dealId, stageId }) => {
            // Invalidate queries first
            queryClient.invalidateQueries({ queryKey: ["crm-deals", funnelId] });
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });

            // CRM-Financial Integration: Check if new stage is "Ganho"
            const newStage = stages?.find(s => s.id === stageId);

            if (newStage && newStage.name === 'Ganho') {
                toast.success("Negociação ganha! 🎉");

                // Fetch full deal with all relations for revenue creation
                const { data: fullDeal, error } = await supabase
                    .from('crm_deals')
                    .select(`
                        *,
                        product_service:products_services(id, name, type, price),
                        assigned_professional:professionals(id, name, role),
                        contact:contacts(id, push_name)
                    `)
                    .eq('id', dealId)
                    .single();

                if (error) {
                    console.error('Error fetching deal for revenue:', error);
                    toast.error('Erro ao preparar lançamento de receita');
                    return;
                }

                if (fullDeal) {
                    await triggerRevenueCreation(fullDeal);
                }
            }
        },
        onError: () => {
            toast.error("Erro ao mover negociação");
        }
    });

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const startStageId = source.droppableId;
        const finishStageId = destination.droppableId;

        if (startStageId !== finishStageId) {
            // Check if moving to "Perdido" stage
            const targetStage = stages?.find(s => s.id === finishStageId);

            if (targetStage?.name === 'Perdido') {
                // Find the deal to get its title
                const deal = deals?.find(d => d.id === draggableId);

                // Open Loss Reason Modal instead of moving directly
                setPendingLossDeal({
                    dealId: draggableId,
                    dealTitle: deal?.title || 'Negociação',
                    fromStageId: startStageId,
                    toStageId: finishStageId,
                });
                setLossReasonModalOpen(true);
                return; // Don't move yet, wait for modal confirmation
            }

            // Normal movement (not to Perdido)
            moveDealMutation.mutate({
                dealId: draggableId,
                stageId: finishStageId,
                fromStageId: startStageId
            });
        }
    };

    // Handle Loss Reason confirmation
    const handleLossReasonConfirm = async (reason: string, otherDescription?: string) => {
        if (!pendingLossDeal) return;

        try {
            console.log('Saving loss reason:', {
                dealId: pendingLossDeal.dealId,
                toStageId: pendingLossDeal.toStageId,
                reason,
                otherDescription
            });

            // Update deal with loss reason and new stage
            const updateData: Record<string, any> = {
                stage_id: pendingLossDeal.toStageId,
                loss_reason: reason,
            };

            // Only set loss_reason_other if reason is 'other'
            if (reason === 'other' && otherDescription) {
                updateData.loss_reason_other = otherDescription;
            }

            const { data, error } = await supabase
                .from('crm_deals' as any)
                .update(updateData)
                .eq('id', pendingLossDeal.dealId)
                .select();

            console.log('Update result:', { data, error });

            if (error) {
                console.error('Supabase error details:', error);
                throw error;
            }

            toast.success('Negociação marcada como perdida');
            queryClient.invalidateQueries({ queryKey: ['crm-deals', funnelId] });
            queryClient.invalidateQueries({ queryKey: ['crm-stages', funnelId] });
        } catch (error: any) {
            console.error('Error updating deal with loss reason:', error);
            toast.error(`Erro: ${error.message || 'Erro ao registrar motivo'}`);
        } finally {
            setLossReasonModalOpen(false);
            setPendingLossDeal(null);
        }
    };

    // Handle Loss Reason cancel - deal stays in original stage
    const handleLossReasonCancel = () => {
        setPendingLossDeal(null);
        // Deal is not moved, stays in original position
    };

    // NEW - CRM-Financial Integration: Revenue creation trigger
    const triggerRevenueCreation = async (deal: any) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error('User not authenticated');

            // Get or create category based on product/service type
            let categoryId: string | undefined;

            if (deal.product_service) {
                // Category name: 'Produto' or 'Serviço'
                const categoryName = deal.product_service.type === 'product' ? 'Produto' : 'Serviço';

                const { data: category } = await supabase
                    .from('revenue_categories')
                    .select('id')
                    .eq('name', categoryName)
                    .eq('user_id', userData.user.id)
                    .single();

                if (!category) {
                    // Create category if doesn't exist
                    const { data: newCategory } = await supabase
                        .from('revenue_categories')
                        .insert({ name: categoryName, user_id: userData.user.id })
                        .select('id')
                        .single();

                    categoryId = newCategory?.id;
                } else {
                    categoryId = category.id;
                }
            }

            // Prepare pre-filled revenue data
            setPrefillRevenueData({
                category_id: categoryId,
                item: deal.product_service?.name || deal.title,
                product_service_id: deal.product_service?.id || '', // NEW - pass ID for select
                description: deal.description || '',
                amount: deal.value,
                due_date: new Date().toISOString().split('T')[0],
                team_member_id: deal.responsible_id || '',
                professional_id: deal.assigned_professional_id || '',
                contact_id: deal.contact_id || '',
                payment_method: 'pix' as PaymentMethod,
                status: 'pending' as FinancialStatus,
                is_recurring: false,
            });

            // Open modal for user review
            setRevenueModalOpen(true);

        } catch (error) {
            console.error('Error preparing revenue data:', error);
            toast.error('Erro ao preparar lançamento de receita');
        }
    };

    if (isLoadingStages || isLoadingDeals) {
        return <div className="flex items-center justify-center h-full">Carregando quadro...</div>;
    }

    if (!stages || stages.length === 0) {
        return <div className="flex items-center justify-center h-full text-muted-foreground">Este funil não possui etapas.</div>;
    }

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex h-full gap-4 overflow-x-auto pb-6 px-2 crm-scrollbar transition-colors">
                    {stages.map((stage) => {
                        const stageDeals = filteredDeals?.filter(deal => deal.stage_id === stage.id) || [];
                        return (
                            <KanbanColumn
                                key={stage.id}
                                stage={stage}
                                deals={stageDeals}
                            />
                        );
                    })}
                </div>
            </DragDropContext>

            {/* CRM-Financial Integration: Revenue Modal */}
            <RevenueModal
                open={revenueModalOpen}
                onOpenChange={setRevenueModalOpen}
                revenue={prefillRevenueData as any}
            />

            {/* Loss Reason Modal */}
            <LossReasonModal
                open={lossReasonModalOpen}
                onOpenChange={setLossReasonModalOpen}
                dealTitle={pendingLossDeal?.dealTitle || ''}
                onConfirm={handleLossReasonConfirm}
                onCancel={handleLossReasonCancel}
            />
        </>
    );
}
