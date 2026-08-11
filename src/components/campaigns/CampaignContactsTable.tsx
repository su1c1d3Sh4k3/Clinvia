import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaignContacts, useCampaignContactResponses } from "@/hooks/useCampaigns";
import { ConversationChatModal } from "@/components/queues/ConversationChatModal";

const STATUS_META: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    sending: { label: "Enviando", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    sent: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    delivered: { label: "Entregue", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    failed: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    invalid: { label: "Número inválido", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    skipped: { label: "Ignorado", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

/** Status efetivo: refina 'sent' com o status real da mensagem (Meta reporta async) */
function effectiveStatus(r: { status: string; message?: { status: string | null } | null }): string {
    if (r.status === "sent") {
        const ms = r.message?.status;
        if (ms === "failed") return "failed";
        if (ms === "delivered" || ms === "read") return "delivered";
    }
    return r.status;
}

interface CampaignContactsTableProps {
    campaignId: string;
}

export function CampaignContactsTable({ campaignId }: CampaignContactsTableProps) {
    const { data: rows, isLoading } = useCampaignContacts(campaignId);
    const { data: responses } = useCampaignContactResponses(campaignId);
    const [chatContact, setChatContact] = useState<{ id: string; name: string } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [respondedFilter, setRespondedFilter] = useState<string>("all");

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
        let responded = 0, pending = 0;
        for (const r of rows || []) {
            if (r.status !== "sent") continue;
            if (responses?.get(r.id)) responded++;
            else pending++;
        }
        return { responded, pending };
    }, [rows, responses]);

    const filteredRows = useMemo(() => {
        return (rows || []).filter((r) => {
            if (statusFilter !== "all" && effectiveStatus(r) !== statusFilter) return false;
            if (respondedFilter !== "all") {
                if (r.status !== "sent") return false;
                const isResponded = !!responses?.get(r.id);
                if (respondedFilter === "responded" && !isResponded) return false;
                if (respondedFilter === "pending" && isResponded) return false;
            }
            return true;
        });
    }, [rows, statusFilter, respondedFilter, responses]);

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
                        <SelectItem value="responded">Respondida ({respondedCounts.responded})</SelectItem>
                        <SelectItem value="pending">Pendente ({respondedCounts.pending})</SelectItem>
                    </SelectContent>
                </Select>

                {(statusFilter !== "all" || respondedFilter !== "all") && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                        {filteredRows.length} de {rows.length} contatos
                    </Badge>
                )}
            </div>

            <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Contato</th>
                            <th className="px-3 py-2 font-medium">Telefone</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Respondida</th>
                            <th className="px-3 py-2 font-medium">Enviado em</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                    Nenhum contato com os filtros selecionados.
                                </td>
                            </tr>
                        )}
                        {filteredRows.map((r) => {
                            const meta = STATUS_META[effectiveStatus(r)] || STATUS_META.pending;
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
                                        <Badge variant="secondary" className={meta.className} title={r.error || undefined}>
                                            {meta.label}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {r.status === "sent" ? (
                                            responses?.get(r.id) ? (
                                                <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                                    Respondida
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                    Pendente
                                                </Badge>
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
