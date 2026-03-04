import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMStage, CRMDeal } from "@/types/crm";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { toast } from "sonner";
import { PaymentTypeModal } from "./PaymentTypeModal";
import { LossReasonModal } from "./LossReasonModal"; // Loss Reason Modal
import { DeliveryLaunchModal } from "@/components/delivery/DeliveryLaunchModal";
import { useOwnerId } from "@/hooks/useOwnerId";


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
    const { data: ownerId } = useOwnerId();

    // Estado de ordem manual por coluna (drag vertical)
    const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({});

    // Estado de ordenação por coluna (asc/desc)
    const [columnSortOrders, setColumnSortOrders] = useState<Record<string, 'asc' | 'desc'>>({});

    const toggleColumnSort = (stageId: string) => {
        setColumnSortOrders(prev => ({
            ...prev,
            [stageId]: prev[stageId] === 'asc' ? 'desc' : 'asc',
        }));
        // Ao mudar a ordenação da coluna, resetar a ordem manual dela
        setLocalOrder(prev => ({ ...prev, [stageId]: [] }));
    };

    // Resetar ordens ao mudar de funil
    useEffect(() => {
        setLocalOrder({});
        setColumnSortOrders({});
    }, [funnelId]);

    // CRM-Sales integration state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [pendingWonDeal, setPendingWonDeal] = useState<{
        deal: any;
        totalValue: number;
        productsCount: number;
        products: any[];
    } | null>(null);
    const [isCreatingSales, setIsCreatingSales] = useState(false);

    // Delivery Launch Modal state
    const [deliveryLaunchOpen, setDeliveryLaunchOpen] = useState(false);
    const [deliveryLaunchData, setDeliveryLaunchData] = useState<{
        contactId: string;
        dealProducts: any[];
        dealTitle: string;
        saleDate: string;
    } | null>(null);

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
                    product_service:products_services(id, name, type, price),
                    assigned_professional:professionals(id, name),
                    deal_products:crm_deal_products(*, product_service:products_services(id, name, type, price))
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

    // Retorna os deals de uma etapa respeitando a ordem local (DnD) ou ordenando por data
    const getOrderedDealsForStage = (stageId: string): CRMDeal[] => {
        const stageDeals = filteredDeals?.filter(deal => deal.stage_id === stageId) || [];
        const localIds = localOrder[stageId];
        if (localIds && localIds.length > 0) {
            const dealMap = new Map(stageDeals.map(d => [d.id, d]));
            const ordered: CRMDeal[] = [];
            for (const id of localIds) {
                const deal = dealMap.get(id);
                if (deal) ordered.push(deal);
            }
            // Adicionar deals novos que ainda não estão na ordem local
            for (const deal of stageDeals) {
                if (!localIds.includes(deal.id)) ordered.push(deal);
            }
            return ordered;
        }
        // Ordenar por created_at conforme a ordenação da coluna (padrão: desc)
        const colSort = columnSortOrders[stageId] ?? 'desc';
        return [...stageDeals].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return colSort === 'asc' ? dateA - dateB : dateB - dateA;
        });
    };

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
                        contact:contacts(id, push_name),
                        deal_products:crm_deal_products(*, product_service:products_services(id, name, type, price))
                    `)
                    .eq('id', dealId)
                    .single();

                if (error) {
                    console.error('Error fetching deal for revenue:', error);
                    toast.error('Erro ao preparar lançamento de receita');
                    return;
                }

                if (fullDeal) {
                    await triggerSalesCreation(fullDeal);
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

        // Reordenação vertical dentro da mesma coluna
        if (startStageId === finishStageId) {
            const currentDeals = getOrderedDealsForStage(startStageId);
            const dealIds = currentDeals.map(d => d.id);
            const [removed] = dealIds.splice(source.index, 1);
            dealIds.splice(destination.index, 0, removed);
            setLocalOrder(prev => ({ ...prev, [startStageId]: dealIds }));
            return;
        }

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

    // NEW - CRM-Sales Integration: Sales creation trigger
    const triggerSalesCreation = async (deal: any) => {
        const totalValue = deal.value || 0;

        const products = deal.deal_products?.length > 0
            ? deal.deal_products
            : (deal.product_service_id ? [{
                product_service_id: deal.product_service_id,
                quantity: deal.quantity || 1,
                unit_price: deal.product_service?.price || deal.value,
                product_service: deal.product_service
            }] : []);

        const productsCount = products.length;

        if (productsCount === 0 && totalValue === 0) {
            toast.warning('Negociação sem produto ou valor definido');
            return;
        }

        setPendingWonDeal({ deal, totalValue, productsCount: productsCount || 1, products });
        setPaymentModalOpen(true);
    };

    // Handle payment type selection
    const handlePaymentConfirm = async (paymentType: 'cash' | 'installment', installments?: number, interestRate?: number) => {
        if (!pendingWonDeal) return;
        await createSalesFromDeal(paymentType, installments, interestRate);
    };

    // Handle cancel - creates as pending
    const handlePaymentCancel = async () => {
        if (!pendingWonDeal) return;
        await createSalesFromDeal('pending');
    };

    // Create sales from deal
    const createSalesFromDeal = async (paymentType: 'cash' | 'installment' | 'pending', installments?: number, interestRate?: number) => {
        if (!pendingWonDeal) return;
        setIsCreatingSales(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error('Usuário não autenticado');

            const { deal, products } = pendingWonDeal;
            const saleDate = new Date().toISOString().split('T')[0];

            // Filter out products without ID
            const validProducts = products.filter((p: any) => p.product_service_id);

            if (validProducts.length === 0) {
                toast.warning('Negociação sem produto/serviço vinculado');
                setIsCreatingSales(false);
                return;
            }

            const salesToCreate = validProducts.map((prod: any) => ({
                user_id: userData.user.id,
                category: prod.product_service?.type === 'service' ? 'service' : 'product',
                product_service_id: prod.product_service_id,
                quantity: prod.quantity || 1,
                unit_price: prod.unit_price || prod.product_service?.price || 0,
                // Total amount for this sale item
                total_amount: (prod.unit_price || prod.product_service?.price || 0) * (prod.quantity || 1),
                payment_type: paymentType,
                installments: paymentType === 'installment' ? (installments || 1) : 1,
                interest_rate: paymentType === 'installment' ? (interestRate || 0) : 0,
                sale_date: saleDate,
                team_member_id: deal.responsible_id || null,
                professional_id: deal.assigned_professional_id || null,
                contact_id: deal.contact_id || null,
                notes: `Venda gerada automaticamente da negociação: ${deal.title}`,
            }));

            const { error } = await supabase
                .from('sales' as any)
                .insert(salesToCreate);

            if (error) throw error;

            toast.success(paymentType === 'pending' ? 'Vendas criadas como pendente' : 'Vendas criadas com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['sales'] });

            // Lançar DeliveryLaunchModal se houver serviços no deal
            const serviceItems = validProducts.filter(
                (p: any) => p.product_service?.type === 'service'
            );
            if (serviceItems.length > 0 && deal.contact_id) {
                setDeliveryLaunchData({
                    contactId: deal.contact_id,
                    dealProducts: serviceItems,
                    dealTitle: deal.title,
                    saleDate,
                });
                setDeliveryLaunchOpen(true);
            }
        } catch (error: any) {
            console.error('Error creating sales:', error);
            toast.error('Erro ao criar venda: ' + error.message);
        } finally {
            setIsCreatingSales(false);
            setPaymentModalOpen(false);
            setPendingWonDeal(null);
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
                        const stageDeals = getOrderedDealsForStage(stage.id);
                        return (
                            <KanbanColumn
                                key={stage.id}
                                stage={stage}
                                deals={stageDeals}
                                sortOrder={columnSortOrders[stage.id] ?? 'desc'}
                                onToggleSort={() => toggleColumnSort(stage.id)}
                            />
                        );
                    })}
                </div>
            </DragDropContext>

            {/* CRM-Sales Integration: Payment Type Modal */}
            <PaymentTypeModal
                open={paymentModalOpen}
                onOpenChange={setPaymentModalOpen}
                dealTitle={pendingWonDeal?.deal?.title || ''}
                totalValue={pendingWonDeal?.totalValue || 0}
                productsCount={pendingWonDeal?.productsCount || 0}
                onConfirm={handlePaymentConfirm}
                onCancel={handlePaymentCancel}
                isLoading={isCreatingSales}
            />

            {/* Loss Reason Modal */}
            <LossReasonModal
                open={lossReasonModalOpen}
                onOpenChange={setLossReasonModalOpen}
                dealTitle={pendingLossDeal?.dealTitle || ''}
                onConfirm={handleLossReasonConfirm}
                onCancel={handleLossReasonCancel}
            />

            {/* Delivery Launch Modal */}
            {deliveryLaunchData && ownerId && (
                <DeliveryLaunchModal
                    open={deliveryLaunchOpen}
                    onOpenChange={(open) => {
                        setDeliveryLaunchOpen(open);
                        if (!open) setDeliveryLaunchData(null);
                    }}
                    contactId={deliveryLaunchData.contactId}
                    dealProducts={deliveryLaunchData.dealProducts}
                    dealTitle={deliveryLaunchData.dealTitle}
                    saleDate={deliveryLaunchData.saleDate}
                    ownerId={ownerId}
                />
            )}
        </>
    );
}
