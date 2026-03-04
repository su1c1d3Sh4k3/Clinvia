import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryFiltersState } from "@/types/delivery";
import { DateRange } from "react-day-picker";

interface DeliveryFiltersProps {
    ownerId: string;
    filters: DeliveryFiltersState;
    onChange: (filters: DeliveryFiltersState) => void;
}

export function DeliveryFilters({ ownerId, filters, onChange }: DeliveryFiltersProps) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        filters.period ? { from: filters.period.from, to: filters.period.to } : undefined
    );

    const { data: professionals } = useQuery({
        queryKey: ["professionals-delivery-filter"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("professionals")
                .select("id, name")
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const { data: patients } = useQuery({
        queryKey: ["patients-delivery-filter", ownerId],
        queryFn: async () => {
            // Tenta via RPC (bypassa RLS)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc("get_my_patients");
            if (!rpcError && rpcData) {
                return (rpcData as any[]).map((p: any) => ({ id: p.id, nome: p.nome }));
            }
            // Fallback
            const { data, error } = await supabase
                .from("patients")
                .select("id, nome")
                .eq("user_id", ownerId)
                .order("nome");
            if (error) throw error;
            return data;
        },
        enabled: !!ownerId,
    });

    const hasFilters = !!filters.professionalId || !!filters.patientId || !!filters.period;

    const clearFilters = () => {
        setDateRange(undefined);
        onChange({ professionalId: null, patientId: null, period: null });
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro Período */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {filters.period
                            ? `${format(filters.period.from, "dd/MM")} – ${format(filters.period.to, "dd/MM")}`
                            : "Período"
                        }
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                            setDateRange(range);
                            if (range?.from && range?.to) {
                                onChange({ ...filters, period: { from: range.from, to: range.to } });
                            } else {
                                onChange({ ...filters, period: null });
                            }
                        }}
                        locale={ptBR}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>

            {/* Filtro Profissional */}
            <Select
                value={filters.professionalId || ""}
                onValueChange={(val) => onChange({ ...filters, professionalId: val || null })}
            >
                <SelectTrigger className="h-8 w-[180px] text-sm">
                    <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                    {professionals?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Filtro Paciente */}
            <Select
                value={filters.patientId || ""}
                onValueChange={(val) => onChange({ ...filters, patientId: val || null })}
            >
                <SelectTrigger className="h-8 w-[180px] text-sm">
                    <SelectValue placeholder="Paciente" />
                </SelectTrigger>
                <SelectContent>
                    {patients?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Limpar filtros */}
            {hasFilters && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearFilters}>
                    <X className="w-3.5 h-3.5 mr-1" />
                    Limpar
                </Button>
            )}
        </div>
    );
}
