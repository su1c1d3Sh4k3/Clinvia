import { useMemo, useState } from "react";
import {
    startOfWeek,
    endOfWeek,
    addWeeks,
    startOfMonth,
    startOfDay,
    endOfDay,
    eachDayOfInterval,
    isSameDay,
    format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthYearSelect, TodayToggle } from "./PeriodControls";
import {
    useAppointmentsRange,
    useProfessionalsDashboard,
    dailyWorkMinutes,
} from "@/hooks/useAppointmentsDashboard";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function OcupacaoSection() {
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
    const [todayOn, setTodayOn] = useState(false);
    const [selectedProf, setSelectedProf] = useState("all");

    const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 0 }), [weekStart]);

    const { data: professionals } = useProfessionalsDashboard();
    const { data: appointments, isLoading } = useAppointmentsRange(
        startOfDay(weekStart).toISOString(),
        endOfDay(weekEnd).toISOString()
    );

    const handleMonthYearChange = (month: number, year: number) => {
        const firstOfMonth = startOfMonth(new Date(year, month - 1, 1));
        setWeekStart(startOfWeek(firstOfMonth, { weekStartsOn: 0 }));
    };

    const chartData = useMemo(() => {
        const items = (appointments || []).filter((a) => a.status !== "canceled");
        const profs = professionals || [];
        const activeProfs = selectedProf === "all" ? profs : profs.filter((p) => p.id === selectedProf);
        const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
        const today = new Date();

        const data = days.map((day) => {
            const dow = day.getDay();
            const availableMinutes = activeProfs.reduce((sum, p) => sum + dailyWorkMinutes(p, dow), 0);
            const bookedMinutes = items
                .filter((a) => {
                    if (!isSameDay(new Date(a.start_time), day)) return false;
                    if (selectedProf !== "all" && a.professional_id !== selectedProf) return false;
                    return true;
                })
                .reduce((sum, a) => {
                    const dur = (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
                    return sum + Math.max(0, dur);
                }, 0);

            return {
                day: DAY_LABELS[dow],
                date: day,
                ocupacao: availableMinutes > 0
                    ? Math.min(100, Math.round((bookedMinutes / availableMinutes) * 1000) / 10)
                    : 0,
            };
        });

        return todayOn ? data.filter((d) => isSameDay(d.date, today)) : data;
    }, [appointments, professionals, selectedProf, weekStart, weekEnd, todayOn]);

    const weekLabel = `${format(weekStart, "dd MMM", { locale: ptBR })} – ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`;

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Taxa de Ocupação</h3>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setWeekStart((w) => addWeeks(w, -1))}
                                disabled={todayOn}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-xs font-medium min-w-[150px] text-center capitalize">
                                {weekLabel}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                                disabled={todayOn}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <MonthYearSelect
                            month={weekStart.getMonth() + 1}
                            year={weekStart.getFullYear()}
                            onMonthChange={(m) => handleMonthYearChange(m, weekStart.getFullYear())}
                            onYearChange={(y) => handleMonthYearChange(weekStart.getMonth() + 1, y)}
                            disabled={todayOn}
                        />
                        <TodayToggle checked={todayOn} onCheckedChange={setTodayOn} />
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
                            <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                domain={[0, 100]}
                                tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                                formatter={(value: number) => [`${value}%`, "Ocupação"]}
                            />
                            <Bar dataKey="ocupacao" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
