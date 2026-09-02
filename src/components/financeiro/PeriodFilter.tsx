import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays } from "date-fns";

export type PeriodKey = "todo" | "hoje" | "7d" | "30d" | "custom";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
    { value: "todo", label: "Todo o período" },
    { value: "hoje", label: "Hoje" },
    { value: "7d", label: "Últimos 7 dias" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "custom", label: "Personalizado" },
];

export interface PeriodRange {
    start: string | null;
    end: string | null;
}

/** Converte o filtro em datas (YYYY-MM-DD) no fuso local; null = sem limite. */
export function resolvePeriod(period: PeriodKey, customStart: string, customEnd: string): PeriodRange {
    const today = format(new Date(), "yyyy-MM-dd");
    switch (period) {
        case "hoje":
            return { start: today, end: today };
        case "7d":
            return { start: format(subDays(new Date(), 6), "yyyy-MM-dd"), end: today };
        case "30d":
            return { start: format(subDays(new Date(), 29), "yyyy-MM-dd"), end: today };
        case "custom":
            return { start: customStart || null, end: customEnd || null };
        default:
            return { start: null, end: null };
    }
}

interface PeriodFilterProps {
    period: PeriodKey;
    onPeriodChange: (p: PeriodKey) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (v: string) => void;
    onCustomEndChange: (v: string) => void;
    /** "todo" só faz sentido nos cards; os rankings começam em "30d". */
    options?: { value: PeriodKey; label: string }[];
    className?: string;
}

export function PeriodFilter({
    period,
    onPeriodChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    options = PERIOD_OPTIONS,
    className,
}: PeriodFilterProps) {
    return (
        <div className={`flex flex-wrap items-center gap-2 ${className || ""}`}>
            <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
                <SelectTrigger className="h-9 w-[170px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {period === "custom" && (
                <>
                    <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => onCustomStartChange(e.target.value)}
                        className="h-9 w-[150px]"
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => onCustomEndChange(e.target.value)}
                        className="h-9 w-[150px]"
                    />
                </>
            )}
        </div>
    );
}
