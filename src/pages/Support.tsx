import { useMemo, useState } from "react";
import { Headphones, Filter, Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { chatDateTime } from "@/lib/chatDates";
import { SupportMetrics } from "@/components/support/SupportMetrics";
import { SupportThread } from "@/components/support/SupportThread";
import { NewSupportChat } from "@/components/support/NewSupportChat";
import { useMyTickets, useSupportSenderName } from "@/hooks/useSupportChat";
import {
    SUPPORT_PRIORITY_CONFIG,
    SUPPORT_PRIORITY_ORDER,
    SUPPORT_STATUS_CONFIG,
    SUPPORT_STATUS_ORDER,
} from "@/types/support";

export default function Support() {
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const senderName = useSupportSenderName();
    const { data: tickets = [], isLoading } = useMyTickets();

    const filteredTickets = useMemo(
        () =>
            tickets.filter((t) => {
                if (statusFilter !== "all" && t.status !== statusFilter) return false;
                if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
                return true;
            }),
        [tickets, statusFilter, priorityFilter]
    );

    const selected = useMemo(
        () => tickets.find((t) => t.id === selectedId) || null,
        [tickets, selectedId]
    );

    const totalCount = tickets.length;
    const openCount = tickets.filter((t) => t.status === "open" || t.status === "viewed").length;
    const urgentCount = tickets.filter((t) => t.priority === "urgent" || t.priority === "high").length;
    const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

    return (
        <div className="h-screen flex flex-col bg-background">
            <div className="border-b p-4 md:p-6 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Headphones className="h-6 w-6" />
                        Suporte
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Converse com o time da Clinvia e acompanhe seus chamados.
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setCreating(true);
                        setSelectedId(null);
                    }}
                    className="bg-[#0175EC] hover:bg-[#0165cc] text-white"
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Novo chamado
                </Button>
            </div>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                <SupportMetrics
                    total={totalCount}
                    open={openCount}
                    urgent={urgentCount}
                    resolved={resolvedCount}
                />

                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Filtros:</span>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-[150px] text-sm">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos Status</SelectItem>
                            {SUPPORT_STATUS_ORDER.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {SUPPORT_STATUS_CONFIG[s].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger className="h-9 w-[150px] text-sm">
                            <SelectValue placeholder="Prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas Prioridades</SelectItem>
                            {SUPPORT_PRIORITY_ORDER.map((p) => (
                                <SelectItem key={p} value={p}>
                                    {SUPPORT_PRIORITY_CONFIG[p].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-sm text-muted-foreground ml-auto">
                        Mostrando {filteredTickets.length} de {totalCount} chamados
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[520px]">
                    {/* Lista */}
                    <div className="border rounded-xl bg-card overflow-hidden flex flex-col max-h-[70vh]">
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <p className="text-center text-sm text-muted-foreground py-8">
                                    Carregando...
                                </p>
                            ) : filteredTickets.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground py-8 px-4">
                                    Nenhum chamado por aqui. Clique em "Novo chamado" para falar com o
                                    assistente.
                                </p>
                            ) : (
                                filteredTickets.map((t) => {
                                    const st = SUPPORT_STATUS_CONFIG[t.status] || SUPPORT_STATUS_CONFIG.open;
                                    const pr =
                                        SUPPORT_PRIORITY_CONFIG[t.priority] ||
                                        SUPPORT_PRIORITY_CONFIG.medium;
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => {
                                                setSelectedId(t.id);
                                                setCreating(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-3 py-3 border-b transition-colors",
                                                t.id === selectedId ? "bg-muted" : "hover:bg-muted/60"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={cn("w-2 h-2 rounded-full shrink-0", st.dot)} />
                                                <span className="text-sm font-medium truncate flex-1">
                                                    {t.title}
                                                </span>
                                            </div>
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
                                                <span className="text-[10px] text-muted-foreground ml-auto">
                                                    {chatDateTime(t.last_message_at || t.created_at)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Conversa / novo chamado */}
                    <div className="border rounded-xl bg-card overflow-hidden flex flex-col max-h-[70vh]">
                        {creating ? (
                            <NewSupportChat
                                onCreated={(id) => {
                                    setCreating(false);
                                    setSelectedId(id);
                                }}
                            />
                        ) : selected ? (
                            <>
                                <div className="px-4 py-3 border-b shrink-0">
                                    <p className="font-medium truncate">{selected.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Aberto por {selected.creator_name || "—"} ·{" "}
                                        {chatDateTime(selected.created_at)}
                                    </p>
                                </div>
                                <SupportThread ticket={selected} senderName={senderName} />
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
                                <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
                                <p className="text-sm">Selecione um chamado para ver a conversa</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
