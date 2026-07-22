import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Stethoscope, Users } from "lucide-react";
import { MonthYearSelect, TodayToggle } from "./PeriodControls";
import {
    useAppointmentsRange,
    useProfessionalsDashboard,
    formatCurrency,
} from "@/hooks/useAppointmentsDashboard";

export function RankingsSection() {
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

    const { data: professionals } = useProfessionalsDashboard();
    const { data: appointments, isLoading } = useAppointmentsRange(startISO, endISO);

    const { topServices, topProfessionals } = useMemo(() => {
        const completed = (appointments || []).filter((a) => a.status === "completed");

        // ── Services ranking ──
        const serviceMap = new Map<
            string,
            { name: string; application: string; price: number; count: number; revenue: number }
        >();
        completed.forEach((a) => {
            const key = a.service_id || a.service_name || "sem-servico";
            const existing = serviceMap.get(key);
            const label = a.service?.service_name?.name || a.service_name || "Sem serviço";
            const application = a.service?.name || a.service_name || "—";
            const price = Number(a.service?.price) || 0;
            const revenue = Number(a.price) || 0;
            if (existing) {
                existing.count += 1;
                existing.revenue += revenue;
            } else {
                serviceMap.set(key, { name: label, application, price, count: 1, revenue });
            }
        });
        const services = Array.from(serviceMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // ── Professionals ranking ──
        const profMap = new Map<
            string,
            { id: string; name: string; count: number; total: number; procedures: Map<string, number> }
        >();
        completed.forEach((a) => {
            if (!a.professional_id) return;
            const name = a.professional_name || "Sem nome";
            const existing = profMap.get(a.professional_id) || {
                id: a.professional_id,
                name,
                count: 0,
                total: 0,
                procedures: new Map<string, number>(),
            };
            existing.count += 1;
            existing.total += Number(a.price) || 0;
            const procLabel = a.service?.name || a.service_name || "—";
            existing.procedures.set(procLabel, (existing.procedures.get(procLabel) || 0) + 1);
            profMap.set(a.professional_id, existing);
        });
        const profs = Array.from(profMap.values())
            .map((p) => ({
                ...p,
                topProcedure:
                    Array.from(p.procedures.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
            }))
            .sort((a, b) => b.count - a.count);

        return { topServices: services, topProfessionals: profs };
    }, [appointments]);

    const photoOf = (id: string) => (professionals || []).find((p) => p.id === id)?.photo_url || undefined;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Serviços e Profissionais</h3>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ── Serviços ── */}
                <Card className="rounded-2xl border border-border/50 shadow-sm h-[420px] flex flex-col">
                    <CardHeader className="pb-2 shrink-0">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Stethoscope className="w-4 h-4 text-blue-500" />
                            Serviços mais realizados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto space-y-2 pb-4">
                        {isLoading ? (
                            <p className="text-sm text-muted-foreground">Carregando...</p>
                        ) : topServices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum procedimento finalizado no período</p>
                        ) : (
                            topServices.map((s, i) => (
                                <div
                                    key={`${s.name}-${s.application}-${i}`}
                                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                                >
                                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                                        {i + 1}º
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{s.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {s.application} · {formatCurrency(s.price)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold">{s.count} agend.</p>
                                        <p className="text-xs text-emerald-600 font-medium">
                                            {formatCurrency(s.revenue)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* ── Profissionais ── */}
                <Card className="rounded-2xl border border-border/50 shadow-sm h-[420px] flex flex-col">
                    <CardHeader className="pb-2 shrink-0">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-violet-500" />
                            Ranking de profissionais
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto space-y-2 pb-4">
                        {isLoading ? (
                            <p className="text-sm text-muted-foreground">Carregando...</p>
                        ) : topProfessionals.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum procedimento finalizado no período</p>
                        ) : (
                            topProfessionals.map((p, i) => (
                                <div
                                    key={p.id}
                                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                                >
                                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                                        {i + 1}º
                                    </span>
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarImage src={photoOf(p.id)} />
                                        <AvatarFallback className="text-xs">
                                            {p.name.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{p.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            Mais realizado: {p.topProcedure}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold">{p.count} proced.</p>
                                        <p className="text-xs text-emerald-600 font-medium">
                                            {formatCurrency(p.total)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
