import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const MONTHS = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
];

const currentYear = new Date().getFullYear();
export const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

interface MonthYearSelectProps {
    month: number;
    year: number;
    onMonthChange: (month: number) => void;
    onYearChange: (year: number) => void;
    disabled?: boolean;
}

export function MonthYearSelect({ month, year, onMonthChange, onYearChange, disabled }: MonthYearSelectProps) {
    return (
        <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => onMonthChange(parseInt(v))} disabled={disabled}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                            {m.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => onYearChange(parseInt(v))} disabled={disabled}>
                <SelectTrigger className="w-[90px] h-8 text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                            {y}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

interface TodayToggleProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

export function TodayToggle({ checked, onCheckedChange }: TodayToggleProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Hoje</span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}
