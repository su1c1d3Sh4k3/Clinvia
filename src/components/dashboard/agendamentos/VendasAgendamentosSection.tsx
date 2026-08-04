import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthYearSelect, MONTHS } from "./PeriodControls";
import { useProfessionalsDashboard } from "@/hooks/useAppointmentsDashboard";

interface SaleRow {
    id: string;
    sale_date: string;
    professional_id: string | null;
    appointment: { status: string } | null;
}

interface AptRow {
    id: string;
    start_time: string;
    professional_id: string | null;
}

export function VendasAgendamentosSection() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [selectedProf, setSelectedProf] = useState("all");
    const [totalOn, setTotalOn] = useState(false);
    const [anualOn, setAnualOn] = useState(false);

    const { data: professionals } = useProfessionalsDashboard();

    // Período efetivo
    const range = useMemo(() => {
        if (totalOn) return null; // sem filtro de data
        if (anualOn) {
            return { start: `${year}-01-01`, end: `${year}-12-31` };
        }
        const lastDay = new Date(year, month, 0).getDate();
        const mm = String(month).padStart(2, "0");
        return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
    }, [totalOn, anualOn, month, year]);

    const { data: sales, isLoading: loadingSales } = useQuery({
        queryKey: ["dash-vendas-comparativo-sales", range?.start ?? "all", range?.end ?? "all"],
        queryFn: async () => {
            let q = supabase
                .from("sales" as any)
                .select("id, sale_date, professional_id, appointment:appointments!sales_appointment_id_fkey(status)");
            if (range) q = q.gte("sale_date", range.start).lte("sale_date", range.end);
            const { data, error } = await q;
            if (error) throw error;
            return (data || []) as unknown as SaleRow[];
        },
    });

    const { data: completedApts, isLoading: loadingApts } = useQuery({
        queryKey: ["dash-vendas-comparativo-apts", range?.start ?? "all", range?.end ?? "all"],
        queryFn: async () => {
            let q = supabase
                .from("appointments")
                .select("id, start_time, professional_id")
                .eq("type", "appointment")
                .eq("status", "completed");
            if (range) {
                q = q.gte("start_time", `${range.start}T00:00:00`).lte("start_time", `${range.end}T23:59:59`);
            }
            const { data, error } = await q;
            if (error) throw error;
            return (data || []) as unknown as AptRow[];
        },
    });

    const isLoading = loadingSales || loadingApts;

    const chartData = useMemo(() => {
        const filtSales = (sales || []).filter(
            (s) => selectedProf === "all" || s.professional_id === selectedProf
        );
        const filtApts = (completedApts || []).filter(
            (a) => selectedProf === "all" || a.professional_id === selectedProf
        );

        // Venda com agendamento pendente = sem agendamento concluído/cancelado vinculado
        const isPendingScheduling = (s: SaleRow) =>
            !s.appointment || !["completed", "canceled", "no-show"].includes(s.appointment.status);

        if (anualOn && !totalOn) {
            return MONTHS.map((m) => {
                const mSales = filtSales.filter(
                    (s) => new Date(s.sale_date + "T12:00:00").getMonth() + 1 === m.value
                );
                const mApts = filtApts.filter(
                    (a) => new Date(a.start_time).getMonth() + 1 === m.value
                );
                return {
                    label: m.label.slice(0, 3),
                    vendas: mSales.length,
                    concluidos: mApts.length,
                    pendentes: mSales.filter(isPendingScheduling).length,
                };
            });
        }

        return [
            {
                label: totalOn ? "Total" : MONTHS.find((m) => m.value === month)?.label || "",
                vendas: filtSales.length,
                concluidos: filtApts.length,
                pendentes: filtSales.filter(isPendingScheduling).length,
            },
        ];
    }, [sales, completedApts, selectedProf, anualOn, totalOn, month]);

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Vendas × Agendamentos</h3>
                    <div className="flex flex-wrap items-center gap-3">
                        <MonthYearSelect
                            month={month}
                            year={year}
                            onMonthChange={setMonth}
                            onYearChange={setYear}
                            disabled={totalOn}
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Anual</span>
                            <Switch
                                checked={anualOn}
                                onCheckedChange={setAnualOn}
                                disabled={totalOn}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Total</span>
                            <Switch checked={totalOn} onCheckedChange={setTotalOn} />
                        </div>
                    </div>
                </div>

                <Tabs value={selectedProf} onValueChange={setSelectedProf}>
                    <TabsList className="flex w-full flex-wrap h-auto justify-start">
                        <TabsTrigger value="all" className="text-xs">
                            Todos
                        </TabsTrigger>
                        {(professionals || []).map((p) => (
                            <TabsTrigger key={p.id} value={p.id} className="text-xs">
                                {p.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                        Carregando...
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.2} />
                            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="vendas" name="Vendas feitas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="concluidos" name="Agendamentos concluídos" fill="#22c55e" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="pendentes" name="Vendas c/ agendamento pendente" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
