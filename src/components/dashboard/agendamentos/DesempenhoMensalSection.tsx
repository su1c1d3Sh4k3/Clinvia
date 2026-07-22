import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, isSameDay } from "date-fns";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { MonthYearSelect, TodayToggle } from "./PeriodControls";
import { useAppointmentsRange, useProfessionalsDashboard } from "@/hooks/useAppointmentsDashboard";

const LINE_COLORS = [
    "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

export function DesempenhoMensalSection() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [todayOn, setTodayOn] = useState(false);

    const { startISO, endISO, days } = useMemo(() => {
        const base = new Date(year, month - 1, 1);
        const start = todayOn ? startOfDay(new Date()) : startOfMonth(base);
        const end = todayOn ? endOfDay(new Date()) : endOfMonth(base);
        return {
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            days: eachDayOfInterval({ start, end }),
        };
    }, [month, year, todayOn]);

    const { data: professionals } = useProfessionalsDashboard();
    const { data: appointments, isLoading } = useAppointmentsRange(startISO, endISO);

    const { chartData, activeProfs } = useMemo(() => {
        const items = appointments || [];
        const profs = (professionals || []).filter((p) =>
            items.some((a) => a.professional_id === p.id)
        );

        const data = days.map((day) => {
            const row: Record<string, any> = { day: String(day.getDate()) };
            profs.forEach((p) => {
                row[p.name] = items.filter(
                    (a) => a.professional_id === p.id && isSameDay(new Date(a.start_time), day)
                ).length;
            });
            return row;
        });

        return { chartData: data, activeProfs: profs };
    }, [appointments, professionals, days]);

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Desempenho Mensal</h3>
                    <div className="flex items-center gap-4">
                        <MonthYearSelect
                            month={month}
                            year={year}
                            onMonthChange={setMonth}
                            onYearChange={setYear}
                            disabled={todayOn}
                        />
                        <TodayToggle checked={todayOn} onCheckedChange={setTodayOn} />
                    </div>
                </div>

                {isLoading ? (
                    <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
                        Carregando...
                    </div>
                ) : activeProfs.length === 0 ? (
                    <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
                        Nenhum agendamento no período
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                            <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                            />
                            <Legend />
                            {activeProfs.map((p, i) => (
                                <Line
                                    key={p.id}
                                    type="monotone"
                                    dataKey={p.name}
                                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                    strokeWidth={2}
                                    dot={{ fill: LINE_COLORS[i % LINE_COLORS.length], r: 2 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
