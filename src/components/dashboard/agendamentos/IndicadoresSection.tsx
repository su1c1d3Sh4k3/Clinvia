import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import {
    CalendarPlus,
    CheckCircle2,
    XCircle,
    UserX,
    DollarSign,
    TrendingDown,
    Percent,
} from "lucide-react";
import { MonthYearSelect, TodayToggle } from "./PeriodControls";
import { useAppointmentsRange, formatCurrency } from "@/hooks/useAppointmentsDashboard";

export function IndicadoresSection() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [todayOn, setTodayOn] = useState(false);

    const { startISO, endISO } = useMemo(() => {
        if (todayOn) {
            return {
                startISO: startOfDay(new Date()).toISOString(),
                endISO: endOfDay(new Date()).toISOString(),
            };
        }
        const base = new Date(year, month - 1, 1);
        return {
            startISO: startOfMonth(base).toISOString(),
            endISO: endOfMonth(base).toISOString(),
        };
    }, [month, year, todayOn]);

    const { data: appointments, isLoading } = useAppointmentsRange(startISO, endISO);

    const metrics = useMemo(() => {
        const items = appointments || [];
        const completed = items.filter((a) => a.status === "completed");
        const canceled = items.filter((a) => a.status === "canceled");
        const noShow = items.filter((a) => a.status === "no-show");
        const faturamento = completed.reduce((s, a) => s + (Number(a.price) || 0), 0);
        const perda = [...canceled, ...noShow].reduce((s, a) => s + (Number(a.price) || 0), 0);
        return {
            total: items.length,
            completed: completed.length,
            canceled: canceled.length,
            noShow: noShow.length,
            faturamento,
            perda,
            conversao: items.length > 0 ? Math.round((completed.length / items.length) * 1000) / 10 : 0,
        };
    }, [appointments]);

    const cards = [
        {
            title: "Realizados",
            value: String(metrics.total),
            icon: CalendarPlus,
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
        },
        {
            title: "Finalizados",
            value: String(metrics.completed),
            icon: CheckCircle2,
            color: "text-emerald-500",
            bgColor: "bg-emerald-500/10",
        },
        {
            title: "Cancelados",
            value: String(metrics.canceled),
            icon: XCircle,
            color: "text-red-500",
            bgColor: "bg-red-500/10",
        },
        {
            title: "No-show",
            value: String(metrics.noShow),
            icon: UserX,
            color: "text-orange-500",
            bgColor: "bg-orange-500/10",
        },
        {
            title: "Faturamento",
            value: formatCurrency(metrics.faturamento),
            icon: DollarSign,
            color: "text-emerald-600",
            bgColor: "bg-emerald-600/10",
        },
        {
            title: "Perda",
            value: formatCurrency(metrics.perda),
            icon: TrendingDown,
            color: "text-rose-500",
            bgColor: "bg-rose-500/10",
        },
        {
            title: "Taxa de Conversão",
            value: `${metrics.conversao}%`,
            icon: Percent,
            color: "text-violet-500",
            bgColor: "bg-violet-500/10",
        },
    ];

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Indicadores</h3>
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

                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                    {cards.map((card) => (
                        <Card
                            key={card.title}
                            className="relative group overflow-hidden rounded-xl bg-white dark:bg-card border border-border/50 shadow-sm hover:shadow-md transition-all duration-300"
                        >
                            <CardContent className="p-3 md:p-4">
                                <div className={`p-2 rounded-lg w-fit ${card.bgColor}`}>
                                    <card.icon className={`w-4 h-4 ${card.color}`} />
                                </div>
                                <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider mt-2">
                                    {card.title}
                                </p>
                                <p className={`text-base md:text-lg font-bold mt-0.5 ${card.color}`}>
                                    {isLoading ? "—" : card.value}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
