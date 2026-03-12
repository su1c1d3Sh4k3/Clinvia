import { useState } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useQueryClient } from "@tanstack/react-query";
import { isWithinInterval, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Delivery, DeliveryFiltersState, DELIVERY_STAGES, DeliveryStage } from "@/types/delivery";
import { DeliveryColumn } from "./DeliveryColumn";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateDealModal } from "@/components/crm/CreateDealModal";
import { type ProductItem } from "@/components/crm/DealProductsForm";

interface RecurrenceDealConfig {
    title: string;
    funnelId: string;
    stageId: string;
    contact?: { id: string; push_name: string; number?: string };
    responsibleId?: string;
    assignedProfessionalId?: string;
    products: ProductItem[];
    description: string;
}

interface DeliveryBoardProps {
    deliveries: Delivery[];
    filters: DeliveryFiltersState;
    patientSearch?: string;
    ownerId: string;
}

export function DeliveryBoard({ deliveries, filters, patientSearch, ownerId }: DeliveryBoardProps) {
    const queryClient = useQueryClient();

    // Estados para o fluxo de recorrência
    const [recurrenceDelivery, setRecurrenceDelivery] = useState<Delivery | null>(null);
    const [showRecurrenceConfirm, setShowRecurrenceConfirm] = useState(false);
    const [showRecurrenceDeal, setShowRecurrenceDeal] = useState(false);
    const [recurrenceDealConfig, setRecurrenceDealConfig] = useState<RecurrenceDealConfig | null>(null);

    // --- Frontend filtering ---
    const filtered = deliveries.filter((d) => {
        if (filters.professionalId && d.professional_id !== filters.professionalId) return false;
        if (filters.patientId && d.patient_id !== filters.patientId) return false;
        if (patientSearch?.trim()) {
            const search = patientSearch.trim().toLowerCase();
            if (!d.patient?.nome?.toLowerCase().includes(search)) return false;
        }
        if (filters.period?.from) {
            const date = new Date(d.created_at);
            if (
                !isWithinInterval(date, {
                    start: filters.period.from,
                    end: filters.period.to,
                })
            )
                return false;
        }
        return true;
    });

    // --- Drag and drop ---
    const onDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const deliveryId = result.draggableId;
        const newStage = result.destination.droppableId as DeliveryStage;
        const oldStage = result.source.droppableId as DeliveryStage;
        if (newStage === oldStage && result.source.index === result.destination.index) return;

        // Optimistic UI update
        queryClient.setQueryData<Delivery[]>(["deliveries", ownerId], (prev) =>
            prev?.map((d) => (d.id === deliveryId ? { ...d, stage: newStage } : d)) ?? []
        );

        const { error } = await supabase
            .from("deliveries")
            .update({ stage: newStage })
            .eq("id", deliveryId);

        if (error) {
            toast.error("Erro ao mover procedimento");
            // Revert optimistic update
            queryClient.invalidateQueries({ queryKey: ["deliveries", ownerId] });
            return;
        }

        // Disparar modal de recorrência quando card chega em "Procedimento Concluído"
        if (newStage === "procedimento_concluido") {
            const allDeliveries = queryClient.getQueryData<Delivery[]>(["deliveries", ownerId]);
            const moved = allDeliveries?.find((d) => d.id === deliveryId);
            if (moved) {
                setRecurrenceDelivery(moved);
                setShowRecurrenceConfirm(true);
            }
        }
    };

    // --- Handler do botão "Sim" no modal de confirmação ---
    const handleConfirmRecurrence = async () => {
        if (!recurrenceDelivery || !ownerId) return;
        setShowRecurrenceConfirm(false);

        // 1. Buscar funil "Recorrência" do usuário
        const { data: funnel } = await supabase
            .from("crm_funnels" as any)
            .select("id")
            .eq("user_id", ownerId)
            .eq("name", "Recorrência")
            .single();

        if (!funnel) {
            toast.error("Funil 'Recorrência' não encontrado. Verifique o CRM.");
            return;
        }

        // 2. Buscar etapa "Apto para avaliação" dentro do funil
        const { data: stage } = await supabase
            .from("crm_stages" as any)
            .select("id")
            .eq("funnel_id", (funnel as any).id)
            .eq("name", "Apto para avaliação")
            .single();

        if (!stage) {
            toast.error("Etapa 'Apto para avaliação' não encontrada no funil Recorrência.");
            return;
        }

        // 3. Montar configuração do deal pré-preenchido
        const d = recurrenceDelivery;
        const baseTitle = [d.patient?.nome, d.service?.name].filter(Boolean).join(" - ");
        const today = format(new Date(), "dd/MM/yyyy");

        const products: ProductItem[] = d.service_id
            ? [
                  {
                      id: crypto.randomUUID(),
                      category: "service" as const,
                      productServiceId: d.service_id,
                      quantity: 1,
                      unitPrice: d.service?.price ?? 0,
                      name: d.service?.name ?? "",
                  },
              ]
            : [];

        setRecurrenceDealConfig({
            title: `${baseTitle} (recorrência)`,
            funnelId: (funnel as any).id,
            stageId: (stage as any).id,
            contact: d.patient?.contact_id
                ? {
                      id: d.patient.contact_id,
                      push_name: d.patient.nome,
                      number: d.patient.telefone,
                  }
                : undefined,
            responsibleId: d.responsible_id ?? undefined,
            assignedProfessionalId: d.professional_id ?? undefined,
            products,
            description: `Negociação gerada a partir do procedimento concluído no dia ${today}, cliente aguardando avaliação para recorrência`,
        });

        setShowRecurrenceDeal(true);
    };

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex h-full gap-4 overflow-x-auto pb-6 px-2 crm-scrollbar transition-colors">
                    {DELIVERY_STAGES.map((stage) => {
                        const stageDeliveries = filtered.filter((d) => d.stage === stage.key);
                        return (
                            <DeliveryColumn
                                key={stage.key}
                                stageKey={stage.key}
                                stageLabel={stage.label}
                                stageColor={stage.color}
                                deliveries={stageDeliveries}
                                onUpdated={() =>
                                    queryClient.invalidateQueries({ queryKey: ["deliveries", ownerId] })
                                }
                            />
                        );
                    })}
                </div>
            </DragDropContext>

            {/* Modal de confirmação de recorrência */}
            <AlertDialog open={showRecurrenceConfirm} onOpenChange={setShowRecurrenceConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deseja gerar uma oportunidade de recorrência?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O procedimento foi concluído. Deseja criar uma negociação de recorrência para este cliente?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                setShowRecurrenceConfirm(false);
                                setRecurrenceDelivery(null);
                            }}
                        >
                            Não
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmRecurrence}>Sim</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* CreateDealModal pré-preenchido com dados do delivery */}
            {recurrenceDealConfig && (
                <CreateDealModal
                    open={showRecurrenceDeal}
                    onOpenChange={(v) => {
                        setShowRecurrenceDeal(v);
                        if (!v) setRecurrenceDealConfig(null);
                    }}
                    defaultTitle={recurrenceDealConfig.title}
                    defaultFunnelId={recurrenceDealConfig.funnelId}
                    defaultStageId={recurrenceDealConfig.stageId}
                    defaultContact={recurrenceDealConfig.contact}
                    defaultResponsibleId={recurrenceDealConfig.responsibleId}
                    defaultAssignedProfessionalId={recurrenceDealConfig.assignedProfessionalId}
                    defaultProducts={recurrenceDealConfig.products}
                    defaultPriority="high"
                    defaultDescription={recurrenceDealConfig.description}
                />
            )}
        </>
    );
}
