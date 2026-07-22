import { useState } from "react";
import { isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { STAGE_COLORS } from "@/types/crm-client";
import { DayPicker } from "./DayPicker";
import { useCrmStageCounts } from "@/hooks/useCrmDashboard";

interface StageStatusCardsProps {
    title: string;
    stages: string[];
}

/**
 * Section with one small card per stage: total deals + breakdown of
 * conversation status (Aberto / Pendente / Concluído no dia).
 */
export function StageStatusCards({ title, stages }: StageStatusCardsProps) {
    const [date, setDate] = useState(new Date());
    const { data, isLoading } = useCrmStageCounts(date);

    const isEmpty = !isLoading && (!data || data.length === 0) && !isToday(date);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{title}</h3>
                <DayPicker date={date} onDateChange={setDate} />
            </div>

            {isEmpty ? (
                <Card className="rounded-2xl border border-border/50 shadow-sm">
                    <CardContent className="py-10">
                        <p className="text-sm text-muted-foreground text-center">
                            Sem dados registrados para esta data
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {stages.map((stage) => {
                        const row = data?.find((d) => d.stage === stage);
                        const color = STAGE_COLORS[stage] || "#8b5cf6";
                        return (
                            <Card
                                key={stage}
                                className="rounded-2xl border border-border/50 shadow-sm overflow-hidden"
                            >
                                <div className="h-1" style={{ backgroundColor: color }} />
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground truncate" title={stage}>
                                        {stage}
                                    </p>
                                    <p className="text-2xl font-bold leading-none">
                                        {isLoading ? "—" : row?.total ?? 0}
                                    </p>
                                    <div className="space-y-0.5 pt-1 border-t border-border/40">
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground">Aberto</span>
                                            <span className="font-semibold text-blue-600">
                                                {isLoading ? "—" : row?.open_count ?? 0}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground">Pendente</span>
                                            <span className="font-semibold text-amber-600">
                                                {isLoading ? "—" : row?.pending_count ?? 0}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground">Concluído</span>
                                            <span className="font-semibold text-emerald-600">
                                                {isLoading ? "—" : row?.resolved_count ?? 0}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
