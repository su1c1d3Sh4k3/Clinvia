import { useState } from "react";
import { ChevronDown, Radar, Bot, Users, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Campaign, useInstanceNames } from "@/hooks/useCampaigns";
import { CampaignStatsRow } from "@/hooks/useCampaignDashboard";
import { CampaignContactsTable } from "@/components/campaigns/CampaignContactsTable";

interface MonitoringExpandableCardProps {
    campaign: Campaign;
    stats?: CampaignStatsRow;
}

function formatDateTimeBR(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Situação do monitoramento: ativo enquanto 'dispatching' e dentro da validade. */
function monitoringStatus(c: Campaign): { label: string; className: string } {
    if (c.status === "cancelled")
        return { label: "Encerrado", className: "bg-muted text-muted-foreground" };
    if (c.status === "expired" || new Date(c.valid_until) <= new Date())
        return { label: "Expirado", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" };
    if (c.status === "error")
        return { label: "Erro", className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" };
    return { label: "Ativo", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" };
}

/** Container de um grupo monitorado (nome = tag "Monitoramento - <grupo> - <data>"). */
export function MonitoringExpandableCard({ campaign, stats }: MonitoringExpandableCardProps) {
    const [expanded, setExpanded] = useState(false);
    const { data: instanceNames } = useInstanceNames();
    const instanceName = campaign.instance_id ? instanceNames?.get(campaign.instance_id) : null;

    const statusMeta = monitoringStatus(campaign);
    const leads = stats?.total_contacts ?? 0;
    const responded = stats?.responded_count ?? 0;
    const converted = stats?.converted_count ?? 0;

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Radar className="w-4 h-4 text-violet-500 shrink-0" />
                        <span className="font-semibold truncate">{campaign.name}</span>
                        <Badge variant="secondary" className={statusMeta.className}>{statusMeta.label}</Badge>
                        {instanceName && <Badge variant="outline">{instanceName}</Badge>}
                        {campaign.ia_enabled && (
                            <Badge variant="outline" className="gap-1"><Bot className="w-3 h-3" /> IA</Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Termo: "{campaign.monitor_term}" ({campaign.monitor_match_mode === "equals" ? "igual" : "contém"}) ·
                        Criado: {formatDateTimeBR(campaign.created_at)} ·
                        Expira: {formatDateTimeBR(campaign.valid_until)}
                    </p>
                </div>

                <div className="flex items-center gap-4 text-sm ml-auto">
                    <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-violet-500" />
                        <span className="font-semibold">{leads}</span>
                        <span className="text-xs text-muted-foreground">lead{leads !== 1 ? "s" : ""}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {responded} responderam · {converted} agendaram
                    </span>
                </div>

                <ChevronDown
                    className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")}
                />
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="text-sm space-y-1 border rounded-xl p-3">
                        <p className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Tag dos leads:</span> {campaign.name}
                        </p>
                        <p className="whitespace-pre-wrap">
                            <span className="text-muted-foreground">Mensagem de abordagem:</span> {campaign.initial_message}
                        </p>
                        {campaign.ia_enabled && campaign.objective && (
                            <p><span className="text-muted-foreground">Objetivo da IA:</span> {campaign.objective}</p>
                        )}
                        {(campaign.services || []).length > 0 && (
                            <p>
                                <span className="text-muted-foreground">Serviços:</span>{" "}
                                {campaign.services.map((s) => s.name).join(", ")}
                                {campaign.discount_pct != null && (
                                    <Badge variant="secondary" className="ml-2">{campaign.discount_pct}% off</Badge>
                                )}
                            </p>
                        )}
                    </div>

                    {/* Leads capturados (tabela compartilhada, frozen-aware) */}
                    <CampaignContactsTable campaignId={campaign.id} />
                </div>
            )}
        </div>
    );
}
