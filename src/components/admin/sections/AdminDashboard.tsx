// @ts-nocheck - admin_get_dashboard_metrics fora dos types gerados
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Users, UserPlus, UserX, Clock, Coins, Send, Wifi, Instagram, ShieldAlert,
    Zap, Bell, Headphones, MessageSquare, Megaphone, Calendar, TrendingUp,
    AlertTriangle, MoonStar, RefreshCw,
} from "lucide-react";

const brl = (v: number) =>
    (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => (v ?? 0).toLocaleString("pt-BR");

function MetricCard({
    icon: Icon, label, value, hint, tone = "default", onClick,
}: {
    icon: any; label: string; value: string | number; hint?: string;
    tone?: "default" | "good" | "warn" | "bad"; onClick?: () => void;
}) {
    const toneClass = {
        default: "text-blue-400",
        good: "text-green-400",
        warn: "text-amber-400",
        bad: "text-red-400",
    }[tone];

    return (
        <Card
            className={`bg-gray-800 border-gray-700 ${onClick ? "cursor-pointer hover:border-gray-500 transition-colors" : ""}`}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${toneClass}`} />
                    <span className="text-xs text-gray-400 truncate">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
                {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
            </CardContent>
        </Card>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{children}</h3>;
}

export default function AdminDashboard() {
    const [, setSearchParams] = useSearchParams();

    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ["admin-dashboard-metrics"],
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await (supabase.rpc as any)("admin_get_dashboard_metrics");
            if (error) throw error;
            return data as any;
        },
    });

    const goToClient = (company: string | null) => {
        if (!company) return;
        setSearchParams({ tab: "clientes", q: company });
    };

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array(8).fill(0).map((_, i) => (
                    <div key={i} className="h-24 rounded-lg bg-gray-800 animate-pulse" />
                ))}
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-red-300">
                    Falha ao carregar métricas: {(error as any)?.message || "erro desconhecido"}
                </p>
                <button onClick={() => refetch()} className="ml-auto text-xs underline text-red-300">
                    Tentar novamente
                </button>
            </div>
        );
    }

    const { clients, tokens, templates, instances, instagram, health, usage, risk } = data;
    const topCost: any[] = data.top_cost || [];
    const deactivatedList: any[] = data.deactivated_list || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                    Atualizado às {new Date(data.generated_at).toLocaleTimeString("pt-BR")} · câmbio R$ {Number(data.exchange_rate).toFixed(2)}
                </p>
                <button
                    onClick={() => refetch()}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    Atualizar
                </button>
            </div>

            {/* Linha 1 — Negócio */}
            <div className="space-y-2">
                <SectionTitle>Negócio</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard icon={Users} label="Clientes ativos" value={num(clients.active_admins)} hint={`${num(clients.active)} usuários no total`} tone="good" />
                    <MetricCard icon={Coins} label="Tokens hoje" value={num(tokens.today_tokens)} hint={brl(tokens.today_brl)} />
                    <MetricCard icon={TrendingUp} label="Tokens no mês" value={brl(tokens.month_brl)} hint={`${num(tokens.month_tokens)} tokens`} />
                    <MetricCard icon={Send} label="Templates no mês" value={num(templates.month_count)} hint={`${brl(templates.month_brl)} · hoje ${num(templates.today_count)}`} />
                </div>
            </div>

            {/* Linha 2 — Conexões */}
            <div className="space-y-2">
                <SectionTitle>Conexões</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard icon={Wifi} label="WhatsApp conectadas" value={`${num(instances.connected)}/${num(instances.total)}`} hint={`${num(instances.meta)} Meta · ${num(instances.disconnected)} offline`} tone={instances.disconnected > 0 ? "warn" : "good"} />
                    <MetricCard icon={Instagram} label="Instagram conectadas" value={`${num(instagram.connected)}/${num(instagram.total)}`} hint={instagram.expiring > 0 ? `${num(instagram.expiring)} token(s) vencendo em 7d` : "Tokens em dia"} tone={instagram.expiring > 0 ? "warn" : "good"} />
                    <MetricCard icon={ShieldAlert} label="Restrições Meta" value={num(instances.restricted)} hint="Instâncias bloqueadas" tone={instances.restricted > 0 ? "bad" : "good"} />
                    <MetricCard icon={MessageSquare} label="Conversas ativas" value={num(usage.conversations_active)} hint="Abertas + pendentes" />
                </div>
            </div>

            {/* Linha 3 — Saúde operacional */}
            <div className="space-y-2">
                <SectionTitle>Saúde operacional</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard icon={Zap} label="Fila de webhooks" value={num(health.queue_pending + health.queue_processing)} hint={`${num(health.queue_failed)} falha(s) em 24h`} tone={health.queue_failed > 0 ? "warn" : "good"} />
                    <MetricCard icon={Bell} label="Alertas abertos" value={num(health.alerts_open)} hint="Não resolvidos" tone={health.alerts_open > 0 ? "warn" : "good"} />
                    <MetricCard icon={Headphones} label="Chamados abertos" value={num(health.tickets_open)} hint={`${num(health.tickets_urgent)} urgente(s)`} tone={health.tickets_urgent > 0 ? "bad" : health.tickets_open > 0 ? "warn" : "good"} onClick={() => setSearchParams({ tab: "suporte" })} />
                    <MetricCard icon={Clock} label="Aguardando resposta" value={num(health.tickets_waiting)} hint="Cliente falou por último" tone={health.tickets_waiting > 0 ? "warn" : "good"} onClick={() => setSearchParams({ tab: "suporte" })} />
                </div>
            </div>

            {/* Linha 4 — Crescimento */}
            <div className="space-y-2">
                <SectionTitle>Crescimento</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard icon={Clock} label="Cadastros pendentes" value={num(data.pending_signups)} hint="Aguardando aprovação" tone={data.pending_signups > 0 ? "warn" : "good"} onClick={() => setSearchParams({ tab: "clientes" })} />
                    <MetricCard icon={UserPlus} label="Novos no mês" value={num(clients.new_this_month)} hint="Contas aprovadas" tone="good" />
                    <MetricCard icon={UserX} label="Inativados" value={num(clients.deactivated)} hint="Em janela de retenção" tone={clients.deactivated > 0 ? "warn" : "good"} onClick={() => setSearchParams({ tab: "clientes" })} />
                    <MetricCard icon={Calendar} label="Agendamentos hoje" value={num(usage.appointments_today)} hint="Criados hoje" />
                </div>
            </div>

            {/* Linha 5 — Uso da plataforma */}
            <div className="space-y-2">
                <SectionTitle>Uso da plataforma</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard icon={MessageSquare} label="Mensagens recebidas" value={num(usage.messages_in)} hint="Hoje" />
                    <MetricCard icon={Send} label="Mensagens enviadas" value={num(usage.messages_out)} hint="Hoje" />
                    <MetricCard icon={Megaphone} label="Campanhas disparando" value={num(usage.campaigns_dispatching)} hint="Status dispatching" />
                    <MetricCard icon={Coins} label="Custo estimado do mês" value={brl(Number(tokens.month_brl) + Number(templates.month_brl))} hint="IA + templates Meta" />
                </div>
            </div>

            {/* Linha 6 — Ranking e risco */}
            <div className="space-y-2">
                <SectionTitle>Ranking e risco</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card className="bg-gray-800 border-gray-700">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <TrendingUp className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-medium text-white">Top 10 por custo (30 dias)</span>
                            </div>
                            {topCost.length === 0 ? (
                                <p className="text-xs text-gray-500">Nenhum consumo registrado.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {topCost.map((t: any, i: number) => (
                                        <button
                                            key={t.id}
                                            onClick={() => goToClient(t.company_name)}
                                            className="w-full flex items-center gap-2 text-left hover:bg-gray-700/50 rounded px-1.5 py-1 transition-colors"
                                        >
                                            <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}</span>
                                            <span className="text-xs text-gray-300 truncate flex-1">{t.company_name}</span>
                                            <span className="text-xs font-mono text-blue-400 shrink-0">{brl(Number(t.cost_brl))}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="space-y-3">
                        <Card className="bg-gray-800 border-gray-700">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-4 h-4 text-red-400" />
                                    <span className="text-sm font-medium text-white">Contas em risco</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <RiskRow
                                        label="Token OpenAI inválido"
                                        items={risk.invalid_openai}
                                        render={(r: any) => r.company_name}
                                        onPick={goToClient}
                                    />
                                    <RiskRow
                                        label="Instâncias com restrição Meta"
                                        items={risk.restricted_instances}
                                        render={(r: any) => `${r.company_name || "—"} · ${r.name}`}
                                        onPick={(_, r) => goToClient(r.company_name)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gray-800 border-gray-700">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <MoonStar className="w-4 h-4 text-amber-400" />
                                    <span className="text-sm font-medium text-white">
                                        Parados há 7+ dias ({(risk.idle_tenants || []).length})
                                    </span>
                                </div>
                                {(risk.idle_tenants || []).length === 0 ? (
                                    <p className="text-xs text-gray-500">Todos os clientes ativos nos últimos 7 dias.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {(risk.idle_tenants || []).map((t: any) => (
                                            <Badge
                                                key={t.id}
                                                variant="outline"
                                                className="border-amber-500/40 text-amber-300 cursor-pointer hover:bg-amber-500/10"
                                                onClick={() => goToClient(t.company_name)}
                                            >
                                                {t.company_name || "Sem nome"}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {deactivatedList.length > 0 && (
                            <Card className="bg-gray-800 border-gray-700">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <UserX className="w-4 h-4 text-red-400" />
                                        <span className="text-sm font-medium text-white">Inativados · prazo de exclusão</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {deactivatedList.map((p: any) => (
                                            <button
                                                key={p.id}
                                                onClick={() => goToClient(p.company_name)}
                                                className="w-full flex items-center gap-2 text-left hover:bg-gray-700/50 rounded px-1.5 py-1 transition-colors"
                                            >
                                                <span className="text-xs text-gray-300 truncate flex-1">
                                                    {p.company_name || p.full_name || "Sem nome"}
                                                </span>
                                                <span className={`text-xs font-mono shrink-0 ${p.days_remaining === 0 ? "text-red-400" : "text-amber-400"}`}>
                                                    {p.days_remaining === 0 ? "vencida" : `${p.days_remaining}d`}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RiskRow({
    label, items, render, onPick,
}: {
    label: string; items: any[]; render: (r: any) => string;
    onPick: (company: string | null, row: any) => void;
}) {
    const list = items || [];
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400">{label}</span>
                <span className={`font-mono ${list.length > 0 ? "text-red-400" : "text-green-400"}`}>{list.length}</span>
            </div>
            {list.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {list.map((r: any) => (
                        <Badge
                            key={r.id}
                            variant="outline"
                            className="border-red-500/40 text-red-300 cursor-pointer hover:bg-red-500/10"
                            onClick={() => onPick(r.company_name ?? null, r)}
                        >
                            {render(r)}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}
