import { useAtendimentosData } from "@/hooks/useAtendimentosData";
import { ServiceMetricsGrid } from "./ServiceMetricsGrid";
import { HistoryCharts } from "./HistoryCharts";
import { TeamPerformanceTable } from "./TeamPerformanceTable";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Skeleton unificado exibido enquanto TODAS as queries da aba
 * "Atendimentos" ainda estão carregando. Evita o flash de múltiplos
 * loaders parciais e dá a sensação de um carregamento atômico.
 */
const AtendimentosSkeleton = () => (
    <div className="space-y-8 animate-in fade-in duration-300">
        {/* Indicador de progresso central */}
        <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">
                Carregando dados de atendimento…
            </p>
        </div>

        {/* Blocos esqueleto com proporções similares aos componentes reais */}
        <div className="space-y-6">
            <div className="h-8 w-64 bg-muted/30 rounded-md animate-pulse" />

            {/* Bento grid de KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 md:row-span-2 h-[280px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[130px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[130px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[130px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[130px] bg-muted/20 rounded-xl animate-pulse" />
            </div>

            {/* Linha do gráfico principal */}
            <div className="h-[480px] bg-muted/20 rounded-xl animate-pulse" />

            {/* Linha de distribuições */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="h-[340px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[340px] bg-muted/20 rounded-xl animate-pulse" />
                <div className="h-[340px] bg-muted/20 rounded-xl animate-pulse" />
            </div>
        </div>

        {/* Seção de histórico */}
        <div className="space-y-6">
            <div className="h-6 w-48 bg-muted/30 rounded-md animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="h-[100px] bg-muted/20 rounded-2xl animate-pulse" />
                <div className="h-[100px] bg-muted/20 rounded-2xl animate-pulse" />
                <div className="h-[100px] bg-muted/20 rounded-2xl animate-pulse" />
                <div className="h-[100px] bg-muted/20 rounded-2xl animate-pulse" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="h-[320px] bg-muted/20 rounded-2xl animate-pulse" />
                <div className="h-[320px] bg-muted/20 rounded-2xl animate-pulse" />
            </div>
            <div className="h-[340px] bg-muted/20 rounded-2xl animate-pulse" />
        </div>

        {/* Tabela da equipe */}
        <div className="space-y-4">
            <div className="h-6 w-56 bg-muted/30 rounded-md animate-pulse" />
            <div className="h-[400px] bg-muted/20 rounded-xl animate-pulse" />
        </div>
    </div>
);

/**
 * Componente wrapper da aba "Atendimentos" do Dashboard.
 *
 * - Dispara todas as queries de dados em paralelo via `useAtendimentosData`.
 * - Mostra o skeleton unificado enquanto QUALQUER uma das queries está
 *   carregando — evita flashes de conteúdo parcial.
 * - Passa os dados como props para os 3 componentes filhos, que viram
 *   puramente apresentacionais (sem duplicar fetches).
 */
export const AtendimentosTab = () => {
    const { isLoading, isError, error, stats, history, globalMetrics, team } =
        useAtendimentosData(true);

    if (isLoading) {
        return <AtendimentosSkeleton />;
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <AlertCircle className="w-12 h-12 text-destructive" />
                <div>
                    <p className="font-semibold text-lg">Erro ao carregar dados</p>
                    <p className="text-sm text-muted-foreground max-w-md mt-1">
                        {error instanceof Error ? error.message : "Não foi possível buscar as métricas da aba Atendimentos. Tente novamente em instantes."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <ServiceMetricsGrid stats={stats} history={history} globalMetrics={globalMetrics} />
            <HistoryCharts metrics={history} />
            <TeamPerformanceTable team={team} />
        </div>
    );
};
