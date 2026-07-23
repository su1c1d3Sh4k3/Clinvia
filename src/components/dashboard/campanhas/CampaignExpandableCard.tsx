import { useState } from "react";
import {
    ChevronDown, Megaphone, Bot, Users, Clock, DollarSign, TrendingUp,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@/hooks/useCampaigns";
import { CampaignStatsRow } from "@/hooks/useCampaignDashboard";
import {
    CAMPAIGN_STATUS,
    TEMPLATE_STATUS,
    COST_PER_MSG_USD,
} from "@/components/campaigns/CampaignCard";
import { CampaignContactsTable } from "@/components/campaigns/CampaignContactsTable";
import { useUsdBrlRate } from "@/hooks/useUsdBrlRate";

interface CampaignExpandableCardProps {
    campaign: Campaign;
    stats?: CampaignStatsRow;
}

function formatDateTimeBR(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function CampaignExpandableCard({ campaign, stats }: CampaignExpandableCardProps) {
    const [expanded, setExpanded] = useState(false);
    const { data: rateData } = useUsdBrlRate();

    const statusMeta = CAMPAIGN_STATUS[campaign.status] || CAMPAIGN_STATUS.scheduled;
    const tplMeta = campaign.template_status ? TEMPLATE_STATUS[campaign.template_status] : null;

    const total = stats?.total_contacts ?? campaign.total_contacts ?? 0;
    const validCount = stats?.valid_contacts ?? total;
    const sentCount = stats?.sent_count ?? campaign.contact_counts?.sent ?? 0;
    const convertedCount = stats?.converted_count ?? 0;
    const conversionPct = total > 0 ? (convertedCount / total) * 100 : 0;
    const sendPct = validCount > 0 ? Math.round((sentCount / validCount) * 100) : 0;

    const rate = rateData?.rate ?? 5.5;
    const estimatedCost = sentCount > 0
        ? sentCount * COST_PER_MSG_USD * rate
        : validCount * COST_PER_MSG_USD * rate;
    const estimatedSeconds = Math.max(0, (validCount - 1) * 15);
    const durationLabel = estimatedSeconds < 60
        ? `${estimatedSeconds}s`
        : estimatedSeconds < 3600
            ? `${Math.ceil(estimatedSeconds / 60)} min`
            : `${Math.floor(estimatedSeconds / 3600)}h ${Math.ceil((estimatedSeconds % 3600) / 60)}min`;

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                {/* Título + badges */}
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Megaphone className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">{campaign.name}</span>
                        <Badge variant="secondary" className={statusMeta.className}>{statusMeta.label}</Badge>
                        {tplMeta && (
                            <Badge variant="secondary" className={tplMeta.className}>{tplMeta.label}</Badge>
                        )}
                        {campaign.ia_enabled && (
                            <Badge variant="outline" className="gap-1"><Bot className="w-3 h-3" /> IA</Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Disparo: {formatDateTimeBR(campaign.scheduled_at)} · Vencimento:{" "}
                        {formatDateTimeBR(campaign.valid_until)} ·{" "}
                        <Users className="w-3 h-3 inline-block -mt-0.5" /> {total} contato{total !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* Conversão */}
                <div className="flex items-center gap-1 text-sm">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                    <span className="font-semibold text-amber-600">{conversionPct.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">
                        agendaram ({convertedCount}/{total})
                    </span>
                </div>

                {/* Barra de envios */}
                <div className="flex-1 min-w-[160px] max-w-[280px] ml-auto">
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

                <ChevronDown
                    className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")}
                />
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Métricas */}
                    <div className="grid grid-cols-3 gap-2">
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
                        <div className="border rounded-xl p-2.5 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-primary shrink-0" />
                            <div>
                                <p className="text-sm font-semibold leading-none">{formatCurrency(estimatedCost)}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">custo estimado</p>
                            </div>
                        </div>
                    </div>

                    {/* Resultados */}
                    {stats && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                            <div className="border rounded-xl p-2.5">
                                <p className="font-semibold">{stats.sent_count}</p>
                                <p className="text-[10px] text-muted-foreground">enviadas</p>
                            </div>
                            <div className="border rounded-xl p-2.5">
                                <p className="font-semibold text-emerald-600">{stats.delivered_count}</p>
                                <p className="text-[10px] text-muted-foreground">entregues</p>
                            </div>
                            <div className="border rounded-xl p-2.5">
                                <p className="font-semibold text-red-600">{stats.failed_count}</p>
                                <p className="text-[10px] text-muted-foreground">com erro</p>
                            </div>
                            <div className="border rounded-xl p-2.5">
                                <p className="font-semibold text-violet-600">{stats.responded_count}</p>
                                <p className="text-[10px] text-muted-foreground">respondidas</p>
                            </div>
                        </div>
                    )}

                    {/* Detalhes */}
                    <div className="text-sm space-y-1 border rounded-xl p-3">
                        <p>
                            <span className="text-muted-foreground">Serviços:</span>{" "}
                            {(campaign.services || []).length > 0
                                ? campaign.services.map((s) => s.name).join(", ")
                                : "nenhum"}
                            {campaign.discount_pct != null && (
                                <Badge variant="secondary" className="ml-2">{campaign.discount_pct}% off</Badge>
                            )}
                        </p>
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
                </div>
            )}
        </div>
    );
}
