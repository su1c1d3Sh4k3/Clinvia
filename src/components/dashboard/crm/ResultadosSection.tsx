import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, XCircle, CheckCircle2, PhoneOff, ThumbsDown } from "lucide-react";
import { PeriodPicker, useCrmPeriod } from "./PeriodPicker";
import { ChannelPicker } from "./ChannelPicker";
import { useCrmStageMovement } from "@/hooks/useCrmDashboard";
import { formatCurrency } from "@/hooks/useAppointmentsDashboard";

/** As 5 etapas terminais do funil — todo desfecho possível de uma negociação. */
const CARDS = [
    {
        stage: "Ganho",
        icon: Trophy,
        iconClass: "text-emerald-600",
        bgClass: "bg-emerald-500/10",
        valueClass: "text-emerald-600",
    },
    {
        stage: "Perdido",
        icon: XCircle,
        iconClass: "text-red-600",
        bgClass: "bg-red-500/10",
        valueClass: "text-red-600",
    },
    {
        stage: "Sem Contato",
        icon: PhoneOff,
        iconClass: "text-slate-500",
        bgClass: "bg-slate-500/10",
        valueClass: "text-slate-500",
    },
    {
        stage: "Sem Interesse",
        icon: ThumbsDown,
        iconClass: "text-orange-600",
        bgClass: "bg-orange-500/10",
        valueClass: "text-orange-600",
    },
    {
        stage: "Finalizado",
        icon: CheckCircle2,
        iconClass: "text-gray-500",
        bgClass: "bg-gray-500/10",
        valueClass: "text-gray-500",
    },
];

export function ResultadosSection() {
    const periodState = useCrmPeriod();
    const [channelId, setChannelId] = useState<string | null>(null);
    const { data, isLoading } = useCrmStageMovement(periodState.range, channelId);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Resultados</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <ChannelPicker value={channelId} onChange={setChannelId} />
                    <PeriodPicker {...periodState} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {CARDS.map((c) => {
                    const Icon = c.icon;
                    const row = data?.find((d) => d.stage === c.stage);
                    return (
                        <Card key={c.stage} className="rounded-2xl border border-border/50 shadow-sm">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.bgClass}`}>
                                    <Icon className={`w-5 h-5 ${c.iconClass}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">{c.stage}</p>
                                    <p className="text-2xl font-bold leading-tight">
                                        {isLoading ? "—" : row?.total ?? 0}
                                    </p>
                                    <p className={`text-xs font-medium ${c.valueClass}`}>
                                        {isLoading ? "" : formatCurrency(Number(row?.value_sum) || 0)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
