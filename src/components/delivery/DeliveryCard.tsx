import { useState, useRef } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Eye, Calendar, MessageCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Delivery } from "@/types/delivery";
import { DeliveryViewModal } from "./DeliveryViewModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { DealConversationModal } from "@/components/crm/DealConversationModal";

interface DeliveryCardProps {
    delivery: Delivery;
    onUpdated: () => void;
}

function getStatusColor(d: Delivery): "green" | "yellow" | "red" {
    const today = startOfDay(new Date());
    const contactDate = d.contact_date ? startOfDay(parseISO(d.contact_date)) : null;
    const deadlineDate = d.deadline_date ? startOfDay(parseISO(d.deadline_date)) : null;

    if (deadlineDate) {
        const alertDate = subDays(deadlineDate, 5);
        if (today >= alertDate) return "red";
    }
    if (contactDate && today >= contactDate) return "yellow";
    return "green";
}

// Border-left color (4px) para o indicador de urgência
const borderColorMap = {
    green: "border-l-emerald-500",
    yellow: "border-l-amber-400",
    red: "border-l-red-500",
};

function PatientAvatar({ patient }: { patient: NonNullable<Delivery["patient"]> }) {
    const photoUrl = patient.profile_pic_url;
    if (photoUrl) {
        return (
            <img
                src={photoUrl}
                alt={patient.nome}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-1 ring-border"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
        );
    }
    return (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 ring-1 ring-border">
            <span className="text-[11px] font-bold text-primary uppercase">
                {patient.nome?.charAt(0) || "?"}
            </span>
        </div>
    );
}

export function DeliveryCard({ delivery: d, onUpdated }: DeliveryCardProps) {
    const [viewOpen, setViewOpen] = useState(false);
    const [appointmentOpen, setAppointmentOpen] = useState(false);
    const chatTriggerRef = useRef<HTMLDivElement>(null);

    const isConcluded = d.stage === "procedimento_concluido";
    const isCancelled = d.stage === "procedimento_cancelado";
    const isFinal = isConcluded || isCancelled;

    const statusColor = isFinal ? "green" : getStatusColor(d);

    // Cores adaptadas para light e dark mode
    const cardBg = isConcluded
        ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60"
        : isCancelled
        ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60"
        : `bg-card border border-border border-l-4 ${borderColorMap[statusColor]}`;

    const patient = d.patient;
    const service = d.service;
    const professional = d.professional;

    const handleChatClick = () => {
        const btn = chatTriggerRef.current?.querySelector<HTMLButtonElement>("button");
        btn?.click();
    };

    return (
        <>
            <div className={`w-full rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing select-none overflow-hidden ${cardBg}`}>

                {/* Linha 1: Avatar + Nome + Telefone */}
                <div className="flex items-center gap-2 min-w-0">
                    {patient ? (
                        <PatientAvatar patient={patient} />
                    ) : (
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-border">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate leading-tight text-foreground">
                            {patient?.nome || "—"}
                        </p>
                        {patient?.telefone && (
                            <p className="text-[11px] text-muted-foreground truncate leading-tight">
                                {patient.telefone}
                            </p>
                        )}
                    </div>
                </div>

                {/* Linha 2: Serviço */}
                {service && (
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide truncate mt-2 leading-tight">
                        ★ {service.name}
                    </p>
                )}

                {/* Linha 3: Profissional */}
                {professional && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                        {professional.name}
                    </p>
                )}

                {/* Linha 4: Datas (inline compacto) */}
                {(d.sale_date || d.contact_date || d.deadline_date) && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-muted-foreground mt-1.5">
                        {d.sale_date && (
                            <span className="whitespace-nowrap">
                                Venda: <span className="text-foreground/70">{format(parseISO(d.sale_date), "dd/MM/yy")}</span>
                            </span>
                        )}
                        {d.contact_date && (
                            <span className="whitespace-nowrap">
                                Contato: <span className="text-foreground/70">{format(parseISO(d.contact_date), "dd/MM/yy")}</span>
                            </span>
                        )}
                        {d.deadline_date && (
                            <span className="whitespace-nowrap">
                                Limite: <span className={statusColor === "red" ? "text-red-500 font-semibold" : "text-foreground/70"}>
                                    {format(parseISO(d.deadline_date), "dd/MM/yy")}
                                </span>
                            </span>
                        )}
                    </div>
                )}

                {/* Divisor fino */}
                <div className="border-t border-border/40 mt-2 mb-1" />

                {/* Botões de ação */}
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded"
                        title="Ver detalhes"
                        onClick={() => setViewOpen(true)}
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded"
                        title="Agendar procedimento"
                        onClick={() => setAppointmentOpen(true)}
                        disabled={!patient?.contact_id}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded"
                        title="Ver conversa"
                        onClick={handleChatClick}
                        disabled={!patient?.contact_id}
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

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
