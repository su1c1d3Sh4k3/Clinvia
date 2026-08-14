import { useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, GripHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaignContacts, useCampaignContactReport, CampaignContactReport } from "@/hooks/useCampaigns";
import { ConversationChatModal } from "@/components/queues/ConversationChatModal";

const STATUS_META: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    sending: { label: "Enviando", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    sent: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    delivered: { label: "Entregue", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    failed: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    invalid: { label: "Número inválido", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    skipped: { label: "Ignorado", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
    open_ticket: { label: "Atendimento Em Aberto", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const GREEN = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
const RED = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
const SLATE = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
const ORANGE = "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
const PURPLE = "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";

/** Status efetivo: refina 'sent' com o status real da mensagem (Meta reporta async).
 *  Fallback no snapshot message_status — mensagens são deletadas quando a conversa
 *  é resolvida e a métrica NÃO pode se perder. */
function effectiveStatus(r: { status: string; message_status?: string | null; message?: { status: string | null } | null }): string {
    if (r.status === "sent") {
        const ms = r.message?.status ?? r.message_status;
        if (ms === "failed") return "failed";
        if (ms === "delivered" || ms === "read") return "delivered";
    }
    return r.status;
}

interface CampaignContactsTableProps {
    campaignId: string;
}

/** Nome de exibição do contato (mesma derivação da renderização da tabela). */
function rowName(r: { contact?: { push_name: string | null } | null; raw_data?: any }): string {
    return String(
        r.contact?.push_name
        || r.raw_data?.push_name || r.raw_data?.nome || r.raw_data?.name
        || "—"
    );
}

/** Normaliza para busca: minúsculas e sem acentos. */
function normalizeTxt(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function CampaignContactsTable({ campaignId }: CampaignContactsTableProps) {
    const { data: rows, isLoading } = useCampaignContacts(campaignId);
    const { data: report } = useCampaignContactReport(campaignId);
    const [chatContact, setChatContact] = useState<{ id: string; name: string } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [respondedFilter, setRespondedFilter] = useState<string>("all");
    const [scheduledFilter, setScheduledFilter] = useState<string>("all");
    const [stageFilter, setStageFilter] = useState<string>("all");
    const [agentFilter, setAgentFilter] = useState<string>("all");
    const [search, setSearch] = useState("");

    // Altura da tabela redimensionável (sem persistência — volta ao padrão a cada expandir)
    const [tableHeight, setTableHeight] = useState(256);
    const dragRef = useRef<{ startY: number; startH: number } | null>(null);
    const onResizeStart = useCallback((clientY: number) => {
        dragRef.current = { startY: clientY, startH: tableHeight };
        const onMove = (e: MouseEvent | TouchEvent) => {
            const y = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
            if (!dragRef.current) return;
            const next = dragRef.current.startH + (y - dragRef.current.startY);
            setTableHeight(Math.min(Math.max(next, 160), 800));
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchmove", onMove);
        window.addEventListener("touchend", onUp);
    }, [tableHeight]);

    // Respondida/Agendamento derivados do relatório congelado
    const respondedState = useCallback((r: { id: string; status: string }): "yes" | "no" | "pending" | null => {
        if (r.status !== "sent") return null;
        const rep = report?.get(r.id);
        if (rep?.responded) return "yes";
        if (rep?.frozen) return "no"; // congelou sem resposta = Sem Resposta (definitivo)
        return "pending";
    }, [report]);

    const scheduledState = useCallback((r: { id: string; status: string }): "yes" | "no" | "pending" | null => {
        if (r.status !== "sent") return null;
        const rep = report?.get(r.id);
        if (rep?.scheduled) return "yes";
        if (rep?.frozen) return "no"; // congelou sem agendar = Não Agendou (definitivo)
        return "pending";
    }, [report]);

    // Contagens por status efetivo e por respondida (sobre todos os rows)
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of rows || []) {
            const st = effectiveStatus(r);
            counts[st] = (counts[st] || 0) + 1;
        }
        return counts;
    }, [rows]);

    const respondedCounts = useMemo(() => {
        let responded = 0, noResponse = 0, pending = 0;
        for (const r of rows || []) {
            const st = respondedState(r);
            if (st === "yes") responded++;
            else if (st === "no") noResponse++;
            else if (st === "pending") pending++;
        }
        return { responded, noResponse, pending };
    }, [rows, respondedState]);

    const scheduledCounts = useMemo(() => {
        let scheduled = 0, notScheduled = 0, pending = 0;
        for (const r of rows || []) {
            const st = scheduledState(r);
            if (st === "yes") scheduled++;
            else if (st === "no") notScheduled++;
            else if (st === "pending") pending++;
        }
        return { scheduled, notScheduled, pending };
    }, [rows, scheduledState]);

    // Estágios/atendentes presentes NESTA campanha (só os que têm contatos), com contagem
    const stageCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of rows || []) {
            const stage = report?.get(r.id)?.stage;
            if (stage) counts.set(stage, (counts.get(stage) || 0) + 1);
        }
        return counts;
    }, [rows, report]);

    const agentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of rows || []) {
            const agent = report?.get(r.id)?.agent;
            if (agent) counts.set(agent, (counts.get(agent) || 0) + 1);
        }
        return counts;
    }, [rows, report]);

    const filteredRows = useMemo(() => {
        const q = normalizeTxt(search.trim());
        return (rows || []).filter((r) => {
            if (statusFilter !== "all" && effectiveStatus(r) !== statusFilter) return false;
            if (respondedFilter !== "all" && respondedState(r) !== respondedFilter) return false;
            if (scheduledFilter !== "all" && scheduledState(r) !== scheduledFilter) return false;
            if (stageFilter !== "all" && report?.get(r.id)?.stage !== stageFilter) return false;
            if (agentFilter !== "all" && report?.get(r.id)?.agent !== agentFilter) return false;
            if (q && !normalizeTxt(rowName(r)).includes(q)) return false;
            return true;
        });
    }, [rows, statusFilter, respondedFilter, scheduledFilter, stageFilter, agentFilter, search, report, respondedState, scheduledState]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando contatos...
            </div>
        );
    }
    if (!rows || rows.length === 0) {
        return <p className="text-sm text-muted-foreground py-2">Nenhum contato nesta campanha.</p>;
    }

    return (
        <div className="border rounded-xl overflow-hidden">
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os status ({rows.length})</SelectItem>
                        {Object.entries(STATUS_META)
                            .filter(([key]) => statusCounts[key])
                            .map(([key, meta]) => (
                                <SelectItem key={key} value={key}>
                                    {meta.label} ({statusCounts[key]})
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>

                <Select value={respondedFilter} onValueChange={setRespondedFilter}>
                    <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                        <SelectValue placeholder="Respondida" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Respondida: todas</SelectItem>
                        <SelectItem value="yes">Sim ({respondedCounts.responded})</SelectItem>
                        <SelectItem value="no">Sem Resposta ({respondedCounts.noResponse})</SelectItem>
                        <SelectItem value="pending">Pendente ({respondedCounts.pending})</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={scheduledFilter} onValueChange={setScheduledFilter}>
                    <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                        <SelectValue placeholder="Agendamento" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Agendamento: todos</SelectItem>
                        <SelectItem value="yes">Agendado ({scheduledCounts.scheduled})</SelectItem>
                        <SelectItem value="no">Não Agendou ({scheduledCounts.notScheduled})</SelectItem>
                        <SelectItem value="pending">Pendente ({scheduledCounts.pending})</SelectItem>
                    </SelectContent>
                </Select>

                {stageCounts.size > 0 && (
                    <Select value={stageFilter} onValueChange={setStageFilter}>
                        <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                            <SelectValue placeholder="Estágio" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Estágio: todos</SelectItem>
                            {[...stageCounts.entries()].sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                                <SelectItem key={stage} value={stage}>
                                    {stage} ({count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {agentCounts.size > 0 && (
                    <Select value={agentFilter} onValueChange={setAgentFilter}>
                        <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                            <SelectValue placeholder="Atendente" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Atendente: todos</SelectItem>
                            {[...agentCounts.entries()].sort((a, b) => b[1] - a[1]).map(([agent, count]) => (
                                <SelectItem key={agent} value={agent}>
                                    {agent} ({count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar cliente..."
                        className="h-8 w-[180px] text-xs bg-background pl-8"
                    />
                </div>

                <Badge variant="secondary" className="ml-auto text-xs">
                    {filteredRows.length === rows.length
                        ? `${rows.length} contatos`
                        : `${filteredRows.length} de ${rows.length} contatos`}
                </Badge>
            </div>

            <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: tableHeight }}>
                <table className="w-full min-w-[880px] text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Contato</th>
                            <th className="px-3 py-2 font-medium">Telefone</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Respondida</th>
                            <th className="px-3 py-2 font-medium">Agendamento</th>
                            <th className="px-3 py-2 font-medium">Estágio</th>
                            <th className="px-3 py-2 font-medium">Atendente</th>
                            <th className="px-3 py-2 font-medium">Enviado em</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                    Nenhum contato com os filtros selecionados.
                                </td>
                            </tr>
                        )}
                        {filteredRows.map((r) => {
                            const meta = STATUS_META[effectiveStatus(r)] || STATUS_META.pending;
                            const rep: CampaignContactReport | undefined = report?.get(r.id);
                            const respState = respondedState(r);
                            const schedState = scheduledState(r);
                            const name = r.contact?.push_name
                                || r.raw_data?.push_name || r.raw_data?.nome || r.raw_data?.name
                                || "—";
                            const phone = r.contact?.phone
                                || (r.contact?.number || "").replace(/@.*$/, "")
                                || Object.values(r.raw_data || {}).find((v: any) => /\d{8,}/.test(String(v)))
                                || "—";
                            return (
                                <tr key={r.id}>
                                    <td className="px-3 py-1.5 truncate max-w-[160px]">
                                        {r.contact_id ? (
                                            <button
                                                type="button"
                                                className="text-primary hover:underline font-medium truncate max-w-full text-left"
                                                title="Abrir chat com este cliente"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setChatContact({ id: r.contact_id!, name: String(name) });
                                                }}
                                            >
                                                {String(name)}
                                            </button>
                                        ) : (
                                            String(name)
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5 text-muted-foreground">{String(phone)}</td>
                                    <td className="px-3 py-1.5">
                                        <Badge variant="secondary" className={`${meta.className} whitespace-nowrap`} title={r.error || undefined}>
                                            {meta.label}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {respState ? (
                                            <Badge
                                                variant="secondary"
                                                className={respState === "yes" ? GREEN : respState === "no" ? RED : SLATE}
                                            >
                                                {respState === "yes" ? "Sim" : respState === "no" ? "Sem Resposta" : "Pendente"}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {schedState ? (
                                            <Badge
                                                variant="secondary"
                                                className={`${schedState === "yes" ? GREEN : schedState === "no" ? RED : SLATE} whitespace-nowrap`}
                                            >
                                                {schedState === "yes" ? "Agendado" : schedState === "no" ? "Não Agendou" : "Pendente"}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {rep?.stage ? (
                                            <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
                                                {rep.stage}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {rep?.agent ? (
                                            rep.frozen ? (
                                                <Badge
                                                    variant="secondary"
                                                    className={`${rep.frozen_reason === "scheduled" ? GREEN : ORANGE} whitespace-nowrap`}
                                                >
                                                    {rep.agent}
                                                </Badge>
                                            ) : rep.agent === "IA" ? (
                                                <Badge variant="secondary" className={PURPLE}>IA</Badge>
                                            ) : (
                                                <span className="text-xs whitespace-nowrap">{rep.agent}</span>
                                            )
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                        {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Alça de redimensionamento (altura da tabela; não persiste) */}
            <div
                role="separator"
                aria-orientation="horizontal"
                title="Arraste para redimensionar"
                onMouseDown={(e) => { e.preventDefault(); onResizeStart(e.clientY); }}
                onTouchStart={(e) => onResizeStart(e.touches[0]?.clientY ?? 0)}
                className="flex items-center justify-center h-4 border-t bg-muted/30 cursor-row-resize select-none text-muted-foreground hover:bg-muted/60 transition-colors"
            >
                <GripHorizontal className="w-4 h-4" />
            </div>

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
