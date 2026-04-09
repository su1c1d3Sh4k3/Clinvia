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
}

export function ReportCard({ label, value, icon, evolution, prefix, suffix, className }: ReportCardProps) {
    const formattedValue = typeof value === "number"
        ? (prefix === "R$"
            ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : value.toLocaleString("pt-BR"))
        : value;

    return (
        <div className={cn(
            "rounded-xl border bg-card p-4 flex flex-col gap-2 transition-all hover:shadow-md",
            className
        )}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                {icon && <div className="text-muted-foreground">{icon}</div>}
            </div>
            <div className="flex items-end gap-2">
                <span className="text-2xl font-bold leading-none">
                    {prefix && <span className="text-lg font-semibold text-muted-foreground mr-1">{prefix}</span>}
                    {formattedValue}
                    {suffix && <span className="text-sm font-medium text-muted-foreground ml-1">{suffix}</span>}
                </span>
            </div>
            {evolution !== undefined && evolution !== null && (
                <div className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    evolution > 0 && "text-green-500",
                    evolution < 0 && "text-red-500",
                    evolution === 0 && "text-muted-foreground"
                )}>
                    {evolution > 0 && <TrendingUp className="w-3.5 h-3.5" />}
                    {evolution < 0 && <TrendingDown className="w-3.5 h-3.5" />}
                    {evolution === 0 && <Minus className="w-3.5 h-3.5" />}
                    <span>
                        {evolution > 0 ? "+" : ""}{evolution.toFixed(1)}% vs período anterior
                    </span>
                </div>
            )}
        </div>
    );
}
