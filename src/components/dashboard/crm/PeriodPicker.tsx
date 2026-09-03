import { useMemo, useState } from "react";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CrmRange } from "@/hooks/useCrmDashboard";

export type CrmPeriodKey = "hoje" | "7d" | "30d" | "custom";

const OPTIONS: { value: CrmPeriodKey; label: string }[] = [
    { value: "hoje", label: "Hoje" },
    { value: "7d", label: "Últimos 7 dias" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "custom", label: "Personalizado" },
];

/** Estado do filtro de período de uma seção do Dashboard > CRM. */
export function useCrmPeriod() {
    const [period, setPeriod] = useState<CrmPeriodKey>("hoje");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");

    const range = useMemo<CrmRange>(() => {
        const now = new Date();
        switch (period) {
            case "7d":
                return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
            case "30d":
                return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
            case "custom":
                return {
                    start: customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : startOfDay(now),
                    end: customEnd ? endOfDay(new Date(`${customEnd}T00:00:00`)) : endOfDay(now),
                };
            case "hoje":
            default:
                return { start: startOfDay(now), end: endOfDay(now) };
        }
    }, [period, customStart, customEnd]);

    return { period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd, range };
}

type PeriodPickerProps = ReturnType<typeof useCrmPeriod>;

export function PeriodPicker({
    period,
    setPeriod,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
}: PeriodPickerProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as CrmPeriodKey)}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                    {OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {period === "custom" && (
                <div className="flex items-center gap-1.5">
                    <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="h-8 w-[135px] text-xs"
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="h-8 w-[135px] text-xs"
                    />
                </div>
            )}
        </div>
    );
}
