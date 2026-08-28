// @ts-nocheck - support_tickets/support_messages ainda não estão nos types gerados
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Headphones, Search, Send, CalendarDays, UserCheck, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { chatDateTime, chatDayLabel, isSameChatDay } from "@/lib/chatDates";
import { FormattedText } from "@/components/chat/FormattedText";
import {
    SUPPORT_PRIORITY_CONFIG,
    SUPPORT_PRIORITY_ORDER,
    SUPPORT_STATUS_CONFIG,
    SUPPORT_STATUS_ORDER,
} from "@/types/support";
import {
    useMarkSupportRead,
    useSendSupportMessage,
    useSupportMessages,
    useSupportTickets,
    useUpdateSupportTicket,
} from "@/hooks/useSupportInbox";

interface AdminSupportProps {
    canEdit: boolean;
    /** nome exibido como remetente das respostas */
    agentName: string;
    /** admin_users.id do atendente logado (null para super-admin sem registro) */
    adminUserId: string | null;
}

const normalize = (v: string) =>
    v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

export default function AdminSupport({ canEdit, agentName, adminUserId }: AdminSupportProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [draft, setDraft] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data: tickets = [], isLoading } = useSupportTickets();
    const { data: messages = [], isLoading: loadingMessages } = useSupportMessages(selectedId);
    const sendMessage = useSendSupportMessage();
    const updateTicket = useUpdateSupportTicket();
    const markRead = useMarkSupportRead();

    const selected = useMemo(
        () => tickets.find((t) => t.id === selectedId) || null,
        [tickets, selectedId]
    );

    const filtered = useMemo(() => {
        const term = normalize(search.trim());
        return tickets.filter((t) => {
            if (statusFilter !== "all" && t.status !== statusFilter) return false;
            if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
            if (!term) return true;
            return [t.title, t.company_name, t.creator_name, t.owner_name, t.last_preview]
                .filter(Boolean)
                .some((v) => normalize(String(v)).includes(term));
        });
    }, [tickets, search, statusFilter, priorityFilter]);

    // marca lidas + status "visualizado" ao abrir
    useEffect(() => {
        if (!selectedId || !selected) return;
        if (selected.unread_count > 0) markRead.mutate(selectedId);
        if (canEdit && selected.status === "open") {
            updateTicket.mutate({ ticketId: selectedId, status: "viewed" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, selectedId]);

    const handleSend = async () => {
        const body = draft.trim();
        if (!body || !selectedId) return;
        try {
            await sendMessage.mutateAsync({ ticketId: selectedId, body, senderName: agentName });
            setDraft("");
            if (selected?.status !== "in_progress") {
                updateTicket.mutate({ ticketId: selectedId, status: "in_progress" });
            }
        } catch (error: any) {
            toast.error(error.message || "Não foi possível enviar a mensagem");
        }
    };

    const handleAssume = () => {
        if (!selectedId) return;
        updateTicket.mutate(
            { ticketId: selectedId, assignedAdminId: adminUserId },
            {
                onSuccess: () => toast.success("Chamado atribuído a você"),
                onError: (e: any) => toast.error(e.message || "Falha ao assumir o chamado"),
            }
        );
    };

    const unreadTotal = tickets.reduce((acc, t) => acc + t.unread_count, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                    <Headphones className="w-5 h-5" />
                    Suporte ({filtered.length})
                </h3>
                {unreadTotal > 0 && (
                    <Badge className="bg-red-500 text-white">{unreadTotal} sem resposta</Badge>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[520px]">
                {/* LISTA */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
                    <div className="p-3 space-y-2 border-b border-gray-800 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por empresa ou assunto"
                                className="pl-8 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os status</SelectItem>
                                    {SUPPORT_STATUS_ORDER.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {SUPPORT_STATUS_CONFIG[s].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 text-xs">
                                    <SelectValue placeholder="Prioridade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {SUPPORT_PRIORITY_ORDER.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {SUPPORT_PRIORITY_CONFIG[p].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 text-sm">
                                Nenhum chamado encontrado
                            </div>
                        ) : (
                            filtered.map((t) => {
                                const st = SUPPORT_STATUS_CONFIG[t.status] || SUPPORT_STATUS_CONFIG.open;
                                const pr =
                                    SUPPORT_PRIORITY_CONFIG[t.priority] || SUPPORT_PRIORITY_CONFIG.medium;
                                const isActive = t.id === selectedId;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedId(t.id)}
                                        className={cn(
                                            "w-full text-left px-3 py-3 border-b border-gray-800/70 transition-colors",
                                            isActive ? "bg-gray-800" : "hover:bg-gray-800/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn("w-2 h-2 rounded-full shrink-0", st.dot)} />
                                            <span className="text-sm font-medium text-white truncate flex-1">
                                                {t.company_name || t.owner_name || "Cliente"}
                                            </span>
                                            {t.unread_count > 0 && (
                                                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                                                    {t.unread_count}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-300 truncate">{t.title}</p>
                                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                            {t.last_preview || "Sem mensagens"}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span
                                                className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded",
                                                    st.bg,
                                                    st.color
                                                )}
                                            >
                                                {st.label}
                                            </span>
                                            <span
                                                className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded",
                                                    pr.bg,
                                                    pr.color
                                                )}
                                            >
                                                {pr.label}
                                            </span>
                                            <span className="text-[10px] text-gray-600 ml-auto">
                                                {chatDateTime(t.last_message_at || t.created_at)}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* CHAT */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
                    {!selected ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                            <Headphones className="w-12 h-12 mb-3 opacity-40" />
                            <p className="text-sm">Selecione um chamado para conversar</p>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 border-b border-gray-800 shrink-0 space-y-2">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-white font-medium truncate">{selected.title}</p>
                                        <p className="text-xs text-gray-400 flex items-center gap-1.5 truncate">
                                            <Building2 className="w-3 h-3 shrink-0" />
                                            {selected.company_name || "—"}
                                            {selected.creator_name && ` · ${selected.creator_name}`}
                                        </p>
                                    </div>
                                    {canEdit && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleAssume}
                                            className="shrink-0 border-gray-700 text-gray-200 hover:bg-gray-800"
                                        >
                                            <UserCheck className="w-4 h-4 mr-1.5" />
                                            {selected.assigned_admin_id === adminUserId && adminUserId
                                                ? "Você atende"
                                                : "Assumir"}
                                        </Button>
                                    )}
                                </div>
                                {canEdit && (
                                    <div className="flex gap-2">
                                        <Select
                                            value={selected.status}
                                            onValueChange={(v) =>
                                                updateTicket.mutate({ ticketId: selected.id, status: v })
                                            }
                                        >
                                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SUPPORT_STATUS_ORDER.map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                        {SUPPORT_STATUS_CONFIG[s].label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={selected.priority}
                                            onValueChange={(v) =>
                                                updateTicket.mutate({ ticketId: selected.id, priority: v })
                                            }
                                        >
                                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-36">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SUPPORT_PRIORITY_ORDER.map((p) => (
                                                    <SelectItem key={p} value={p}>
                                                        {SUPPORT_PRIORITY_CONFIG[p].label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                                {loadingMessages ? (
                                    <div className="text-center text-gray-500 text-sm py-8">
                                        Carregando mensagens...
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-gray-500 text-sm py-8">
                                        Nenhuma mensagem neste chamado
                                    </div>
                                ) : (
                                    messages.map((m, i) => {
                                        const prev = messages[i - 1];
                                        const showDay =
                                            !prev || !isSameChatDay(prev.created_at, m.created_at);
                                        const isSupport = m.sender_type === "support";
                                        return (
                                            <div key={m.id}>
                                                {showDay && (
                                                    <div className="flex justify-center my-3">
                                                        <span className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-800 border border-gray-700 rounded-full px-3 py-1">
                                                            <CalendarDays className="w-3 h-3" />
                                                            {chatDayLabel(m.created_at)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div
                                                    className={cn(
                                                        "flex mb-2",
                                                        isSupport ? "justify-end" : "justify-start"
                                                    )}
                                                >
                                                    <div className="max-w-[75%]">
                                                        <div
                                                            className={cn(
                                                                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                                                isSupport
                                                                    ? "bg-blue-600 text-white"
                                                                    : "bg-gray-800 text-gray-100"
                                                            )}
                                                        >
                                                            <FormattedText text={m.body} />
                                                        </div>
                                                        <p
                                                            className={cn(
                                                                "text-[10px] text-gray-500 mt-0.5",
                                                                isSupport ? "text-right" : "text-left"
                                                            )}
                                                        >
                                                            {m.sender_name} · {chatDateTime(m.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={bottomRef} />
                            </div>

                            {canEdit && (
                                <div className="p-3 border-t border-gray-800 shrink-0 flex gap-2 items-end">
                                    <Textarea
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder="Escreva a resposta ao cliente..."
                                        rows={2}
                                        className="resize-none bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!draft.trim() || sendMessage.isPending}
                                        className="bg-blue-600 hover:bg-blue-700 text-white h-[60px] px-4"
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
