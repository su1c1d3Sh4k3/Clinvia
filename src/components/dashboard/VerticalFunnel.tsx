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
}

const themeStyles = {
    amber: {
        bg: "bg-amber-100 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-800",
        text: "text-amber-700 dark:text-amber-400",
        stageBgs: [
            "bg-amber-500",
            "bg-amber-500/90",
            "bg-amber-500/80",
            "bg-amber-500/70",
            "bg-amber-500/60",
            "bg-amber-500/50",
            "bg-amber-500/40"
        ]
    },
    blue: {
        bg: "bg-blue-100 dark:bg-blue-900/20",
        border: "border-blue-200 dark:border-blue-800",
        text: "text-blue-700 dark:text-blue-400",
        stageBgs: [
            "bg-blue-500",
            "bg-blue-500/90",
            "bg-blue-500/80",
            "bg-blue-500/70",
            "bg-blue-500/60",
            "bg-blue-500/50",
            "bg-blue-500/40"
        ]
    },
    purple: {
        bg: "bg-purple-100 dark:bg-purple-900/20",
        border: "border-purple-200 dark:border-purple-800",
        text: "text-purple-700 dark:text-purple-400",
        stageBgs: [
            "bg-purple-500",
            "bg-purple-500/90",
            "bg-purple-500/80",
            "bg-purple-500/70",
            "bg-purple-500/60",
            "bg-purple-500/50",
            "bg-purple-500/40"
        ]
    },
    green: {
        bg: "bg-green-100 dark:bg-green-900/20",
        border: "border-green-200 dark:border-green-800",
        text: "text-green-700 dark:text-green-400",
        stageBgs: [
            "bg-green-500",
            "bg-green-500/90",
            "bg-green-500/80",
            "bg-green-500/70",
            "bg-green-500/60",
            "bg-green-500/50",
            "bg-green-500/40"
        ]
    },
    primary: {
        bg: "bg-primary/10",
        border: "border-primary/20",
        text: "text-primary",
        stageBgs: [
            "bg-primary",
            "bg-primary/90",
            "bg-primary/80",
            "bg-primary/70",
            "bg-primary/60",
            "bg-primary/50",
            "bg-primary/40"
        ]
    }
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
    onFunnelSelect
}: VerticalFunnelProps) {
    const theme = themeStyles[colorTheme];

    // Formato estilo funil: a largura de cada div vai diminuindo.
    // Stage 0: 100%, Stage 1: 90%, Stage 2: 80%, etc (minimum 60%)
    const getStageWidth = (index: number) => {
        const reduceBy = index * 8; // 8% por estagio
        const width = Math.max(60, 100 - reduceBy);
        return `${width}%`;
    };

    // Helper para decidir a cor dos cartões especiais separados do funil
    const getSpecialTileColor = (name: string) => {
        const n = name.trim().toLowerCase();
        if (n.includes('follow up')) return 'bg-orange-500/10 border-orange-500/20 text-orange-500';
        if (n.includes('sem contato')) return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-500';
        if (n.includes('sem interesse')) return 'bg-gray-500/10 border-gray-500/20 text-gray-500 dark:text-gray-400';
        return 'bg-secondary/20 border-border text-foreground';
    };

    return (
        <div className={cn(
            "flex flex-col h-full rounded-2xl border backdrop-blur-sm p-4 md:p-5 transition-all duration-300 hover:shadow-md",
            theme.bg,
            theme.border
        )}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4 gap-2">
                <div className="flex items-start gap-2 pt-1">
                    {icon && (
                        <div className={cn("p-1.5 rounded-lg bg-background/50 backdrop-blur-md shadow-sm mt-0.5", theme.text)}>
                            {icon}
                        </div>
                    )}
                    <h3 className={cn("font-bold text-[15px] leading-[1.1] md:text-sm xl:text-base", theme.text)}>{title}</h3>
                </div>

                {allFunnels && allFunnels.length > 0 && onFunnelSelect && currentFunnelId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger className={cn("p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0", theme.text)}>
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

            {/* Total Metric Top */}
            <div className="flex flex-col mb-6 bg-background/60 backdrop-blur-md px-4 py-3 rounded-xl border border-white/20 dark:border-black/20 shadow-sm text-center">
                <span className="text-sm text-muted-foreground font-medium mb-1">Total de Negócios</span>
                <span className={cn("text-3xl font-black tracking-tight", theme.text)}>
                    {totalDeals}
                </span>
            </div>

            {/* Funnel Stages Stack */}
            <div className="flex-1 flex flex-col items-center justify-start gap-1 w-full mt-2">
                {stages.map((metric, index) => {
                    const bgClass = theme.stageBgs[Math.min(index, theme.stageBgs.length - 1)];
                    const isFirst = index === 0;

                    return (
                        <div key={metric.stage.id} className="w-full flex flex-col items-center group">
                            {/* Conversion Badge above stage (if not first) */}
                            {!isFirst && metric.conversionRate !== null && (
                                <div className="z-10 -my-2 flex items-center justify-center">
                                    <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-background text-foreground shadow-sm border border-border flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                        <ArrowDown className="w-3 h-3" />
                                        {metric.conversionRate.toFixed(1)}%
                                    </div>
                                </div>
                            )}

                            {/* Stage Block */}
                            <div
                                className={cn(
                                    "relative flex flex-col items-center justify-center py-3 px-2 shadow-sm transition-all duration-300 group-hover:brightness-110",
                                    bgClass,
                                    isFirst ? "rounded-t-xl rounded-b-md" : "rounded-md"
                                )}
                                style={{
                                    width: getStageWidth(index),
                                    minHeight: '80px',
                                    clipPath: 'polygon(0% 0%, 100% 0%, 98% 100%, 2% 100%)' // Subtle trapezoid
                                }}
                            >
                                <span className="text-white/90 text-[10px] md:text-xs uppercase tracking-wider font-semibold text-center leading-tight mb-1 truncate w-full px-2">
                                    {metric.stage.name}
                                </span>
                                <span className="text-white text-xl md:text-2xl font-bold tracking-tight">
                                    {metric.historyCount.toLocaleString('pt-BR')}
                                </span>
                                <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-black/20 text-white text-[10px] font-bold" title="Oportunidades atuais no estágio">
                                    {metric.dealsInStage}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer Outcomes (Ganho / Perdido) */}
            <div className="grid grid-cols-2 gap-2 mt-4 justify-end items-end h-auto">
                {/* Ganho */}
                {hasWonStage && (
                    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-green-500/10 border border-green-500/20">
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
                    "flex flex-col items-center justify-center p-3 rounded-xl bg-red-500/10 border border-red-500/20",
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

            {/* Separated Special Outcomes (Follow Up, Sem Contato, Sem Interesse) */}
            {specialMetrics.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                    {specialMetrics.map((sm) => {
                        const styleClasses = getSpecialTileColor(sm.stage.name);
                        return (
                            <div key={sm.stage.id} className={cn("flex flex-col items-center justify-center py-2 px-1 rounded-xl border shadow-sm text-center", styleClasses)}>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase leading-tight mb-1 break-words w-full px-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal', hyphens: 'auto' }}>
                                    {sm.stage.name.replace(' (IA)', '')} {/* Remove '(IA)' to fit in grid easily */}
                                </span>
                                <span className="font-bold text-base md:text-lg leading-none">
                                    {sm.historyCount}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

        </div>
    );
}
