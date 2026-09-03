import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CalendarClock, Handshake, MessageSquare, UserRound } from "lucide-react";
import { STAGE_COLORS } from "@/types/crm-client";
import { formatCurrency } from "@/hooks/useAppointmentsDashboard";
import { useCrmStageDeals, type CrmRange, type CrmStageDeal } from "@/hooks/useCrmDashboard";

interface StageDealsModalProps {
    /** Etapa clicada — `null` mantém o modal fechado. */
    stage: string | null;
    range: CrmRange;
    channelId?: string | null;
    onClose: () => void;
}

function dt(value: string | null): string {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** Quem conduziu o ticket: responsável da conversa, senão quem assinou as mensagens. */
function handledBy(deal: CrmStageDeal): string {
    const agent = deal.agent_name?.trim();
    if (agent) return agent;
    const senders = deal.sender_names?.trim();
    if (senders) return senders;
    if (deal.is_ai_handled) return "IA";
    return "Sem responsável";
}

export function StageDealsModal({ stage, range, channelId, onClose }: StageDealsModalProps) {
    const navigate = useNavigate();
    const { data, isLoading } = useCrmStageDeals(stage, range, channelId);
    const color = (stage && STAGE_COLORS[stage]) || "#8b5cf6";

    return (
        <Dialog open={!!stage} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-3xl max-h-[85vh] flex flex-col rounded-lg">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        {stage}
                    </DialogTitle>
                    <DialogDescription>
                        Negociações que entraram nesta etapa de {dt(range.start.toISOString())} a{" "}
                        {dt(range.end.toISOString())}. Clique em um card para abrir o ticket.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto -mx-1 px-1">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground py-12 text-center">Carregando...</p>
                    ) : !data || data.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-12 text-center">
                            Nenhuma negociação entrou nesta etapa no período.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {data.map((deal) => {
                                const hasTicket = !!deal.conversation_id;
                                return (
                                    <button
                                        key={deal.deal_id}
                                        type="button"
                                        disabled={!hasTicket}
                                        onClick={() => navigate(`/?conversationId=${deal.conversation_id}`)}
                                        className="w-full text-left rounded-xl border border-border/60 bg-card p-3 transition-colors enabled:hover:border-primary/50 enabled:hover:bg-muted/40 disabled:opacity-60 disabled:cursor-default"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold truncate">{deal.contact_name}</p>
                                                {deal.contact_number && (
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {deal.contact_number}
                                                    </p>
                                                )}
                                            </div>
                                            {hasTicket ? (
                                                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                            ) : (
                                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                                    Sem ticket
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1.5">
                                                <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                                                Entrou na etapa: {dt(deal.stage_changed_at)}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <UserRound className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">Atendeu: {handledBy(deal)}</span>
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                                {deal.message_count} mensagens
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <Handshake className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">
                                                    {deal.services_count > 0 || Number(deal.deal_value) > 0
                                                        ? `${formatCurrency(Number(deal.deal_value) || 0)}${deal.services_label ? ` · ${deal.services_label}` : ""}`
                                                        : "Sem negociação vinculada"}
                                                </span>
                                            </span>
                                        </div>

                                        <div className="mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                                            Ticket: {dt(deal.conversation_started_at)} →{" "}
                                            {deal.conversation_ended_at
                                                ? dt(deal.conversation_ended_at)
                                                : "em andamento"}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
