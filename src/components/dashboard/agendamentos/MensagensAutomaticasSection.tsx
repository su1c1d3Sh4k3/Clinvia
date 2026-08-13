import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarCheck, CalendarClock, Bell, Smile } from "lucide-react";
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

const STATUS_META: Record<string, { label: string; className: string }> = {
    sent: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    delivered: { label: "Entregue", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    failed: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

interface TplMessage {
    id: string;
    body: string;
    status: string | null;
    created_at: string;
    conversation?: {
        contact?: { id: string; push_name: string | null; phone: string | null; number: string | null } | null;
    } | null;
}

function effectiveStatus(status: string | null): "sent" | "delivered" | "failed" {
    if (status === "failed") return "failed";
    if (status === "delivered" || status === "read") return "delivered";
    return "sent";
}

function dayLabel(d: Date): string {
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function TemplateCard({ label, icon: Icon, messages }: {
    label: string;
    icon: any;
    messages: TplMessage[];
}) {
    const [expanded, setExpanded] = useState(false);
    const [chatContact, setChatContact] = useState<{ id: string; name: string } | null>(null);

    const sent = messages.length;
    const delivered = messages.filter((m) => effectiveStatus(m.status) === "delivered").length;
    const failed = messages.filter((m) => effectiveStatus(m.status) === "failed").length;

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
                </div>

                {/* Enviadas | Entregues | Rejeitadas */}
                <div className="flex items-center gap-4 text-sm ml-auto">
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
                    <div className="grid grid-cols-3 gap-2 text-sm">
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

                    {/* Detalhamento */}
                    {messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Nenhum envio neste dia.</p>
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
                                        {messages.map((m) => {
                                            const contact = m.conversation?.contact;
                                            const name = contact?.push_name || "—";
                                            const phone = contact?.phone
                                                || (contact?.number || "").replace(/@.*$/, "")
                                                || "—";
                                            const meta = STATUS_META[effectiveStatus(m.status)];
                                            return (
                                                <tr key={m.id}>
                                                    <td className="px-3 py-1.5 truncate max-w-[160px]">
                                                        {contact?.id ? (
                                                            <button
                                                                type="button"
                                                                className="text-primary hover:underline font-medium truncate max-w-full text-left"
                                                                title="Abrir chat com este cliente"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setChatContact({ id: contact.id, name });
                                                                }}
                                                            >
                                                                {name}
                                                            </button>
                                                        ) : (
                                                            name
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{phone}</td>
                                                    <td className="px-3 py-1.5">
                                                        <Badge variant="secondary" className={meta.className}>{meta.label}</Badge>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
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

    // Mensagens dos templates de sistema no dia selecionado — RPC une messages
    // (vivas) + messages_history (arquivadas ao resolver a conversa); sem isso
    // os dias passados zeravam conforme as conversas eram encerradas
    const { data: messages } = useQuery({
        queryKey: ["automation-msgs", ownerId, day.toDateString()],
        queryFn: async (): Promise<TplMessage[]> => {
            const start = new Date(day);
            const end = new Date(day);
            end.setDate(end.getDate() + 1);
            const { data, error } = await (supabase.rpc as any)("get_automation_template_messages", {
                p_start: start.toISOString(),
                p_end: end.toISOString(),
            });
            if (error) throw error;
            return ((data || []) as any[]).map((r) => ({
                id: r.id,
                body: r.body,
                status: r.status,
                created_at: r.created_at,
                conversation: {
                    contact: r.contact_id
                        ? { id: r.contact_id, push_name: r.contact_name, phone: r.contact_phone, number: null }
                        : null,
                },
            }));
        },
        enabled: !!ownerId && !!hasMeta,
        refetchInterval: 60_000,
    });

    const byTemplate = useMemo(() => {
        const map = new Map<string, TplMessage[]>();
        for (const t of TEMPLATES) map.set(t.key, []);
        for (const m of messages || []) {
            const tpl = TEMPLATES.find((t) => m.body?.includes(t.marker));
            if (tpl) map.get(tpl.key)!.push(m);
        }
        return map;
    }, [messages]);

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
                {visibleTemplates.map((t) => (
                    <TemplateCard
                        key={t.key}
                        label={t.label}
                        icon={t.icon}
                        messages={byTemplate.get(t.key) || []}
                    />
                ))}
            </div>
        </div>
    );
}
