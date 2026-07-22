import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useCampaignContacts } from "@/hooks/useCampaigns";

const STATUS_META: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    sending: { label: "Enviando", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    sent: { label: "Enviado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    failed: { label: "Falhou", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    invalid: { label: "Número inválido", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    skipped: { label: "Ignorado", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

interface CampaignContactsTableProps {
    campaignId: string;
}

export function CampaignContactsTable({ campaignId }: CampaignContactsTableProps) {
    const { data: rows, isLoading } = useCampaignContacts(campaignId);

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
            <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Contato</th>
                            <th className="px-3 py-2 font-medium">Telefone</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Enviado em</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.map((r) => {
                            const meta = STATUS_META[r.status] || STATUS_META.pending;
                            const name = r.contact?.push_name
                                || r.raw_data?.push_name || r.raw_data?.nome || r.raw_data?.name
                                || "—";
                            const phone = r.contact?.phone
                                || (r.contact?.number || "").replace(/@.*$/, "")
                                || Object.values(r.raw_data || {}).find((v: any) => /\d{8,}/.test(String(v)))
                                || "—";
                            return (
                                <tr key={r.id}>
                                    <td className="px-3 py-1.5 truncate max-w-[160px]">{String(name)}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground">{String(phone)}</td>
                                    <td className="px-3 py-1.5">
                                        <Badge variant="secondary" className={meta.className} title={r.error || undefined}>
                                            {meta.label}
                                        </Badge>
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
        </div>
    );
}
