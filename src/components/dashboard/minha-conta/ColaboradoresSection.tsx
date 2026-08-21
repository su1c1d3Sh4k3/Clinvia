import { useMemo, useState } from "react";
import {
    startOfDay, endOfDay, subDays, startOfMonth, startOfYear, subMonths,
    eachDayOfInterval, differenceInMinutes,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Users, UserRound, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaff } from "@/hooks/useStaff";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useTeamOnlineStatus } from "@/hooks/useMonitoramento";
import { useAgentTicketCounts, useSatisfactionAgents } from "@/hooks/useMinhaConta";
import {
    useAppointmentsRange, useProfessionalsDashboard, useProfessionalNps,
    formatCurrency, dailyWorkMinutes,
} from "@/hooks/useAppointmentsDashboard";
import { OccupancyGauge } from "./OccupancyGauge";

type PeriodKey = "hoje" | "7d" | "mes" | "ano" | "total";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "7d", label: "7 dias" },
    { key: "mes", label: "Mês" },
    { key: "ano", label: "Ano" },
    { key: "total", label: "Total" },
];

// Mesmo formato da aba Satisfação
const fmtDuration = (seconds: number | null | undefined): string => {
    if (seconds == null || !Number.isFinite(seconds)) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min`;
    return `${Math.floor(s / 86400)}d ${Math.round((s % 86400) / 3600)}h`;
};

export function ColaboradoresSection() {
    const [period, setPeriod] = useState<PeriodKey>("hoje");

    const { startISO, endISO } = useMemo(() => {
        const now = new Date();
        const end = endOfDay(now);
        let start: Date;
        switch (period) {
            case "hoje": start = startOfDay(now); break;
            case "7d": start = startOfDay(subDays(now, 6)); break;
            case "mes": start = startOfMonth(now); break;
            case "ano": start = startOfYear(now); break;
            case "total": start = new Date(2020, 0, 1); break;
        }
        return { startISO: start.toISOString(), endISO: end.toISOString() };
    }, [period]);

    // Ocupação: no período "total" clampada aos últimos 12 meses (expediente
    // de anos sem dado zeraria a taxa); count/revenue seguem o range cheio
    const { occStartISO, occEndISO } = useMemo(() => {
        if (period !== "total") return { occStartISO: startISO, occEndISO: endISO };
        const now = new Date();
        return {
            occStartISO: startOfDay(subMonths(now, 12)).toISOString(),
            occEndISO: endOfDay(now).toISOString(),
        };
    }, [period, startISO, endISO]);

    const { data: ownerId } = useOwnerId();
    const { data: staff } = useStaff();
    const { data: onlineSet } = useTeamOnlineStatus();
    const { data: agentCounts } = useAgentTicketCounts(startISO, endISO);
    const { data: satAgents } = useSatisfactionAgents(startISO, endISO);

    const { data: professionals } = useProfessionalsDashboard();
    // AVISO: período "total" carrega todos os appointments do tenant (limit 10000) — aceito
    const { data: appointments, isLoading: loadingAppts } = useAppointmentsRange(startISO, endISO);
    const { data: occAppointments } = useAppointmentsRange(occStartISO, occEndISO);
    const { data: profNps } = useProfessionalNps(ownerId, startISO, endISO);

    const satOf = (teamMemberId: string) =>
        (satAgents || []).find((a) => a.id === teamMemberId);
    const iaAgent = (satAgents || []).find((a) => a.is_ai || a.id === "ia");
    const npsOf = (id: string) => (profNps || []).find((n) => n.professional_id === id);

    // ── Ranking de profissionais (mesma agregação do RankingsSection) ──
    const topProfessionals = useMemo(() => {
        const completed = (appointments || []).filter((a) => a.status === "completed");
        const profMap = new Map<string, { id: string; name: string; count: number; total: number; procedures: Map<string, number> }>();
        completed.forEach((a) => {
            if (!a.professional_id) return;
            const existing = profMap.get(a.professional_id) || {
                id: a.professional_id,
                name: a.professional_name || "Sem nome",
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
        return Array.from(profMap.values())
            .map((p) => ({
                ...p,
                topProcedure: Array.from(p.procedures.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
            }))
            .sort((a, b) => b.count - a.count);
    }, [appointments]);

    // ── Ocupação por período: minutos agendados / minutos de expediente ──
    const occupancyOf = useMemo(() => {
        const map = new Map<string, number | null>();
        if (!professionals) return map;
        const rangeStart = new Date(occStartISO);
        const rangeEnd = new Date(occEndISO);
        const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        for (const prof of professionals) {
            const available = days.reduce((sum, d) => sum + dailyWorkMinutes(prof, d.getDay()), 0);
            if (available <= 0) {
                map.set(prof.id, null);
                continue;
            }
            const booked = (occAppointments || [])
                .filter((a) => a.professional_id === prof.id && !["canceled", "no-show"].includes(a.status))
                .reduce((sum, a) => sum + differenceInMinutes(new Date(a.end_time), new Date(a.start_time)), 0);
            map.set(prof.id, Math.min(100, Math.round((booked / available) * 100)));
        }
        return map;
    }, [professionals, occAppointments, occStartISO, occEndISO]);

    const photoOf = (id: string) => (professionals || []).find((p) => p.id === id)?.photo_url || undefined;

    const occupancyTitle = period === "total" ? "Ocupação dos últimos 12 meses" : undefined;

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-500" />
                        Colaboradores
                    </CardTitle>
                    <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                        <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PERIOD_OPTIONS.map((o) => (
                                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* ── Atendentes (Monitoramento + métricas de Satisfação) ── */}
                <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-violet-500" />
                        Atendentes
                    </h4>
                    {!staff || staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum atendente cadastrado</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {staff.map((m) => {
                                const online = onlineSet?.has(m.id) ?? false;
                                const counts = agentCounts?.get(m.id) || { open: 0, pending: 0, resolved: 0 };
                                const sat = satOf(m.id);
                                return (
                                    <div key={m.id} className="p-2.5 rounded-lg border border-border/40 bg-muted/20 space-y-1.5">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9 shrink-0">
                                                <AvatarImage src={m.avatar_url || undefined} alt={m.name} />
                                                <AvatarFallback className="text-xs">
                                                    {m.name.slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">{m.name}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {counts.open} abertos · {counts.pending} pendentes · {counts.resolved} resolvidos
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                                                <span className="text-[11px] text-muted-foreground">{online ? "Online" : "Offline"}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pl-12">
                                            <span>Resp. média: <span className="font-medium text-foreground">{fmtDuration(sat?.avg_response_seconds)}</span></span>
                                            <span>Atendimento: <span className="font-medium text-foreground">{fmtDuration(sat?.total_attendance_seconds)}</span></span>
                                            <span>Sentimento: <span className="font-medium text-foreground">{sat?.avg_sentiment != null ? `${Number(sat.avg_sentiment).toFixed(1)}/10` : "—"}</span></span>
                                            <span>Atendimentos: <span className="font-medium text-foreground">{sat?.attendance_count ?? 0}</span></span>
                                        </div>
                                    </div>
                                );
                            })}
                            {iaAgent && (
                                <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20 space-y-1.5">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 shrink-0">
                                            <AvatarFallback className="text-xs bg-teal-500/15 text-teal-600">
                                                <Bot className="w-4 h-4" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{iaAgent.name || "IA"}</p>
                                            <p className="text-[11px] text-muted-foreground">Agente de IA</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pl-12">
                                        <span>Resp. média: <span className="font-medium text-foreground">{fmtDuration(iaAgent.avg_response_seconds)}</span></span>
                                        <span>Atendimento: <span className="font-medium text-foreground">{fmtDuration(iaAgent.total_attendance_seconds)}</span></span>
                                        <span>Sentimento: <span className="font-medium text-foreground">{iaAgent.avg_sentiment != null ? `${Number(iaAgent.avg_sentiment).toFixed(1)}/10` : "—"}</span></span>
                                        <span>Atendimentos: <span className="font-medium text-foreground">{iaAgent.attendance_count ?? 0}</span></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Ranking de Profissionais (com gauge de ocupação) ── */}
                <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-500" />
                        Ranking de Profissionais
                    </h4>
                    {loadingAppts ? (
                        <p className="text-sm text-muted-foreground">Carregando...</p>
                    ) : topProfessionals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum procedimento finalizado no período</p>
                    ) : (
                        <div className="space-y-2">
                            {topProfessionals.map((p, i) => (
                                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20">
                                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}º</span>
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarImage src={photoOf(p.id)} />
                                        <AvatarFallback className="text-xs">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <OccupancyGauge percent={occupancyOf.get(p.id) ?? null} title={occupancyTitle} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{p.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">Mais realizado: {p.topProcedure}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold">{p.count} proced.</p>
                                        <p className="text-xs text-emerald-600 font-medium">{formatCurrency(p.total)}</p>
                                    </div>
                                    <div className="text-right shrink-0 w-16">
                                        <p className="text-sm font-semibold flex items-center justify-end gap-1">
                                            <Star className="w-3.5 h-3.5 text-amber-500" />
                                            {npsOf(p.id)?.avg_nps ?? "—"}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            NPS{npsOf(p.id) ? ` (${npsOf(p.id)!.nps_count})` : ""}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
