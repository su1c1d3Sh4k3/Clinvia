import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Star, Brain, MessageSquareHeart, Bot, User, ChevronLeft, ChevronRight,
    Clock, Timer, Headphones, FileText, Loader2,
} from "lucide-react";
import {
    startOfDay, startOfWeek, startOfMonth, startOfYear,
    addDays, addWeeks, addMonths, addYears, format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Granularity = "day" | "week" | "month" | "year";

const GRANULARITY_LABELS: Record<Granularity, string> = {
    day: "Dia",
    week: "Semana",
    month: "Mês",
    year: "Ano",
};

interface SatisfactionData {
    cards: { avg_sentiment: number | null; avg_nps: number | null; nps_count: number | null };
    last_reviews: Array<{
        contact_name: string | null;
        phone: string | null;
        data: string;
        nota: number | null;
        feedback: string | null;
        attended_by: string | null;
        is_ai: boolean | null;
        duration_seconds: number | null;
        sentiment: number | null;
        professional: string | null;
        application: string | null;
    }>;
    agents: Array<{
        id: string;
        name: string;
        is_ai: boolean;
        avg_response_seconds: number | null;
        total_attendance_seconds: number | null;
        avg_sentiment: number | null;
        attendance_count: number;
    }>;
    templates: Array<{
        id: string;
        name: string;
        template_status: string | null;
        last_sent_at: string | null;
        sent_via: string | null;
        sent_by: string | null;
        send_status: string | null;
        responded: boolean;
        response_body: string | null;
    }>;
}

function periodRange(granularity: Granularity, offset: number): { start: Date; end: Date } {
    const now = new Date();
    switch (granularity) {
        case "day": {
            const start = startOfDay(addDays(now, offset));
            return { start, end: addDays(start, 1) };
        }
        case "week": {
            const start = startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
            return { start, end: addWeeks(start, 1) };
        }
        case "month": {
            const start = startOfMonth(addMonths(now, offset));
            return { start, end: addMonths(start, 1) };
        }
        case "year": {
            const start = startOfYear(addYears(now, offset));
            return { start, end: addYears(start, 1) };
        }
    }
}

function periodLabel(granularity: Granularity, start: Date, end: Date): string {
    switch (granularity) {
        case "day":
            return format(start, "dd 'de' MMMM yyyy", { locale: ptBR });
        case "week":
            return `${format(start, "dd/MM", { locale: ptBR })} — ${format(addDays(end, -1), "dd/MM/yyyy", { locale: ptBR })}`;
        case "month":
            return format(start, "MMMM yyyy", { locale: ptBR });
        case "year":
            return format(start, "yyyy");
    }
}

function fmtDuration(seconds: number | null | undefined): string {
    if (seconds == null || seconds < 0) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}min`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

function npsColor(nota: number | null | undefined): string {
    if (nota == null) return "text-muted-foreground";
    if (nota >= 4) return "text-emerald-600 dark:text-emerald-400";
    if (nota >= 3) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

const TEMPLATE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    APPROVED: { label: "Aprovado", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    REJECTED: { label: "Rejeitado", cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
    PENDING: { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    PAUSED: { label: "Pausado", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" },
};

export const SatisfacaoDashboard = () => {
    const { data: ownerId } = useOwnerId();
    const [granularity, setGranularity] = useState<Granularity>("month");
    const [offset, setOffset] = useState(0);

    const { start, end } = useMemo(() => periodRange(granularity, offset), [granularity, offset]);

    const { data, isLoading } = useQuery({
        queryKey: ["satisfaction-dashboard", ownerId, granularity, start.toISOString()],
        enabled: !!ownerId,
        queryFn: async (): Promise<SatisfactionData> => {
            const { data, error } = await supabase.rpc("get_satisfaction_dashboard" as any, {
                p_owner: ownerId,
                p_start: start.toISOString(),
                p_end: end.toISOString(),
            });
            if (error) throw error;
            return data as unknown as SatisfactionData;
        },
    });

    const cards = data?.cards;
    const reviews = data?.last_reviews || [];
    const agents = data?.agents || [];
    const templates = data?.templates || [];

    return (
        <div className="space-y-6">
            {/* Filtro de período */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border p-1">
                    {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                        <Button
                            key={g}
                            variant={granularity === g ? "default" : "ghost"}
                            size="sm"
                            className="h-7 px-3 text-xs"
                            onClick={() => { setGranularity(g); setOffset(0); }}
                        >
                            {GRANULARITY_LABELS[g]}
                        </Button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[180px] text-center text-sm font-medium capitalize">
                        {periodLabel(granularity, start, end)}
                    </span>
                    <Button
                        variant="outline" size="icon" className="h-7 w-7"
                        disabled={offset >= 0}
                        onClick={() => setOffset((o) => Math.min(0, o + 1))}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    {/* Cards gerais */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Média de Sentimento</CardTitle>
                                <Brain className="h-4 w-4 text-violet-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {cards?.avg_sentiment != null ? `${cards.avg_sentiment} / 10` : "—"}
                                </div>
                                <p className="text-xs text-muted-foreground">Análise de sentimento das conversas (IA)</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Média de Satisfação NPS</CardTitle>
                                <Star className="h-4 w-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {cards?.avg_nps != null ? `${cards.avg_nps} / 5` : "—"}
                                </div>
                                <p className="text-xs text-muted-foreground">Pesquisa de satisfação respondida pelos clientes</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Quantidade de Avaliações</CardTitle>
                                <MessageSquareHeart className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{cards?.nps_count ?? 0}</div>
                                <p className="text-xs text-muted-foreground">Avaliações NPS recebidas no período</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Últimas 10 avaliações */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Últimas Avaliações NPS</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {reviews.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma avaliação no período</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Contato</TableHead>
                                            <TableHead>Telefone</TableHead>
                                            <TableHead>Aplicação</TableHead>
                                            <TableHead>Profissional</TableHead>
                                            <TableHead>Atendido por</TableHead>
                                            <TableHead>Tempo de atendimento</TableHead>
                                            <TableHead>Sentimento</TableHead>
                                            <TableHead>Nota</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reviews.map((r, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="font-medium">{r.contact_name || "Sem nome"}</TableCell>
                                                <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                                                <TableCell className="max-w-[180px] truncate" title={r.application || undefined}>
                                                    {r.application || "—"}
                                                </TableCell>
                                                <TableCell className="max-w-[160px] truncate" title={r.professional || undefined}>
                                                    {r.professional || "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {r.attended_by ? (
                                                        <span className="flex items-center gap-1.5">
                                                            {r.is_ai ? <Bot className="h-3.5 w-3.5 text-violet-500" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                                                            {r.attended_by}
                                                        </span>
                                                    ) : "—"}
                                                </TableCell>
                                                <TableCell>{fmtDuration(r.duration_seconds)}</TableCell>
                                                <TableCell>{r.sentiment != null ? `${r.sentiment} / 10` : "—"}</TableCell>
                                                <TableCell>
                                                    <span className={cn("font-semibold", npsColor(r.nota))}>
                                                        {r.nota != null ? `${r.nota} / 5` : "—"}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Cards por atendente */}
                    <div>
                        <h3 className="mb-3 text-base font-semibold">Atendentes</h3>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {agents.map((a) => (
                                <Card key={a.id} className={cn(a.is_ai && "border-violet-500/40")}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                            {a.is_ai
                                                ? <Bot className="h-4 w-4 text-violet-500" />
                                                : <User className="h-4 w-4 text-muted-foreground" />}
                                            {a.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" /> Resposta média
                                        </div>
                                        <div className="text-right font-medium">{fmtDuration(a.avg_response_seconds)}</div>

                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Timer className="h-3.5 w-3.5" /> Tempo total
                                        </div>
                                        <div className="text-right font-medium">{fmtDuration(a.total_attendance_seconds)}</div>

                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Brain className="h-3.5 w-3.5" /> Sentimento
                                        </div>
                                        <div className="text-right font-medium">
                                            {a.avg_sentiment != null ? `${a.avg_sentiment} / 10` : "—"}
                                        </div>

                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Headphones className="h-3.5 w-3.5" /> Atendimentos
                                        </div>
                                        <div className="text-right font-medium">{a.attendance_count}</div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Tabela de templates */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="h-4 w-4" /> Templates
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {templates.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum template cadastrado</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Último envio</TableHead>
                                            <TableHead>Enviado por</TableHead>
                                            <TableHead>Envio</TableHead>
                                            <TableHead>Resposta</TableHead>
                                            <TableHead>Mensagem recebida</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {templates.map((t) => {
                                            const st = TEMPLATE_STATUS_BADGE[(t.template_status || "").toUpperCase()];
                                            return (
                                                <TableRow key={t.id}>
                                                    <TableCell className="font-medium">{t.name}</TableCell>
                                                    <TableCell>
                                                        {st
                                                            ? <Badge className={cn("border", st.cls)}>{st.label}</Badge>
                                                            : <Badge variant="secondary">{t.template_status || "—"}</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {t.last_sent_at
                                                            ? format(new Date(t.last_sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                                            : "—"}
                                                    </TableCell>
                                                    <TableCell>{t.sent_by || "—"}</TableCell>
                                                    <TableCell>
                                                        {t.last_sent_at
                                                            ? <Badge variant="outline">{t.send_status === "sent" ? "Enviado" : t.send_status || "—"}</Badge>
                                                            : "—"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {!t.last_sent_at ? "—" : t.responded
                                                            ? <Badge className="border bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Respondido</Badge>
                                                            : <Badge className="border bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Pendente</Badge>}
                                                    </TableCell>
                                                    <TableCell className="max-w-[220px] truncate text-muted-foreground" title={t.response_body || undefined}>
                                                        {t.response_body || "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
};
