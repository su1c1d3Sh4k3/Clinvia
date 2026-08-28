import { useState } from "react";
import {
    ChevronDown, Clock, DollarSign, Users, Pencil, Trash2, RefreshCw,
    Sparkles, AlertTriangle, Loader2, Bot, User as UserIcon, Send, RotateCcw,
    CheckCheck, XCircle, CalendarCheck, BellOff, Headphones, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { Campaign, useCampaignMutations, useInstanceNames } from "@/hooks/useCampaigns";
import { CampaignStatsRow } from "@/hooks/useCampaignDashboard";
import { useUsdBrlRate } from "@/hooks/useUsdBrlRate";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { CampaignContactsTable } from "./CampaignContactsTable";

export const COST_PER_MSG_USD = 0.0625;

export const CAMPAIGN_STATUS: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Agendada", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    awaiting_template: { label: "Aguardando template", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    dispatching: { label: "Disparando", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
    dispatched: { label: "Disparada", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    error: { label: "Erro", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    cancelled: { label: "Cancelada", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    expired: { label: "Expirada", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    blocked: { label: "Bloqueada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export const TEMPLATE_STATUS: Record<string, { label: string; className: string }> = {
    APPROVED: { label: "Template aprovado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    PENDING: { label: "Template em análise", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    REJECTED: { label: "Template rejeitado", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    DISABLED: { label: "Template desativado", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

const EDITABLE_STATUSES = ["scheduled", "awaiting_template", "error"];
/** Campanhas concluídas (já disparadas ou vencidas) podem ser reenviadas. */
export const RESENDABLE_STATUSES = ["dispatched", "expired"];

/** Confirmação de reenvio de campanha disparada (compartilhado /campanhas + dashboard). */
export function ResendCampaignDialog({
    campaign, open, onOpenChange, onConfirm,
}: {
    campaign: Campaign;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Reenviar campanha "{campaign.name}"?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Essa campanha já foi enviada e reenviar para os mesmos leads em um período
                        curto de tempo pode acarretar em prejuízos para sua conta junto à Meta.
                        Deseja continuar com o reenvio da campanha?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Não</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Sim, continuar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

interface StatCell {
    label: string;
    value: number;
    icon: JSX.Element;
    hint?: string;
    gradient: string;
    iconBg: string;
    bar: string;
    valueClass?: string;
}

/** Grade de resultados da campanha (compartilhada /campanhas + dashboard).
 *  USER RULE: só entra no detalhamento quem RESPONDEU à mensagem da campanha
 *  (na conversa que ela abriu) — Pendente + Aberto + Resolvido + Removido
 *  somam exatamente as Respondidas. Respondidas + Sem Resposta = Recebidas
 *  (Enviadas − Rejeitadas). A legenda sob "Resolvido" mostra quantos tickets
 *  foram encerrados SEM o cliente responder — é o que faz o inbox listar mais
 *  conversas resolvidas do que este número. */
export function CampaignStatsGrid({ stats }: { stats: CampaignStatsRow }) {
    const sent = stats.sent_count || 0;
    const responded = stats.responded_count || 0;
    const received = stats.received_count ?? sent;
    const pct = (v: number) => (sent > 0 ? `${Math.round((v / sent) * 100)}% dos enviados` : undefined);

    const breakdown: { label: string; value: number; className: string; sub?: string }[] = [
        {
            label: "Pendente", value: stats.pending_count ?? 0, className: "text-amber-600",
            sub: stats.awaiting_reply_count
                ? `${stats.awaiting_reply_count} aguardando você`
                : undefined,
        },
        { label: "Aberto", value: stats.open_count ?? 0, className: "text-emerald-600" },
        {
            label: "Resolvido", value: stats.resolved_count ?? 0, className: "text-sky-600",
            // explica por que o inbox lista mais conversas encerradas do que este número
            sub: stats.closed_no_reply_count
                ? `${stats.closed_no_reply_count} encerrados antes da resposta`
                : undefined,
        },
        { label: "Removido", value: stats.removed_count ?? 0, className: "text-muted-foreground" },
    ];

    const row1: StatCell[] = [
        {
            label: "Enviadas", value: sent, icon: <Send className="w-4 h-4 text-blue-500" />,
            gradient: "from-blue-500/10 via-blue-500/[0.03] to-transparent",
            iconBg: "bg-blue-500/15", bar: "bg-blue-500",
        },
        {
            label: "Entregues", value: stats.delivered_count || 0, hint: pct(stats.delivered_count || 0),
            icon: <CheckCheck className="w-4 h-4 text-emerald-500" />,
            gradient: "from-emerald-500/10 via-emerald-500/[0.03] to-transparent",
            iconBg: "bg-emerald-500/15", bar: "bg-emerald-500", valueClass: "text-emerald-600",
        },
        {
            label: "Rejeitadas", value: stats.failed_count || 0, hint: pct(stats.failed_count || 0),
            icon: <XCircle className="w-4 h-4 text-red-500" />,
            gradient: "from-red-500/10 via-red-500/[0.03] to-transparent",
            iconBg: "bg-red-500/15", bar: "bg-red-500", valueClass: "text-red-600",
        },
    ];

    const row2: StatCell[] = [
        {
            label: "Agendados", value: stats.scheduled_count || 0, hint: "agendaram na validade da campanha",
            icon: <CalendarCheck className="w-4 h-4 text-teal-500" />,
            gradient: "from-teal-500/10 via-teal-500/[0.03] to-transparent",
            iconBg: "bg-teal-500/15", bar: "bg-teal-500", valueClass: "text-teal-600",
        },
        {
            label: "Sem Resposta", value: stats.no_response_count || 0,
            hint: received > 0
                ? `${Math.round(((stats.no_response_count || 0) / received) * 100)}% de quem recebeu`
                : undefined,
            icon: <BellOff className="w-4 h-4 text-rose-500" />,
            gradient: "from-rose-500/10 via-rose-500/[0.03] to-transparent",
            iconBg: "bg-rose-500/15", bar: "bg-rose-500", valueClass: "text-rose-600",
        },
        {
            label: "Em Atendimento", value: stats.in_progress_count || 0,
            hint: "um humano ou a IA já respondeu",
            icon: <Headphones className="w-4 h-4 text-indigo-500" />,
            gradient: "from-indigo-500/10 via-indigo-500/[0.03] to-transparent",
            iconBg: "bg-indigo-500/15", bar: "bg-indigo-500", valueClass: "text-indigo-600",
        },
    ];

    const renderCell = (c: StatCell) => (
        <div
            key={c.label}
            className={cn(
                "relative overflow-hidden p-4 rounded-xl border border-border/40 bg-gradient-to-br transition-shadow hover:shadow-md",
                c.gradient,
            )}
        >
            <div className={cn("absolute left-0 top-0 h-full w-1", c.bar)} />
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", c.iconBg)}>
                    {c.icon}
                </div>
            </div>
            <p className={cn("text-2xl font-bold tracking-tight tabular-nums", c.valueClass)}>{c.value}</p>
            {c.hint && <p className="text-[11px] text-muted-foreground mt-1.5">{c.hint}</p>}
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Respondidas — ocupa as duas linhas na 1ª coluna */}
            <div className="relative overflow-hidden p-5 rounded-xl border border-border/40 bg-gradient-to-br from-violet-500/15 via-violet-500/[0.05] to-transparent sm:col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-center transition-shadow hover:shadow-md">
                <div className="absolute left-0 top-0 h-full w-1 bg-violet-500" />
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-medium text-muted-foreground">Respondidas</span>
                    <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5 text-violet-500" />
                    </div>
                </div>
                <p className="text-3xl font-bold tracking-tight tabular-nums text-violet-600">{responded}</p>
                <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                    de <span className="font-semibold text-foreground/80">{received}</span> recebidas
                </p>
                <div className="mt-4 pt-3 border-t border-border/40">
                    <p className="text-[11px] font-medium text-muted-foreground mb-2">
                        Onde estão as {responded} que responderam
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {breakdown.map((b) => (
                            <div key={b.label}>
                                <p className="text-[11px] text-muted-foreground">{b.label}</p>
                                <p className={cn("text-sm font-semibold tabular-nums", b.className)}>{b.value}</p>
                                {b.sub && <p className="text-[10px] text-muted-foreground">{b.sub}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {row1.map(renderCell)}
            {row2.map(renderCell)}
        </div>
    );
}

interface CampaignCardProps {
    campaign: Campaign;
    stats?: CampaignStatsRow;
    onEdit: (campaign: Campaign) => void;
    onResend?: (campaign: Campaign) => void;
}

export function CampaignCard({ campaign, stats, onEdit, onResend }: CampaignCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmResend, setConfirmResend] = useState(false);
    const { data: instanceNames } = useInstanceNames();
    const instanceName = campaign.instance_id ? instanceNames?.get(campaign.instance_id) : null;
    const { deleteCampaign, regeneratePrompt, syncTemplates } = useCampaignMutations();
    const { data: rateData } = useUsdBrlRate();
    const { data: userRole } = useUserRole();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const isAdmin = userRole === "admin";
    const mayCreate = isAdmin || canCreate("campaigns");
    const mayEdit = isAdmin || canEdit("campaigns");
    const mayDelete = isAdmin || canDelete("campaigns");

    const statusMeta = CAMPAIGN_STATUS[campaign.status] || CAMPAIGN_STATUS.scheduled;
    const isUazapi = campaign.template_mode === "none";
    const tplMeta = !isUazapi && campaign.template_status ? TEMPLATE_STATUS[campaign.template_status] : null;
    const isNotification = campaign.campaign_type === "notification";
    const editable = EDITABLE_STATUSES.includes(campaign.status);
    const counts = campaign.contact_counts || {};
    // Mesma fonte da dashboard (RPC get_campaign_dashboard_stats) — fallback nos
    // campos da campanha quando os stats ainda não carregaram
    const total = stats?.total_contacts ?? campaign.total_contacts ?? 0;
    const validCount = stats?.valid_contacts ?? (total - (counts.invalid || 0));
    const sentCount = stats?.sent_count ?? counts.sent ?? 0;
    const sendPct = validCount > 0 ? Math.round((sentCount / validCount) * 100) : 0;
    const rate = rateData?.rate ?? 5.5;
    const estimatedCost = isUazapi
        ? 0
        : (sentCount > 0 ? sentCount : validCount) * COST_PER_MSG_USD * rate;
    const estimatedSeconds = Math.max(0, (validCount - 1) * (isUazapi ? 38 : 15));
    const durationLabel = estimatedSeconds < 60
        ? `${estimatedSeconds}s`
        : estimatedSeconds < 3600
            ? `${Math.ceil(estimatedSeconds / 60)} min`
            : `${Math.floor(estimatedSeconds / 3600)}h ${Math.ceil((estimatedSeconds % 3600) / 60)}min`;

    const handleDelete = async () => {
        try {
            await deleteCampaign.mutateAsync(campaign.id);
            toast.success("Campanha excluída.");
        } catch (err: any) {
            toast.error(err.message);
        }
        setConfirmDelete(false);
    };

    const handleSync = async () => {
        if (!campaign.instance_id) return;
        try {
            await syncTemplates.mutateAsync(campaign.instance_id);
            toast.success("Status dos templates sincronizado com a Meta.");
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleRegeneratePrompt = async () => {
        try {
            await regeneratePrompt.mutateAsync(campaign.id);
            toast.success("Prompt de vendas regenerado.");
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            {/* Header colapsável */}
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{campaign.name}</span>
                        <Badge variant="secondary" className={statusMeta.className}>{statusMeta.label}</Badge>
                        {instanceName && (
                            <Badge variant="outline" className="gap-1">
                                <Send className="w-3 h-3" /> {instanceName}
                            </Badge>
                        )}
                        <Badge variant="outline">{isNotification ? "Notificação" : "Promoção"}</Badge>
                        {isUazapi && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                API não oficial
                            </Badge>
                        )}
                        {tplMeta && (
                            <Badge variant="secondary" className={tplMeta.className}>{tplMeta.label}</Badge>
                        )}
                        {campaign.ia_enabled ? (
                            <Badge variant="outline" className="gap-1"><Bot className="w-3 h-3" /> IA</Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1"><UserIcon className="w-3 h-3" /> Humano</Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Disparo: {new Date(campaign.scheduled_at).toLocaleString("pt-BR")} · Válida até:{" "}
                        {new Date(campaign.valid_until).toLocaleString("pt-BR")} · {total} contatos
                        {sentCount ? ` · ${sentCount} enviados` : ""}
                        {(stats?.failed_count ?? counts.failed) ? ` · ${stats?.failed_count ?? counts.failed} falhas` : ""}
                    </p>
                </div>
                {/* Barra de conclusão do envio (mesma da dashboard) */}
                <div className="flex-1 min-w-[120px] max-w-full sm:max-w-[280px] ml-auto shrink-0">
                    <p className="text-[10px] text-muted-foreground mb-1 text-right">
                        Envios ({sentCount}/{validCount})
                    </p>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
                                style={{ width: `${sendPct}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground w-9 text-right">{sendPct}%</span>
                    </div>
                </div>
                {RESENDABLE_STATUSES.includes(campaign.status) && onResend && mayCreate && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); setConfirmResend(true); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfirmResend(true); } }}
                                    className="shrink-0 flex items-center text-muted-foreground hover:text-foreground border rounded-md p-1.5 hover:bg-muted transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Reenviar campanha</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")} />
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Erros / rejeição */}
                    {campaign.status === "error" && campaign.error_message && (
                        <div className="flex items-start gap-2 text-sm border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                            <span>{campaign.error_message}</span>
                        </div>
                    )}
                    {campaign.template_status === "REJECTED" && (
                        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-xl p-3 space-y-2">
                            <div className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium">A Meta rejeitou o template desta campanha.</p>
                                    {campaign.template_rejection_reason && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Motivo: {campaign.template_rejection_reason}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Edite a campanha e selecione outro template já aprovado pela Meta.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Estimativas */}
                    <div className={cn("grid gap-2", isUazapi ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
                        <div className="border rounded-xl p-2.5 flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary shrink-0" />
                            <div>
                                <p className="text-sm font-semibold leading-none">{validCount}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">contatos válidos</p>
                            </div>
                        </div>
                        <div className="border rounded-xl p-2.5 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary shrink-0" />
                            <div>
                                <p className="text-sm font-semibold leading-none">{durationLabel}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">tempo estimado</p>
                            </div>
                        </div>
                        {!isUazapi && (
                            <div className="border rounded-xl p-2.5 flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-primary shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold leading-none">{formatCurrency(estimatedCost)}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">custo estimado</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Resultados (mesmos dados da dashboard) */}
                    {stats && <CampaignStatsGrid stats={stats} />}

                    {/* Detalhes */}
                    <div className="text-sm space-y-1 border rounded-xl p-3">
                        {!isNotification && (
                            <p>
                                <span className="text-muted-foreground">Serviços:</span>{" "}
                                {(campaign.services || []).length > 0
                                    ? campaign.services.map((s) => s.name).join(", ")
                                    : "nenhum"}
                                {campaign.discount_pct != null && (
                                    <Badge variant="secondary" className="ml-2">{campaign.discount_pct}% off</Badge>
                                )}
                            </p>
                        )}
                        <p className="whitespace-pre-wrap">
                            <span className="text-muted-foreground">Mensagem:</span> {campaign.initial_message}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Objetivo:</span> {campaign.objective}
                        </p>
                        {campaign.template_name && (
                            <p className="text-xs text-muted-foreground">Template: {campaign.template_name}</p>
                        )}
                    </div>

                    {/* Contatos */}
                    <CampaignContactsTable campaignId={campaign.id} />

                    {/* Ações */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {editable && mayEdit && (
                            <Button size="sm" variant="outline" onClick={() => onEdit(campaign)}>
                                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                            </Button>
                        )}
                        {campaign.instance_id && campaign.template_name && (
                            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncTemplates.isPending}>
                                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", syncTemplates.isPending && "animate-spin")} />
                                Sincronizar status
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={handleRegeneratePrompt} disabled={regeneratePrompt.isPending}>
                            {regeneratePrompt.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Regenerar prompt IA
                        </Button>
                        {!["dispatching", "dispatched"].includes(campaign.status) && mayDelete && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 ml-auto"
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmação de reenvio */}
            <ResendCampaignDialog
                campaign={campaign}
                open={confirmResend}
                onOpenChange={setConfirmResend}
                onConfirm={() => {
                    setConfirmResend(false);
                    onResend?.(campaign);
                }}
            />

            {/* Confirmação de exclusão */}
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir campanha "{campaign.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {campaign.template_mode === "create"
                                ? "O template Meta e a etiqueta da campanha também serão removidos. Esta ação não pode ser desfeita."
                                : "A etiqueta da campanha também será removida. Esta ação não pode ser desfeita."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleteCampaign.isPending ? "Excluindo..." : "Excluir"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
