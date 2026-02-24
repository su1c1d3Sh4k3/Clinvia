import { ReactNode } from "react";
import { ArrowDown, DollarSign, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMStage } from "@/types/crm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface StageMetric {
    stage: CRMStage;
    dealsInStage: number;
    historyCount: number;
    conversionRate: number | null;
}

interface VerticalFunnelProps {
    title: string;
    icon?: ReactNode;
    colorTheme?: 'amber' | 'blue' | 'purple' | 'green' | 'primary';
    totalDeals: number;
    stages: StageMetric[];
    specialMetrics?: StageMetric[];
    lostDeals: number;
    lossRate: number;
    hasWonStage?: boolean;
    wonDeals?: number;

    currentFunnelId?: string;
    allFunnels?: { id: string; name: string }[];
    onFunnelSelect?: (funnelId: string) => void;
    onFunnelClick?: (funnelId: string) => void;
}

// Cores dos estágios para os 4 funis principais
const mainStageBgs = [
    "bg-[#0F437C]",
    "bg-[#1458A5]",
    "bg-[#1C72D0]",
    "bg-[#3093FA]",
    "bg-[#3093FA]",
    "bg-[#3093FA]",
    "bg-[#3093FA]",
];

// Cores dos estágios para funis secundários (cinza-azulado progressivamente mais claro)
const otherStageBgs = [
    "bg-[#838FAB]",
    "bg-[#929EBA]",
    "bg-[#A1ADC9]",
    "bg-[#B0BCD8]",
    "bg-[#BFCBE7]",
    "bg-[#CEDAF6]",
    "bg-[#DDE9FF]",
];

const themeStyles = {
    amber: {
        bg: "bg-white dark:bg-[#272C35]",
        border: "border-border/50",
        text: "text-[#0F437C] dark:text-[#3093FA]",
        stageBgs: mainStageBgs,
        stageTextLabel: "text-white/90",
        stageTextCount: "text-white",
        badgeClass: "bg-black/20 text-white",
    },
    blue: {
        bg: "bg-white dark:bg-[#272C35]",
        border: "border-border/50",
        text: "text-[#0F437C] dark:text-[#3093FA]",
        stageBgs: mainStageBgs,
        stageTextLabel: "text-white/90",
        stageTextCount: "text-white",
        badgeClass: "bg-black/20 text-white",
    },
    purple: {
        bg: "bg-white dark:bg-[#272C35]",
        border: "border-border/50",
        text: "text-[#0F437C] dark:text-[#3093FA]",
        stageBgs: mainStageBgs,
        stageTextLabel: "text-white/90",
        stageTextCount: "text-white",
        badgeClass: "bg-black/20 text-white",
    },
    green: {
        bg: "bg-white dark:bg-[#272C35]",
        border: "border-border/50",
        text: "text-[#0F437C] dark:text-[#3093FA]",
        stageBgs: mainStageBgs,
        stageTextLabel: "text-white/90",
        stageTextCount: "text-white",
        badgeClass: "bg-black/20 text-white",
    },
    primary: {
        bg: "bg-white dark:bg-[#272C35]",
        border: "border-border/50",
        text: "text-[#0F437C] dark:text-[#3093FA]",
        stageBgs: otherStageBgs,
        stageTextLabel: "text-[#0F437C]",
        stageTextCount: "text-[#0F437C] font-extrabold",
        badgeClass: "bg-[#0F437C]/15 text-[#0F437C]",
    },
};

export function VerticalFunnel({
    title,
    icon,
    colorTheme = 'primary',
    totalDeals,
    stages,
    specialMetrics = [],
    lostDeals,
    lossRate,
    hasWonStage = true,
    wonDeals = 0,
    currentFunnelId,
    allFunnels,
    onFunnelSelect,
    onFunnelClick
}: VerticalFunnelProps) {
    const theme = themeStyles[colorTheme];

    // Largura decrescente por estágio: 100% → 60% (mínimo)
    const getStageWidth = (index: number) => {
        const reduceBy = index * 8;
        const width = Math.max(60, 100 - reduceBy);
        return `${width}%`;
    };

    return (
        <div className={cn(
            "flex flex-col h-full rounded-2xl border p-4 md:p-5 transition-all duration-300 hover:shadow-md shadow-sm",
            theme.bg,
            theme.border
        )}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4 gap-2">
                <div
                    className={cn(
                        "flex items-start gap-2 pt-1",
                        onFunnelClick && currentFunnelId && "cursor-pointer group/title"
                    )}
                    onClick={() => onFunnelClick && currentFunnelId && onFunnelClick(currentFunnelId)}
                    title={onFunnelClick ? "Abrir no CRM" : undefined}
                >
                    {icon && (
                        <div className={cn(
                            "p-1.5 rounded-lg bg-[#F0F5FA] dark:bg-white/10 shadow-sm mt-0.5 transition-transform group-hover/title:scale-110",
                            theme.text
                        )}>
                            {icon}
                        </div>
                    )}
                    <h3 className={cn(
                        "font-bold text-[15px] leading-[1.1] md:text-sm xl:text-base group-hover/title:underline underline-offset-2",
                        theme.text
                    )}>
                        {title}
                    </h3>
                </div>

                {allFunnels && allFunnels.length > 0 && onFunnelSelect && currentFunnelId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger className={cn(
                            "p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0",
                            theme.text
                        )}>
                            <Settings2 className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                            {allFunnels.map(f => (
                                <DropdownMenuItem
                                    key={f.id}
                                    onClick={() => onFunnelSelect(f.id)}
                                    className={cn(f.id === currentFunnelId && "bg-muted font-medium")}
                                >
                                    {f.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* Total de Negócios */}
            <div className="flex flex-col mb-6 bg-[#F0F5FA] dark:bg-white/5 px-4 py-3 rounded-xl border border-[#D4D5D6] dark:border-white/10 shadow-sm text-center">
                <span className="text-sm text-muted-foreground font-medium mb-1">Total de Negócios</span>
                <span className={cn("text-3xl font-black tracking-tight", theme.text)}>
                    {totalDeals}
                </span>
            </div>

            {/* Estágios do Funil */}
            <div className="flex-1 flex flex-col items-center justify-start gap-1.5 w-full mt-2">
                {stages.map((metric, index) => {
                    const bgClass = theme.stageBgs[Math.min(index, theme.stageBgs.length - 1)];

                    return (
                        <div key={metric.stage.id} className="w-full flex flex-col items-center group">
                            {/* Badge de conversão (acima do estágio, exceto o primeiro) */}
                            {index > 0 && metric.conversionRate !== null && (
                                <div className="z-10 -my-2 flex items-center justify-center">
                                    <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-background text-foreground shadow-sm border border-border flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                        <ArrowDown className="w-3 h-3" />
                                        {metric.conversionRate.toFixed(1)}%
                                    </div>
                                </div>
                            )}

                            {/* Bloco do Estágio */}
                            <div
                                className={cn(
                                    "relative flex flex-col items-center justify-center py-3 px-2 shadow-sm transition-all duration-300 group-hover:brightness-110 rounded-2xl",
                                    bgClass
                                )}
                                style={{
                                    width: getStageWidth(index),
                                    minHeight: '80px',
                                }}
                            >
                                <span className={cn(
                                    "text-[10px] md:text-xs uppercase tracking-wider font-semibold text-center leading-tight mb-1 truncate w-full px-2",
                                    theme.stageTextLabel
                                )}>
                                    {metric.stage.name}
                                </span>
                                <span className={cn(
                                    "text-xl md:text-2xl font-bold tracking-tight",
                                    theme.stageTextCount
                                )}>
                                    {metric.historyCount.toLocaleString('pt-BR')}
                                </span>
                                {/* Badge com quantidade atual no estágio */}
                                <div
                                    className={cn(
                                        "absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                                        theme.badgeClass
                                    )}
                                    title="Oportunidades atuais no estágio"
                                >
                                    {metric.dealsInStage}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Ganho / Perdido */}
            <div className="grid grid-cols-2 gap-2 mt-4 items-end">
                {/* Ganho */}
                {hasWonStage && (
                    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white dark:bg-white/5 border border-green-500/40 dark:border-green-500/30">
                        <span className="text-green-600 dark:text-green-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Ganho
                        </span>
                        <span className="text-green-700 dark:text-green-400 font-bold text-lg">
                            {wonDeals}
                        </span>
                    </div>
                )}

                {/* Perdido */}
                <div className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl bg-white dark:bg-white/5 border border-red-500/40 dark:border-red-500/30",
                    !hasWonStage && "col-span-2"
                )}>
                    <span className="text-red-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                        <ArrowDown className="w-3 h-3" />
                        Perdido
                    </span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-red-600 dark:text-red-400 font-bold text-lg">
                            {lostDeals}
                        </span>
                        <span className="text-red-600/70 dark:text-red-400/70 font-medium text-[10px]">
                            ({lossRate.toFixed(1)}%)
                        </span>
                    </div>
                </div>
            </div>

            {/* Follow Up / Sem Contato / Sem Interesse */}
            {specialMetrics.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                    {specialMetrics.map((sm) => (
                        <div
                            key={sm.stage.id}
                            className="flex flex-col items-center justify-center py-2 px-1 rounded-xl border border-border bg-white dark:bg-white/5 shadow-sm text-center"
                        >
                            <span
                                className="text-[9px] md:text-[10px] font-bold uppercase leading-tight mb-1 break-words w-full px-0.5 text-[#808080] dark:text-white"
                                style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal', hyphens: 'auto' }}
                            >
                                {sm.stage.name.replace(' (IA)', '')}
                            </span>
                            <span className="font-bold text-base md:text-lg leading-none text-[#808080] dark:text-white">
                                {sm.historyCount}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
