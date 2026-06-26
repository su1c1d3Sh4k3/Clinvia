import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Search, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecurrenceEntry {
  id: string;
  contact_name: string;
  service_name: string;
  application_name: string;
  procedure_date: string;
  recurrence_date: string;
  approach_1_date: string | null;
  approach_1_status: string;
  approach_2_date: string | null;
  approach_2_status: string;
  approach_3_date: string | null;
  approach_3_status: string;
  scheduled: boolean;
}

type PeriodFilter = "year" | "last30" | "last7" | "custom";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "realizada":
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">Realizada</Badge>;
    case "cliente em contato":
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-[10px]">Em contato</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px]">Pendente</Badge>;
  }
}

function getScheduledBadge(scheduled: boolean) {
  if (scheduled) {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">Sim</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px]">Não</Badge>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Recurrence = () => {
  const { data: ownerId } = useOwnerId();

  // Filters
  const [searchName, setSearchName] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("year");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Fetch data
  const { data: entries, isLoading } = useQuery({
    queryKey: ["recurrence-tracking", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurrence_tracking")
        .select("*")
        .eq("user_id", ownerId)
        .order("recurrence_date", { ascending: true });
      if (error) throw error;
      return (data || []) as RecurrenceEntry[];
    },
    enabled: !!ownerId,
  });

  // Unique service names for filter
  const serviceNames = useMemo(() => {
    if (!entries) return [];
    const names = [...new Set(entries.map((e) => e.service_name))].filter(Boolean);
    names.sort();
    return names;
  }, [entries]);

  // Period range
  const periodRange = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "year":
        return { from: startOfYear(now), to: endOfYear(now) };
      case "last30":
        return { from: subDays(now, 30), to: now };
      case "last7":
        return { from: subDays(now, 7), to: now };
      case "custom":
        return { from: customFrom || startOfYear(now), to: customTo || endOfYear(now) };
      default:
        return { from: startOfYear(now), to: endOfYear(now) };
    }
  }, [periodFilter, customFrom, customTo]);

  // Filtered entries
  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      // Name filter
      if (searchName && !e.contact_name.toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }
      // Service filter
      if (serviceFilter !== "all" && e.service_name !== serviceFilter) {
        return false;
      }
      // Period filter on recurrence_date
      const recDate = new Date(e.recurrence_date + "T12:00:00");
      if (recDate < periodRange.from || recDate > periodRange.to) {
        return false;
      }
      return true;
    });
  }, [entries, searchName, serviceFilter, periodRange]);

  // Group by month of recurrence_date
  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, RecurrenceEntry[]>();
    for (const entry of filtered) {
      const [y, m] = entry.recurrence_date.split("-");
      const key = `${y}-${m}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }
    // Sort keys chronologically
    const sorted = new Map(
      [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    );
    return sorted;
  }, [filtered]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-screen w-full bg-background">
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Recorrência</h1>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Acompanhe o ciclo de recorrência dos clientes por serviço
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
            {/* Search by name */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="pl-8 h-9 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
              />
            </div>

            {/* Service filter */}
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm bg-white dark:bg-background border border-[#D4D5D6] dark:border-border">
                <SelectValue placeholder="Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os serviços</SelectItem>
                {serviceNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period filter */}
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm bg-white dark:bg-background border border-[#D4D5D6] dark:border-border">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Ano atual</SelectItem>
                <SelectItem value="last30">Últimos 30 dias</SelectItem>
                <SelectItem value="last7">Últimos 7 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom date pickers */}
            {periodFilter === "custom" && (
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-sm gap-1 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {customFrom ? format(customFrom, "dd/MM/yyyy") : "De"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customFrom}
                      onSelect={setCustomFrom}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-sm gap-1 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {customTo ? format(customTo, "dd/MM/yyyy") : "Até"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customTo}
                      onSelect={setCustomTo}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground">
            {filtered.length} recorrência{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              Carregando...
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma recorrência encontrada para os filtros selecionados.
            </div>
          )}

          {/* Month groups */}
          {!isLoading && groupedByMonth.size > 0 && (
            <div className="space-y-2">
              {[...groupedByMonth.entries()].map(([monthKey, monthEntries]) => {
                const [year, month] = monthKey.split("-");
                const monthName = MONTH_NAMES[parseInt(month, 10) - 1];
                const isExpanded = expandedMonths.has(monthKey);

                return (
                  <div key={monthKey} className="rounded-lg border border-[#D4D5D6] dark:border-border bg-white dark:bg-transparent overflow-hidden">
                    {/* Month header */}
                    <button
                      onClick={() => toggleMonth(monthKey)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-semibold text-sm">
                          {monthName} {year}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {monthEntries.length} recorrência{monthEntries.length !== 1 ? "s" : ""}
                      </Badge>
                    </button>

                    {/* Month table */}
                    {isExpanded && (
                      <div className="border-t border-[#D4D5D6] dark:border-border overflow-x-auto">
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs">
                                Cliente
                              </TableHead>
                              <TableHead className="hidden sm:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
                                Serviço
                              </TableHead>
                              <TableHead className="hidden md:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
                                Aplicação
                              </TableHead>
                              <TableHead className="hidden sm:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
                                Realizado
                              </TableHead>
                              <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs">
                                Recorrência
                              </TableHead>
                              <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
                                Prévia
                              </TableHead>
                              <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
                                Vencimento
                              </TableHead>
                              <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
                                Pós
                              </TableHead>
                              <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs text-center">
                                Agendado
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthEntries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell className="py-2 text-sm font-medium">
                                  {entry.contact_name}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
                                  {entry.service_name}
                                </TableCell>
                                <TableCell className="hidden md:table-cell py-2 text-sm text-muted-foreground">
                                  {entry.application_name}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
                                  {formatDateBR(entry.procedure_date)}
                                </TableCell>
                                <TableCell className="py-2 text-sm font-medium">
                                  {formatDateBR(entry.recurrence_date)}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell py-2 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {getStatusBadge(entry.approach_1_status)}
                                    {entry.approach_1_date && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {formatDateBR(entry.approach_1_date)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell py-2 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {getStatusBadge(entry.approach_2_status)}
                                    {entry.approach_2_date && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {formatDateBR(entry.approach_2_date)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell py-2 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {getStatusBadge(entry.approach_3_status)}
                                    {entry.approach_3_date && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {formatDateBR(entry.approach_3_date)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-center">
                                  {getScheduledBadge(entry.scheduled)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Recurrence;
