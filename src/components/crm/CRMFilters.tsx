import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useStaff } from "@/hooks/useStaff";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Calendar as CalendarIcon, X } from "lucide-react";
import { format, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

export interface CRMFiltersState {
    tagId: string | null;
    responsibleId: string | null;
    dateRange: DateRange | undefined;
    dateFilterType: 'all' | 'today' | 'last7' | 'last30' | 'custom';
}

interface CRMFiltersProps {
    filters: CRMFiltersState;
    onFiltersChange: (filters: CRMFiltersState) => void;
}

export function CRMFilters({ filters, onFiltersChange }: CRMFiltersProps) {
    const { data: staffMembers } = useStaff();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Fetch Tags
    const { data: tags } = useQuery({
        queryKey: ["crm-tags"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags")
                .select("*")
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const handleDateFilterChange = (value: string) => {
        const type = value as CRMFiltersState['dateFilterType'];
        let range: DateRange | undefined = undefined;
        const today = new Date();

        switch (type) {
            case 'today':
                range = { from: today, to: today };
                break;
            case 'last7':
                range = { from: subDays(today, 7), to: today };
                break;
            case 'last30':
                range = { from: subDays(today, 30), to: today };
                break;
            case 'all':
                range = undefined;
                break;
            case 'custom':
                range = filters.dateRange; // Keep existing or undefined until selected
                setIsCalendarOpen(true);
                break;
        }

        onFiltersChange({
            ...filters,
            dateFilterType: type,
            dateRange: range,
        });
    };

    const handleCustomDateSelect = (range: DateRange | undefined) => {
        onFiltersChange({
            ...filters,
            dateRange: range,
        });
    };

    const clearFilters = () => {
        onFiltersChange({
            tagId: null,
            responsibleId: null,
            dateRange: undefined,
            dateFilterType: 'all',
        });
    };

    const hasActiveFilters = filters.tagId || filters.responsibleId || filters.dateFilterType !== 'all';

    return (
        <div className="flex items-center gap-2">
            {/* Tag Filter */}
            <Select
                value={filters.tagId || "all"}
                onValueChange={(val) => onFiltersChange({ ...filters, tagId: val === "all" ? null : val })}
            >
                <SelectTrigger className="w-[140px] h-9 text-xs">
                    <div className="flex items-center gap-2 truncate">
                        <Filter className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">
                            {filters.tagId && tags
                                ? tags.find(t => t.id === filters.tagId)?.name
                                : "Tag"}
                        </span>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas as Tags</SelectItem>
                    {tags?.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Responsible Filter */}
            <Select
                value={filters.responsibleId || "all"}
                onValueChange={(val) => onFiltersChange({ ...filters, responsibleId: val === "all" ? null : val })}
            >
                <SelectTrigger className="w-[140px] h-9 text-xs">
                    <div className="flex items-center gap-2 truncate">
                        <Filter className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">
                            {filters.responsibleId && staffMembers
                                ? staffMembers.find(s => s.id === filters.responsibleId)?.name
                                : "Responsável"}
                        </span>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos Responsáveis</SelectItem>
                    {staffMembers?.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                            {staff.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Date Filter */}
            <div className="flex items-center gap-1">
                <Select
                    value={filters.dateFilterType}
                    onValueChange={handleDateFilterChange}
                >
                    <SelectTrigger className="w-[140px] h-9 text-xs">
                        <div className="flex items-center gap-2 truncate">
                            <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">
                                {filters.dateFilterType === 'all' && "Todo Período"}
                                {filters.dateFilterType === 'today' && "Hoje"}
                                {filters.dateFilterType === 'last7' && "Últimos 7 dias"}
                                {filters.dateFilterType === 'last30' && "Últimos 30 dias"}
                                {filters.dateFilterType === 'custom' && "Personalizado"}
                            </span>
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todo Período</SelectItem>
                        <SelectItem value="today">Hoje</SelectItem>
                        <SelectItem value="last7">Últimos 7 dias</SelectItem>
                        <SelectItem value="last30">Últimos 30 dias</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                </Select>

                {filters.dateFilterType === 'custom' && (
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "h-9 px-2 text-xs font-normal",
                                    !filters.dateRange && "text-muted-foreground"
                                )}
                            >
                                {filters.dateRange?.from ? (
                                    filters.dateRange.to ? (
                                        <>
                                            {format(filters.dateRange.from, "dd/MM/yy")} -{" "}
                                            {format(filters.dateRange.to, "dd/MM/yy")}
                                        </>
                                    ) : (
                                        format(filters.dateRange.from, "dd/MM/yy")
                                    )
                                ) : (
                                    <span>Selecione datas</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={filters.dateRange?.from}
                                selected={filters.dateRange}
                                onSelect={handleCustomDateSelect}
                                numberOfMonths={2}
                                locale={ptBR}
                            />
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={clearFilters}
                    title="Limpar filtros"
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}
