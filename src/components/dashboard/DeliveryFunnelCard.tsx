import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { DELIVERY_STAGES, Delivery } from "@/types/delivery";
import { VerticalFunnel, StageMetric } from "./VerticalFunnel";

// Estágios principais que aparecem no funil (os 3 intermediários)
const MAIN_STAGE_KEYS = [
    "aguardando_agendamento",
    "procedimento_agendado",
    "procedimento_confirmado",
] as const;

export function DeliveryFunnelCard() {
    const { data: ownerId } = useOwnerId();
    const navigate = useNavigate();

    const { data: deliveries = [] } = useQuery({
        queryKey: ["deliveries", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_my_deliveries");
            if (error) throw error;
            return (data as any[]) as Delivery[];
        },
        enabled: !!ownerId,
    });

    const { stages, concludedCount, cancelledCount, totalCount, lossRate } = useMemo(() => {
        const stages: StageMetric[] = MAIN_STAGE_KEYS.map((key, index) => {
            const stageInfo = DELIVERY_STAGES.find((s) => s.key === key)!;
            const count = deliveries.filter((d) => d.stage === key).length;

            let conversionRate: number | null = null;
            if (index > 0) {
                const prevKey = MAIN_STAGE_KEYS[index - 1];
                const prevCount = deliveries.filter((d) => d.stage === prevKey).length;
                conversionRate =
                    prevCount > 0 ? (count / prevCount) * 100
                    : count > 0 ? 100
                    : 0;
            }

            return {
                // Apenas id e name são usados na renderização do VerticalFunnel
                stage: { id: key, name: stageInfo.label } as any,
                dealsInStage: count,
                historyCount: count,
                conversionRate,
            };
        });

        const concludedCount = deliveries.filter((d) => d.stage === "procedimento_concluido").length;
        const cancelledCount = deliveries.filter((d) => d.stage === "procedimento_cancelado").length;
        const totalCount = deliveries.length;
        const lossRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;

        return { stages, concludedCount, cancelledCount, totalCount, lossRate };
    }, [deliveries]);

    return (
        <VerticalFunnel
            title="Delivery"
            icon={<PackageCheck className="w-5 h-5" />}
            colorTheme="blue"
            totalDeals={totalCount}
            stages={stages}
            lostDeals={cancelledCount}
            lossRate={lossRate}
            hasWonStage
            wonDeals={concludedCount}
            wonLabel="Concluído"
            lostLabel="Cancelado"
            // currentFunnelId qualquer string não-nula faz o título ficar clicável
            currentFunnelId="__delivery__"
            onFunnelClick={() => navigate("/delivery")}
        />
    );
}
