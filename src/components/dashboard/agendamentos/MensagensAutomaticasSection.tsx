import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarCheck, CalendarClock, Bell, Smile, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { isMetaInstance } from "@/hooks/useCampaigns";
import { ConversationChatModal } from "@/components/queues/ConversationChatModal";

const TEMPLATES = [
    { key: "sys_confirm_24h_v1", marker: "sys_confirm_24h", label: "Confirmação 24hs", icon: CalendarCheck },
    { key: "sys_confirm_multi_v1", marker: "sys_confirm_multi", label: "Confirmação Múltipla", icon: CalendarClock },
    { key: "sys_reminder_2h_v1", marker: "sys_reminder_2h", label: "Lembrete", icon: Bell },
    { key: "sys_feedback_24h_v1", marker: "sys_feedback_24h", label: "Feedback", icon: Smile },
];

// Estados exibidos por linha (fila + status de entrega da mensagem)
type RowState = "waiting" | "sent" | "delivered" | "failed" | "canceled" | "skipped";

const STATE_META: Record<RowState, { label: string; className: string }> = {
    waiting: { label: "Aguardando envio", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    sent: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    delivered: { label: "Entregue", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    failed: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    canceled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
    skipped: { label: "Não agendada", className: "bg-muted text-muted-foreground" },
};

interface DisplayRow {
    id: string;
    contactId: string | null;
    name: string;
    phone: string;
    state: RowState;
    time: string | null;       // sent_at (ou scheduled_for enquanto aguarda)
    error?: string | null;
}

interface TplMessage {
    id: string;
    body: string;
    status: string | null;
    created_at: string;
    contact: { id: string; push_name: string | null; phone: string | null } | null;
}

interface QueueRow {
    id: string;
    flow_type: string;
    template_name: string;
    status: string;             // scheduled | sent | failed | canceled | skipped
    attempts: number;
    last_error: string | null;
    scheduled_for: string;
    sent_at: string | null;
    message_id: string | null;
    contact_id: string | null;
    contact_name: string | null;
    contact_phone: string | null;
}

const NO_RECEIPT_MS = 24 * 3600_000; // enviada sem recibo por 24h → Rejeitada (regra do usuário)

function deliveryState(msgStatus: string | null | undefined, sentAt: string | null): RowState {
    if (msgStatus === "failed") return "failed";
    if (msgStatus === "delivered" || msgStatus === "read") return "delivered";
    // sem recibo: após 24h do envio conta como Rejeitada (sem confirmação de entrega)
    if (sentAt && Date.now() - new Date(sentAt).getTime() > NO_RECEIPT_MS) return "failed";
    return "sent";
}

function dayLabel(d: Date): string {
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function TemplateCard({ label, icon: Icon, rows, hasQueue, isToday }: {
    label: string;
    icon: any;
    rows: DisplayRow[];
    hasQueue: boolean;   // dia com fila materializada (pós-deploy) → coluna Agendadas real
    isToday: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [chatContact, setChatContact] = useState<{ id: string; name: string } | null>(null);

    // canceled/skipped não contam como Agendadas (regras do usuário)
    const counted = rows.filter((r) => r.state !== "canceled" && r.state !== "skipped");
    const scheduled = hasQueue ? counted.length : null;
    const waiting = counted.filter((r) => r.state === "waiting").length;
    const delivered = counted.filter((r) => r.state === "delivered").length;
    const failed = counted.filter((r) => r.state === "failed").length;
    // Enviadas = tudo que efetivamente saiu (sent + delivered + rejeitadas pós-envio;
    // fila 'failed' sem sent_at = nunca saiu, conta só como Rejeitada)
    const sent = counted.filter((r) => r.state !== "waiting" && r.time).length;

    // Divergência: dia encerrado com fila e Agendadas ≠ Entregues + Rejeitadas
    const diverged = hasQueue && !isToday && scheduled !== null && scheduled !== delivered + failed;

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{label}</span>
                    {diverged && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-label="Divergência entre agendadas e processadas" />}
                </div>

                {/* Agendadas | Enviadas | Entregues | Rejeitadas */}
                <div className="flex items-center gap-4 text-sm ml-auto">
                    <span>
                        <span className="font-semibold">{scheduled ?? "—"}</span>{" "}
                        <span className="text-xs text-muted-foreground">agendadas</span>
                    </span>
                    <span>
                        <span className="font-semibold">{sent}</span>{" "}
                        <span className="text-xs text-muted-foreground">enviadas</span>
                    </span>
                    <span>
                        <span className="font-semibold text-emerald-600">{delivered}</span>{" "}
                        <span className="text-xs text-muted-foreground">entregues</span>
                    </span>
                    <span>
                        <span className="font-semibold text-red-600">{failed}</span>{" "}
                        <span className="text-xs text-muted-foreground">rejeitadas</span>
                    </span>
                </div>

                <ChevronDown
                    className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")}
                />
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Métricas */}
                    <div className="grid grid-cols-4 gap-2 text-sm">
                        <div className="border rounded-xl p-2.5">
                            <p className="font-semibold">{scheduled ?? "—"}</p>
                            <p className="text-[10px] text-muted-foreground">agendadas</p>
                        </div>
                        <div className="border rounded-xl p-2.5">
                            <p className="font-semibold">{sent}</p>
                            <p className="text-[10px] text-muted-foreground">enviadas</p>
                        </div>
                        <div className="border rounded-xl p-2.5">
                            <p className="font-semibold text-emerald-600">{delivered}</p>
                            <p className="text-[10px] text-muted-foreground">entregues</p>
                        </div>
                        <div className="border rounded-xl p-2.5">
                            <p className="font-semibold text-red-600">{failed}</p>
                            <p className="text-[10px] text-muted-foreground">rejeitadas</p>
                        </div>
                    </div>

                    {diverged && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Divergência: {scheduled} agendadas ≠ {delivered} entregues + {failed} rejeitadas neste dia.
                        </p>
                    )}

                    {/* Detalhamento */}
                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Nenhuma mensagem neste dia.</p>
                    ) : (
                        <div className="border rounded-xl overflow-hidden">
                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 sticky top-0">
                                        <tr className="text-left text-xs text-muted-foreground">
                                            <th className="px-3 py-2 font-medium">Contato</th>
                                            <th className="px-3 py-2 font-medium">Telefone</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium">Horário</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {rows.map((r) => {
                                            const meta = STATE_META[r.state];
                                            return (
                                                <tr key={r.id}>
                                                    <td className="px-3 py-1.5 truncate max-w-[160px]">
                                                        {r.contactId ? (
                                                            <button
                                                                type="button"
                                                                className="text-primary hover:underline font-medium truncate max-w-full text-left"
                                                                title="Abrir chat com este cliente"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setChatContact({ id: r.contactId!, name: r.name });
                                                                }}
                                                            >
                                                                {r.name}
                                                            </button>
                                                        ) : (
                                                            r.name
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{r.phone}</td>
                                                    <td className="px-3 py-1.5">
                                                        <Badge
                                                            variant="secondary"
                                                            className={meta.className}
                                                            title={r.error || undefined}
                                                        >
                                                            {meta.label}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                                        {r.time
                                                            ? new Date(r.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                                                            : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {chatContact && (
                <ConversationChatModal
                    open={!!chatContact}
                    onOpenChange={(open) => { if (!open) setChatContact(null); }}
                    contactId={chatContact.id}
                    contactName={chatContact.name}
                />
            )}
        </div>
    );
}

export function MensagensAutomaticasSection() {
    const { data: ownerId } = useOwnerId();
    const [day, setDay] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

    const isToday = isSameDay(day, new Date());

    // Só exibe para clientes com instância Meta (API oficial) conectada
    const { data: hasMeta } = useQuery({
        queryKey: ["automation-msgs-has-meta"],
        queryFn: async () => {
            const { data, error } = await supabase.from("instances").select("*");
            if (error) throw error;
            return ((data || []) as any[]).some((i) => i.status === "connected" && isMetaInstance(i));
        },
        staleTime: 60_000,
    });

    // Templates desativados pelo cliente ficam ocultos (sem linha = habilitado)
    const { data: settings } = useQuery({
        queryKey: ["automation-msgs-settings", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("automation_template_settings" as any)
                .select("template_name, enabled");
            if (error) throw error;
            const map = new Map<string, boolean>();
            for (const s of (data || []) as any[]) map.set(s.template_name, s.enabled !== false);
            return map;
        },
        enabled: !!ownerId,
    });

    const dayRange = useMemo(() => {
        const start = new Date(day);
        const end = new Date(day);
        end.setDate(end.getDate() + 1);
        return { start: start.toISOString(), end: end.toISOString() };
    }, [day]);

    // Fila materializada (fonte da verdade das Agendadas) — só API oficial
    const { data: queue } = useQuery({
        queryKey: ["automation-queue", ownerId, day.toDateString()],
        queryFn: async (): Promise<QueueRow[]> => {
            const { data, error } = await (supabase.rpc as any)("get_automation_schedule", {
                p_start: dayRange.start,
                p_end: dayRange.end,
            });
            if (error) throw error;
            return (data || []) as QueueRow[];
        },
        enabled: !!ownerId && !!hasMeta,
        refetchInterval: 60_000,
    });

    // Mensagens dos templates no dia — status de entrega (messages vivas UNION
    // messages_history arquivadas); também é o fallback dos dias pré-fila
    const { data: messages } = useQuery({
        queryKey: ["automation-msgs", ownerId, day.toDateString()],
        queryFn: async (): Promise<TplMessage[]> => {
            const { data, error } = await (supabase.rpc as any)("get_automation_template_messages", {
                p_start: dayRange.start,
                p_end: dayRange.end,
            });
            if (error) throw error;
            return ((data || []) as any[]).map((r) => ({
                id: r.id,
                body: r.body,
                status: r.status,
                created_at: r.created_at,
                contact: r.contact_id
                    ? { id: r.contact_id, push_name: r.contact_name, phone: r.contact_phone }
                    : null,
            }));
        },
        enabled: !!ownerId && !!hasMeta,
        refetchInterval: 60_000,
    });

    const byTemplate = useMemo(() => {
        const msgStatusById = new Map<string, string | null>();
        for (const m of messages || []) msgStatusById.set(m.id, m.status);

        const queuedMsgIds = new Set((queue || []).map((q) => q.message_id).filter(Boolean));

        const map = new Map<string, { rows: DisplayRow[]; hasQueue: boolean }>();
        for (const t of TEMPLATES) map.set(t.key, { rows: [], hasQueue: false });

        // 1) Linhas da fila (pós-deploy): estado completo por contato
        for (const q of queue || []) {
            const entry = map.get(q.template_name);
            if (!entry) continue;
            entry.hasQueue = true;
            let state: RowState;
            if (q.status === "scheduled") state = "waiting";
            else if (q.status === "sent") state = deliveryState(q.message_id ? msgStatusById.get(q.message_id) : null, q.sent_at);
            else state = q.status as RowState; // failed | canceled | skipped
            entry.rows.push({
                id: q.id,
                contactId: q.contact_id,
                name: q.contact_name || "—",
                phone: q.contact_phone || "—",
                state,
                time: q.sent_at || (state === "waiting" ? q.scheduled_for : null),
                error: q.last_error,
            });
        }

        // 2) Mensagens sem linha na fila (dias pré-deploy ou envios fora da fila)
        for (const m of messages || []) {
            if (queuedMsgIds.has(m.id)) continue;
            const tpl = TEMPLATES.find((t) => m.body?.includes(t.marker));
            if (!tpl) continue;
            const entry = map.get(tpl.key)!;
            entry.rows.push({
                id: m.id,
                contactId: m.contact?.id || null,
                name: m.contact?.push_name || "—",
                phone: m.contact?.phone || "—",
                state: deliveryState(m.status, m.created_at),
                time: m.created_at,
            });
        }

        for (const entry of map.values()) {
            entry.rows.sort((a, b) => (a.time || "9").localeCompare(b.time || "9"));
        }
        return map;
    }, [messages, queue]);

    if (!hasMeta) return null;

    const visibleTemplates = TEMPLATES.filter((t) => settings?.get(t.key) !== false);
    if (visibleTemplates.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Mensagens Automáticas</h3>
                {/* Seletor de dia */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => setDay((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[220px] text-center capitalize">
                        {dayLabel(day)}{isToday ? " (hoje)" : ""}
                    </span>
                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        disabled={isToday}
                        onClick={() => setDay((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                {visibleTemplates.map((t) => {
                    const entry = byTemplate.get(t.key);
                    return (
                        <TemplateCard
                            key={t.key}
                            label={t.label}
                            icon={t.icon}
                            rows={entry?.rows || []}
                            hasQueue={entry?.hasQueue || false}
                            isToday={isToday}
                        />
                    );
                })}
            </div>
        </div>
    );
}
