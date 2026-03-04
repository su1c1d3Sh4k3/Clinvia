import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Delivery, DELIVERY_STAGES } from "@/types/delivery";
import { User, Calendar, FileText, Briefcase, UserCheck, StickyNote } from "lucide-react";

interface DeliveryViewModalProps {
    delivery: Delivery;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated?: () => void;
}

function InfoRow({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value?: string | null;
}) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
                <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
                <p className="text-sm font-medium">{value}</p>
            </div>
        </div>
    );
}

function PatientAvatar({ patient }: { patient: NonNullable<Delivery["patient"]> }) {
    const photoUrl = patient.contacts?.profile_pic_url || patient.profile_pic_url;
    if (photoUrl) {
        return (
            <img
                src={photoUrl}
                alt={patient.nome}
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
        );
    }
    return (
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <span className="text-base font-bold text-muted-foreground uppercase">
                {patient.nome?.charAt(0) || "?"}
            </span>
        </div>
    );
}

export function DeliveryViewModal({
    delivery: d,
    open,
    onOpenChange,
}: DeliveryViewModalProps) {
    const stageInfo = DELIVERY_STAGES.find((s) => s.key === d.stage);
    const patient = d.patient;
    const service = d.service;
    const professional = d.professional;
    const responsible = d.responsible;

    const formatDate = (dateStr?: string | null) =>
        dateStr ? format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR }) : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Detalhes do Procedimento</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    {/* Stage Badge */}
                    {stageInfo && (
                        <div>
                            <Badge
                                style={{ backgroundColor: stageInfo.color }}
                                className="text-white text-xs"
                            >
                                {stageInfo.label}
                            </Badge>
                        </div>
                    )}

                    {/* Patient */}
                    {patient && (
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <PatientAvatar patient={patient} />
                            <div>
                                <p className="font-semibold">{patient.nome}</p>
                                {patient.telefone && (
                                    <p className="text-sm text-muted-foreground">{patient.telefone}</p>
                                )}
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Service */}
                    <InfoRow
                        icon={Briefcase}
                        label="Serviço / Procedimento"
                        value={service ? `${service.name}${service.price ? ` — R$ ${Number(service.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}` : null}
                    />

                    {/* Professional */}
                    <InfoRow
                        icon={User}
                        label="Profissional"
                        value={professional?.name}
                    />

                    {/* Responsible */}
                    <InfoRow
                        icon={UserCheck}
                        label="Responsável"
                        value={responsible?.name}
                    />

                    <Separator />

                    {/* Dates */}
                    <div className="grid grid-cols-3 gap-3">
                        {d.sale_date && (
                            <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
                                <Calendar className="w-4 h-4 text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">Venda</p>
                                <p className="text-sm font-medium">{formatDate(d.sale_date)}</p>
                            </div>
                        )}
                        {d.contact_date && (
                            <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
                                <Calendar className="w-4 h-4 text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">Contato</p>
                                <p className="text-sm font-medium">{formatDate(d.contact_date)}</p>
                            </div>
                        )}
                        {d.deadline_date && (
                            <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
                                <Calendar className="w-4 h-4 text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">Limite</p>
                                <p className="text-sm font-medium">{formatDate(d.deadline_date)}</p>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    {d.notes && (
                        <>
                            <Separator />
                            <div className="flex items-start gap-3">
                                <StickyNote className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                                    <p className="text-sm whitespace-pre-wrap">{d.notes}</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Metadata */}
                    <Separator />
                    <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Criado em</p>
                            <p className="text-sm">
                                {format(parseISO(d.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
