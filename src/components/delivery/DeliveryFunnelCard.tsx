import { useState, useRef } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Draggable } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Calendar, MessageCircle, Package, User, Clock } from "lucide-react";
import { Delivery } from "@/types/delivery";
import { DeliveryViewModal } from "./DeliveryViewModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { DealConversationModal } from "@/components/crm/DealConversationModal";
import { useQueryClient } from "@tanstack/react-query";

interface DeliveryFunnelCardProps {
    delivery: Delivery;
    index: number;
}

// Mesma lógica do DeliveryCard — cor de status pela borda esquerda
function getStatusColor(d: Delivery): string {
    const isConcluded = d.stage === "procedimento_concluido";
    const isCancelled = d.stage === "procedimento_cancelado";
    if (isConcluded) return "#10B981";
    if (isCancelled) return "#EF4444";

    const today = startOfDay(new Date());
    const contactDate = d.contact_date ? startOfDay(parseISO(d.contact_date)) : null;
    const deadlineDate = d.deadline_date ? startOfDay(parseISO(d.deadline_date)) : null;

    if (deadlineDate) {
        const alertDate = subDays(deadlineDate, 5);
        if (today >= alertDate) return "#EF4444"; // red
    }
    if (contactDate && today >= contactDate) return "#F59E0B"; // amber
    return "#10B981"; // green
}

export function DeliveryFunnelCard({ delivery: d, index }: DeliveryFunnelCardProps) {
    const queryClient = useQueryClient();
    const [viewOpen, setViewOpen] = useState(false);
    const [appointmentOpen, setAppointmentOpen] = useState(false);
    const chatTriggerRef = useRef<HTMLDivElement>(null);

    const borderColor = getStatusColor(d);
    const patient = d.patient;
    const service = d.service;
    const professional = d.professional;

    const handleChatClick = () => {
        const btn = chatTriggerRef.current?.querySelector<HTMLButtonElement>("button");
        btn?.click();
    };

    const onUpdated = () => queryClient.invalidateQueries({ queryKey: ["deliveries"] });

    return (
        <>
            <Draggable draggableId={d.id} index={index}>
                {(provided) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="mb-3 group"
                    >
                        <Card
                            className="hover:shadow-md transition-all cursor-grab active:cursor-grabbing border-l-4 overflow-hidden"
                            style={{ borderLeftColor: borderColor }}
                        >
                            <CardContent className="p-3">
                                {/* Título: nome do paciente */}
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-semibold text-sm line-clamp-2 leading-tight flex-1 pr-1">
                                        {patient?.nome || "—"}
                                    </h4>
                                </div>

                                {/* Paciente: foto + telefone */}
                                <div className="flex items-center gap-2 mb-2">
                                    {patient?.profile_pic_url ? (
                                        <img
                                            src={patient.profile_pic_url}
                                            alt={patient.nome}
                                            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                                            {patient?.nome?.[0]?.toUpperCase() || "?"}
                                        </div>
                                    )}
                                    <span className="text-xs text-black dark:text-muted-foreground truncate max-w-[140px]">
                                        {patient?.telefone || "Sem telefone"}
                                    </span>
                                </div>

                                {/* Serviço e Profissional */}
                                <div className="flex flex-col gap-1 mb-3">
                                    {service && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Package className="h-3 w-3 flex-shrink-0" />
                                            <span className="truncate">{service.name}</span>
                                        </span>
                                    )}
                                    {professional && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <User className="h-3 w-3 flex-shrink-0" />
                                            <span className="truncate">{professional.name}</span>
                                        </span>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border/50">
                                    <div className="flex justify-between items-center">
                                        {/* Datas */}
                                        <div className="flex flex-col gap-0.5">
                                            {d.sale_date && (
                                                <div className="flex items-center gap-1 text-[10px] text-black dark:text-muted-foreground">
                                                    <Calendar className="h-3 w-3 flex-shrink-0" />
                                                    Venda: {format(parseISO(d.sale_date), "dd/MM/yy")}
                                                </div>
                                            )}
                                            {d.deadline_date && (
                                                <div
                                                    className="flex items-center gap-1 text-[10px] font-medium"
                                                    style={{ color: borderColor }}
                                                >
                                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                                    Limite: {format(parseISO(d.deadline_date), "dd/MM/yy")}
                                                </div>
                                            )}
                                        </div>

                                        {/* Botões de ação */}
                                        <div className="flex gap-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-black dark:text-muted-foreground"
                                                title="Ver detalhes"
                                                onClick={() => setViewOpen(true)}
                                            >
                                                <Eye className="h-3 w-3" />
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-black dark:text-muted-foreground"
                                                title="Agendar procedimento"
                                                onClick={() => setAppointmentOpen(true)}
                                                disabled={!patient?.contact_id}
                                            >
                                                <Calendar className="h-3 w-3" />
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-black dark:text-muted-foreground"
                                                title="Ver conversa"
                                                onClick={handleChatClick}
                                                disabled={!patient?.contact_id}
                                            >
                                                <MessageCircle className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </Draggable>

            {/* Hidden DealConversationModal trigger */}
            {patient?.contact_id && (
                <div ref={chatTriggerRef} className="hidden" aria-hidden="true">
                    <DealConversationModal
                        contactId={patient.contact_id}
                        contactName={patient.nome}
                    />
                </div>
            )}

            <DeliveryViewModal
                delivery={d}
                open={viewOpen}
                onOpenChange={setViewOpen}
                onUpdated={onUpdated}
            />

            {patient?.contact_id && (
                <AppointmentModal
                    open={appointmentOpen}
                    onOpenChange={setAppointmentOpen}
                    defaultContactId={patient.contact_id}
                    defaultContactName={patient.nome}
                    defaultContactPhone={patient.telefone}
                    defaultProfessionalId={d.professional_id}
                    defaultServiceId={d.service_id}
                    hideTypeTabs
                    onAppointmentCreated={onUpdated}
                />
            )}
        </>
    );
}
