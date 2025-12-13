import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CRMDeal } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Calendar, User, DollarSign, Tag, AlertCircle, FileText } from "lucide-react";
import { DealNotesModal } from "./DealNotesModal";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

const TIMEZONE = "America/Sao_Paulo";

interface ViewDealModalProps {
    deal: CRMDeal;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ViewDealModal({ deal, open, onOpenChange }: ViewDealModalProps) {
    const priorityColor = {
        low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };

    const priorityLabel = {
        low: "Baixa",
        medium: "Média",
        high: "Alta",
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">{deal.title}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Contact Info */}
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        {deal.contacts?.profile_pic_url ? (
                            <img
                                src={deal.contacts.profile_pic_url}
                                alt={deal.contacts.push_name}
                                className="w-12 h-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                                <User className="h-6 w-6" />
                            </div>
                        )}
                        <div>
                            <p className="font-semibold">{deal.contacts?.push_name || "Sem contato"}</p>
                            <p className="text-sm text-muted-foreground">{deal.contacts?.number?.split('@')[0]}</p>
                        </div>
                    </div>

                    {/* Key Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <DollarSign className="h-3 w-3" />
                                Valor
                            </div>
                            <p className="text-lg font-semibold">{formatCurrency(deal.value)}</p>
                            {deal.quantity && deal.quantity > 1 && (
                                <p className="text-xs text-muted-foreground">Qtd: {deal.quantity}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <AlertCircle className="h-3 w-3" />
                                Prioridade
                            </div>
                            <Badge variant="outline" className={`border-0 ${deal.priority ? priorityColor[deal.priority] : ''}`}>
                                {deal.priority ? priorityLabel[deal.priority] : "N/A"}
                            </Badge>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <Tag className="h-3 w-3" />
                                Produto/Serviço
                            </div>
                            <p className="font-medium">
                                {deal.product_service?.name || "-"}
                                {deal.product_service?.type && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                        ({deal.product_service.type === 'product' ? 'Produto' : 'Serviço'})
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <Calendar className="h-3 w-3" />
                                Criado em
                            </div>
                            <p className="text-sm">
                                {format(toZonedTime(deal.created_at, TIMEZONE), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                        </div>
                    </div>

                    {/* Professional Info - Only if assigned */}
                    {deal.assigned_professional && (
                        <div className="p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-2">
                                <User className="h-3 w-3" />
                                Profissional Atribuído
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                    {deal.assigned_professional.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold">{deal.assigned_professional.name}</p>
                                    {deal.assigned_professional.role && (
                                        <p className="text-xs text-muted-foreground">{deal.assigned_professional.role}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                            <FileText className="h-3 w-3" />
                            Descrição
                        </div>
                        <div className="p-3 bg-muted/20 rounded-md text-sm min-h-[80px]">
                            {deal.description || <span className="text-muted-foreground italic">Sem descrição.</span>}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <DealNotesModal deal={deal} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
