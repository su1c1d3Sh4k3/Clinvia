import { ReportCard } from "./ReportCard";
import { AppointmentHeatmap } from "./AppointmentHeatmap";
import { AppointmentMetrics, calcEvolution } from "@/hooks/useReportData";
import {
    Calendar, CheckCircle, Clock, RefreshCw, XCircle, Users,
    Target, TrendingUp, AlertTriangle, UserX, Activity,
} from "lucide-react";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";

interface AppointmentsReportProps {
    data: AppointmentMetrics;
    comparison?: AppointmentMetrics | null;
}

const STATUS_COLORS: Record<string, string> = {
    Pendentes: "#f59e0b",
    Confirmados: "#3b82f6",
    Concluídos: "#10b981",
    Reagendados: "#8b5cf6",
    Cancelados: "#ef4444",
};

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CARD = "relative group rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-6 hover:shadow-md hover:border-border/80 transition-all duration-300";

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            {label && <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>}
            <div className="space-y-1.5">
                {payload.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color || e.payload?.fill }} />
                        <span className="text-muted-foreground">{e.name}:</span>
                        <span className="font-semibold">{e.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Calcula dias restantes no mês e ritmo necessário
function getMonthPacing(achieved: number, target: number): { daysLeft: number; neededPerDay: number } {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, lastDay - now.getDate());
    const remaining = Math.max(0, target - achieved);
    const neededPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0;
    return { daysLeft, neededPerDay };
}

// Cor do progresso por % (verde ≥80, amarelo ≥50, vermelho <50)
function progressColor(pct: number): string {
    if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function progressBarColor(pct: number): string {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
}

export function AppointmentsReport({ data, comparison }: AppointmentsReportProps) {
    const statusData = [
        { name: "Pendentes", value: data.pending },
        { name: "Confirmados", value: data.confirmed },
        { name: "Concluídos", value: data.completed },
        { name: "Reagendados", value: data.rescheduled },
        { name: "Cancelados", value: data.canceled },
    ];
    const statusPie = statusData.filter(d => d.value > 0);

    const comparisonData = comparison ? [
        { name: "Total", atual: data.total, anterior: comparison.total },
        { name: "Pendentes", atual: data.pending, anterior: comparison.pending },
        { name: "Confirmados", atual: data.confirmed, anterior: comparison.confirmed },
        { name: "Concluídos", atual: data.completed, anterior: comparison.completed },
        { name: "Reagendados", atual: data.rescheduled, anterior: comparison.rescheduled },
        { name: "Cancelados", atual: data.canceled, anterior: comparison.canceled },
    ] : [];

    const professionalBarData = data.byProfessional.slice(0, 10).map(p => ({
        name: p.professional_name.length > 14 ? p.professional_name.slice(0, 12) + "..." : p.professional_name,
        fullName: p.professional_name,
        Agendamentos: p.count,
    }));

    const occupancyChartData = data.occupancyByProfessional.slice(0, 8).map(p => ({
        name: p.professional_name.length > 14 ? p.professional_name.slice(0, 12) + "..." : p.professional_name,
        fullName: p.professional_name,
        Ocupação: p.occupancy,
        bookedHours: p.bookedHours,
        totalHours: p.totalHours,
    }));

    const dowBarData = DOW_LABELS.map((label, dow) => {
        const match = data.byDayOfWeek.find(d => d.dow === dow);
        return { day: label, count: match?.count || 0 };
    });

    // Comparativo Meta × Realidade
    const goal = data.goal;
    const pacing = goal ? getMonthPacing(goal.achieved, goal.target) : null;

    const comparativoMeta = [
        { label: "Meta", value: goal?.target || 0, color: "#6366f1" },
        { label: "Realizados", value: data.total, color: "#3b82f6" },
        { label: "Concluídos", value: data.completed, color: "#10b981" },
        { label: "No-show", value: data.pureNoShowCount, color: "#f59e0b" },
        { label: "Cancelados", value: data.canceled, color: "#ef4444" },
    ];

    // Daily progress + projeção linear
    const dailyProgressChart = data.dailyProgress.map(d => ({
        date: d.date.slice(5), // MM-DD
        Acumulado: d.cumulative,
    }));

    return (
        <div className="space-y-8">
            {/* ══════════ SEÇÃO 1: Meta Mensal (destaque) ══════════ */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10"><Target className="w-4 h-4 text-indigo-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Meta Mensal</h3>
                </div>
                {goal ? (
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{MONTH_NAMES[goal.month - 1]} / {goal.year}</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-4xl font-black ${progressColor(goal.progressPct)}`}>
                                        {goal.progressPct.toFixed(0)}%
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    <span className="font-semibold">{goal.achieved}</span> de {goal.target} concluídos
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <div className="w-full h-4 rounded-full bg-muted/40 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ease-out ${progressBarColor(goal.progressPct)}`}
                                        style={{ width: `${Math.min(100, goal.progressPct)}%` }}
                                    />
                                </div>
                                {pacing && pacing.daysLeft > 0 && (
                                    <p className="text-xs text-muted-foreground mt-3">
                                        Faltam <span className="font-semibold">{pacing.daysLeft} dias</span>.
                                        {" "}Ritmo necessário: <span className="font-semibold">{pacing.neededPerDay}/dia</span>
                                    </p>
                                )}
                                {pacing && pacing.daysLeft === 0 && (
                                    <p className="text-xs text-muted-foreground mt-3">
                                        Último dia do mês — acompanhe o fechamento.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={CARD}>
                        <div className="relative z-10 flex items-center gap-3">
                            <Target className="w-8 h-8 text-muted-foreground/40" />
                            <div>
                                <p className="text-sm font-semibold">Meta não configurada</p>
                                <p className="text-xs text-muted-foreground">
                                    Defina em Agenda → Configurações → Meta Mensal de Agendamentos
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ══════════ SEÇÃO 2: KPIs de Conclusão ══════════ */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><Calendar className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo de Agendamentos</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <ReportCard label="Total" value={data.total} icon={<Calendar className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined} featured />
                    <ReportCard label="Pendentes" value={data.pending} icon={<Clock className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined} />
                    <ReportCard label="Confirmados" value={data.confirmed} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.confirmed, comparison.confirmed) : undefined} />
                    <ReportCard label="Concluídos" value={data.completed} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.completed, comparison.completed) : undefined} />
                    <ReportCard label="Reagendados" value={data.rescheduled} icon={<RefreshCw className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.rescheduled, comparison.rescheduled) : undefined} />
                    <ReportCard label="Cancelados" value={data.canceled} icon={<XCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.canceled, comparison.canceled) : undefined} />
                </div>

                {/* Cards de No-show */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className={CARD}>
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Taxa de No-show</span>
                                <div className="flex items-baseline gap-1.5 mt-2">
                                    <span className={`text-2xl md:text-3xl font-black tracking-tight ${data.noShowRate > 30 ? "text-red-600 dark:text-red-400" : ""}`}>
                                        {data.noShowRate.toFixed(1)}
                                    </span>
                                    <span className="text-sm font-semibold text-muted-foreground">%</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{data.notCompletedCount} não concluídos</p>
                            </div>
                            <div className={`p-2 rounded-xl ${data.noShowRate > 30 ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}>
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                    <ReportCard
                        label="No-show puro"
                        value={data.pureNoShowCount}
                        suffix={data.total > 0 ? `(${((data.pureNoShowCount / data.total) * 100).toFixed(1)}%)` : undefined}
                        icon={<UserX className="w-4 h-4" />}
                    />
                    <ReportCard
                        label="Cancelamentos"
                        value={data.canceled}
                        suffix={data.total > 0 ? `(${data.canceledRate.toFixed(1)}%)` : undefined}
                        icon={<XCircle className="w-4 h-4" />}
                    />
                </div>
            </section>

            {/* ══════════ SEÇÃO 3: Comparativo Meta × Realidade ══════════ */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10"><TrendingUp className="w-4 h-4 text-indigo-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Meta × Realidade</h3>
                </div>
                <div className={CARD}>
                    <div className="relative z-10">
                        <p className="text-xs text-muted-foreground mb-4">Comparativo consolidado do período com linha de referência da meta</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={comparativoMeta}>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                {goal && (
                                    <ReferenceLine
                                        y={goal.target}
                                        stroke="#6366f1"
                                        strokeDasharray="4 4"
                                        label={{ value: `Meta: ${goal.target}`, position: "insideTopRight", fill: "#6366f1", fontSize: 11 }}
                                    />
                                )}
                                <Bar dataKey="value" name="Quantidade" radius={[6, 6, 0, 0]}>
                                    {comparativoMeta.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {/* ══════════ SEÇÃO 4: Crescimento Diário ══════════ */}
            {dailyProgressChart.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10"><Activity className="w-4 h-4 text-emerald-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Crescimento Diário (Concluídos)</h3>
                    </div>
                    <div className={CARD}>
                        <div className="relative z-10">
                            <p className="text-xs text-muted-foreground mb-4">Agendamentos concluídos cumulativos ao longo do período</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={dailyProgressChart}>
                                    <defs>
                                        <linearGradient id="daily-progress-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip />} />
                                    {goal && (
                                        <ReferenceLine
                                            y={goal.target}
                                            stroke="#6366f1"
                                            strokeDasharray="4 4"
                                            label={{ value: `Meta: ${goal.target}`, position: "insideTopRight", fill: "#6366f1", fontSize: 11 }}
                                        />
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="Acumulado"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={{ r: 3, fill: "#10b981" }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            )}

            {/* ══════════ SEÇÃO 5: Breakdown (2 donuts) ══════════ */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '320ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-amber-500/10"><Clock className="w-4 h-4 text-amber-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Breakdown de Categorias</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Donut 1: Status */}
                    <div className={CARD}>
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Status dos Agendamentos</h4>
                            <p className="text-xs text-muted-foreground mb-4">Distribuição por situação</p>
                            {statusPie.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie
                                                data={statusPie}
                                                cx="50%" cy="50%"
                                                innerRadius={55} outerRadius={85}
                                                paddingAngle={3} dataKey="value"
                                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                            >
                                                {statusPie.map((d, i) => (
                                                    <Cell key={i} fill={STATUS_COLORS[d.name]} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                                        {statusPie.map(d => (
                                            <span
                                                key={d.name}
                                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-muted/50"
                                            >
                                                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                                                {d.name}: {d.value}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                                    <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem agendamentos</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bar Concluídos vs Não-concluídos */}
                    <div className={CARD}>
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Concluídos vs Não-concluídos</h4>
                            <p className="text-xs text-muted-foreground mb-4">Detalhe do que aconteceu com os agendamentos</p>
                            {data.total > 0 ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={[
                                        { name: "Concluídos", value: data.completed, fill: "#10b981" },
                                        { name: "No-show puro", value: data.pureNoShowCount, fill: "#f59e0b" },
                                        { name: "Cancelados", value: data.canceled, fill: "#ef4444" },
                                    ]}>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                        <Bar dataKey="value" name="Quantidade" radius={[6, 6, 0, 0]}>
                                            {[
                                                { fill: "#10b981" }, { fill: "#f59e0b" }, { fill: "#ef4444" },
                                            ].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                                    <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem dados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════ SEÇÃO 6: Por Profissional ══════════ */}
            {professionalBarData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><Users className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Por Profissional</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Gráfico: Agendamentos por profissional */}
                        <div className={CARD}>
                            <div className="relative z-10">
                                <h4 className="text-sm font-semibold mb-1">Volume de Agendamentos</h4>
                                <p className="text-xs text-muted-foreground mb-4">Top {professionalBarData.length} profissionais</p>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={professionalBarData} margin={{ left: 0, right: 8 }}>
                                        <defs>
                                            <linearGradient id="prof-bar" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={60} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                    <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName || d.name}</p>
                                                    <p className="text-sm font-semibold">{d.Agendamentos} agendamentos</p>
                                                </div>
                                            );
                                        }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                        <Bar dataKey="Agendamentos" fill="url(#prof-bar)" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Ocupação (já existia) */}
                        <div className={CARD}>
                            <div className="relative z-10">
                                <h4 className="text-sm font-semibold mb-1">Taxa de Ocupação</h4>
                                <p className="text-xs text-muted-foreground mb-4">Horas agendadas / horas disponíveis</p>
                                {occupancyChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={occupancyChartData} layout="vertical" margin={{ left: 0 }}>
                                            <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} horizontal={false} />
                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} axisLine={false} tickLine={false} />
                                            <Tooltip content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                        <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName}</p>
                                                        <p className="text-sm font-semibold">{d.Ocupação}% ocupação</p>
                                                        <p className="text-xs text-muted-foreground">{d.bookedHours}h / {d.totalHours}h</p>
                                                    </div>
                                                );
                                            }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                            <Bar dataKey="Ocupação" radius={[0, 6, 6, 0]}>
                                                {occupancyChartData.map((d, i) => {
                                                    const color = d.Ocupação >= 80 ? "#10b981" : d.Ocupação >= 50 ? "#f59e0b" : "#ef4444";
                                                    return <Cell key={i} fill={color} />;
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                                        <Users className="w-10 h-10 mb-2 opacity-20" />
                                        <p className="text-sm">Sem dados de ocupação</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ══════════ SEÇÃO 7: Padrões Temporais ══════════ */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '480ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-purple-500/10"><Clock className="w-4 h-4 text-purple-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Padrões Temporais</h3>
                </div>

                {/* Dias da semana */}
                <div className={`${CARD} mb-6`}>
                    <div className="relative z-10">
                        <h4 className="text-sm font-semibold mb-1">Agendamentos por Dia da Semana</h4>
                        <p className="text-xs text-muted-foreground mb-4">Volume distribuído entre os 7 dias</p>
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={dowBarData}>
                                <defs>
                                    <linearGradient id="dow-bar" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.6} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Bar dataKey="count" name="Agendamentos" fill="url(#dow-bar)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Heatmap dia x hora */}
                <div className={CARD}>
                    <div className="relative z-10">
                        <h4 className="text-sm font-semibold mb-1">Horários Mais Cheios (Heatmap)</h4>
                        <p className="text-xs text-muted-foreground mb-4">
                            Cada célula mostra a intensidade de agendamentos no cruzamento dia × hora (horário de Brasília)
                        </p>
                        <AppointmentHeatmap data={data.byHourHeatmap} startHour={6} endHour={22} />
                    </div>
                </div>
            </section>

            {/* ══════════ SEÇÃO 8: Comparativo período anterior ══════════ */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '560ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><Calendar className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Períodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="appt-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="appt-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Período Atual" fill="url(#appt-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Período Anterior" fill="url(#appt-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}
        </div>
    );
}
