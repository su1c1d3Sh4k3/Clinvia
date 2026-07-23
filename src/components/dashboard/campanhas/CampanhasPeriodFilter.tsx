import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CampanhasPeriod } from "@/hooks/useCampaignDashboard";

const MONTHS = [
    { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" }, { value: 3, label: "Março" },
    { value: 4, label: "Abril" }, { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
    { value: 7, label: "Julho" }, { value: 8, label: "Agosto" }, { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" }, { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2024 + 2 }, (_, i) => 2024 + i);

interface CampanhasPeriodFilterProps {
    period: CampanhasPeriod;
    onChange: (period: CampanhasPeriod) => void;
}

export function CampanhasPeriodFilter({ period, onChange }: CampanhasPeriodFilterProps) {
    const now = new Date();

    const handleModeChange = (mode: string) => {
        switch (mode) {
            case "month":
                onChange({ mode: "month", year: now.getFullYear(), month: now.getMonth() + 1 });
                break;
            case "year":
                onChange({ mode: "year", year: now.getFullYear() });
                break;
            case "custom":
                onChange({ mode: "custom" });
                break;
            default:
                onChange({ mode: "all" });
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={period.mode} onValueChange={handleModeChange}>
                <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="month">Por mês</SelectItem>
                    <SelectItem value="year">Por ano</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
            </Select>

            {period.mode === "month" && (
                <>
                    <Select
                        value={String(period.month)}
                        onValueChange={(v) => onChange({ ...period, month: parseInt(v) })}
                    >
                        <SelectTrigger className="w-[130px] h-9 text-sm">
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
                    <Select
                        value={String(period.year)}
                        onValueChange={(v) => onChange({ ...period, year: parseInt(v) })}
                    >
                        <SelectTrigger className="w-[90px] h-9 text-sm">
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
                </>
            )}

            {period.mode === "year" && (
                <Select
                    value={String(period.year)}
                    onValueChange={(v) => onChange({ ...period, year: parseInt(v) })}
                >
                    <SelectTrigger className="w-[90px] h-9 text-sm">
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
            )}

            {period.mode === "custom" && (
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 text-sm gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {period.from ? format(period.from, "dd/MM/yyyy") : "De"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={period.from}
                                onSelect={(d) => onChange({ ...period, from: d ?? undefined })}
                                locale={ptBR}
                            />
                        </PopoverContent>
                    </Popover>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 text-sm gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {period.to ? format(period.to, "dd/MM/yyyy") : "Até"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={period.to}
                                onSelect={(d) => onChange({ ...period, to: d ?? undefined })}
                                locale={ptBR}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            )}
        </div>
    );
}
