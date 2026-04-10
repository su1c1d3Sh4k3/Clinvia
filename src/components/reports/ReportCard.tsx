import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ReportCardProps {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
    evolution?: number | null;
    prefix?: string;
    suffix?: string;
    className?: string;
    featured?: boolean;
}

export function ReportCard({ label, value, icon, evolution, prefix, suffix, className, featured }: ReportCardProps) {
    const formattedValue = typeof value === "number"
        ? (prefix === "R$"
            ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : value.toLocaleString("pt-BR"))
        : value;

    return (
        <div className={cn(
            "group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300",
            featured
                ? "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 shadow-md hover:shadow-lg"
                : "bg-white dark:bg-card/50 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md hover:border-border/80",
            className
        )}>
            {featured && (
                <div className="absolute -top-8 -right-8 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            )}
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
                    {icon && (
                        <div className={cn(
                            "p-2 rounded-xl transition-transform duration-300 group-hover:scale-110",
                            featured ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                        )}>
                            {icon}
                        </div>
                    )}
                </div>
                <div className="flex items-baseline gap-1.5">
                    {prefix && <span className="text-sm font-semibold text-muted-foreground">{prefix}</span>}
                    <span className={cn(
                        "font-black tracking-tight",
                        featured ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
                    )}>
                        {formattedValue}
                    </span>
                    {suffix && <span className="text-sm font-semibold text-muted-foreground">{suffix}</span>}
                </div>
                {evolution !== undefined && evolution !== null && (
                    <div className={cn(
                        "mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
                        evolution > 0 && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                        evolution < 0 && "text-red-600 dark:text-red-400 bg-red-500/10",
                        evolution === 0 && "text-muted-foreground bg-muted/50"
                    )}>
                        {evolution > 0 && <TrendingUp className="w-3 h-3" />}
                        {evolution < 0 && <TrendingDown className="w-3 h-3" />}
                        {evolution === 0 && <Minus className="w-3 h-3" />}
                        <span>{evolution > 0 ? "+" : ""}{evolution.toFixed(1)}%</span>
                    </div>
                )}
            </div>
        </div>
    );
}
