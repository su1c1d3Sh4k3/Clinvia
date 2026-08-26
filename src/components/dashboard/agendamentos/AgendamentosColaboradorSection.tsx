import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { CalendarDays, Download, Bot } from "lucide-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useStaff } from "@/hooks/useStaff";
import { ConversationChatModal } from "@/components/queues/ConversationChatModal";

type PeriodKey = "hoje" | "7d" | "30d" | "custom";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
    { value: "hoje", label: "Hoje" },
    { value: "7d", label: "Últimos 7 dias" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "custom", label: "Personalizado" },
];

/** Agendamento nascido de API do n8n ou do link público = autoria da IA (regra do usuário). */
const IA_ORIGINS = new Set(["ia", "public_link"]);

/** Chave da aba da IA — não colide com UUID de team_member. */
const IA_KEY = "__ia";

const ORIGIN_LABELS: Record<string, string> = {
    manual: "Agenda",
    import: "Planilha",
    ia: "API",
    public_link: "Link público",
};

const STATUS_LABELS: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    rescheduled: "Reagendado",
    waiting: "Aguardando",
    completed: "Concluído",
    canceled: "Cancelado",
    "no-show": "Não compareceu",
};

const STATUS_CLASSES: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    confirmed: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    canceled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "no-show": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

interface Row {
    id: string;
    contactId: string | null;
    clientName: string;
    clientPhone: string;
    service: string;
    professional: string;
    startTime: string | null;
    status: string | null;
    price: number | null;
    createdAt: string;
    origin: string;
    /** team_members.id de quem agendou, ou IA_KEY */
    authorKey: string;
}

interface AuthorTab {
    key: string;
    label: string;
    rows: Row[];
}

const dateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const money = (v: number | null) =>
    v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Excel recusa > 31 chars e os caracteres : \ / ? * [ ] no nome da aba. */
function sheetName(label: string, used: Set<string>): string {
    let base = label.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sem nome";
    let name = base;
    let n = 2;
    while (used.has(name)) {
        const suffix = ` (${n++})`;
        name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name);
    return name;
}

export function AgendamentosColaboradorSection() {
    const { data: ownerId } = useOwnerId();
    const { data: staff } = useStaff();

    const [period, setPeriod] = useState<PeriodKey>("30d");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [activeTab, setActiveTab] = useState<string>("todos");
    const [chatContact, setChatContact] = useState<{ id: string; name: string } | null>(null);

    const range = useMemo(() => {
        const now = new Date();
        switch (period) {
            case "7d":
                return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
            case "30d":
                return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
            case "custom": {
                const s = customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : startOfDay(now);
                const e = customEnd ? endOfDay(new Date(`${customEnd}T00:00:00`)) : endOfDay(now);
                return { start: s, end: e };
            }
            case "hoje":
            default:
                return { start: startOfDay(now), end: endOfDay(now) };
        }
    }, [period, customStart, customEnd]);

    // Filtra por created_at: o período é a data em que o agendamento FOI FEITO,
    // não a data da consulta (regra do usuário).
    const { data: rows, isLoading } = useQuery({
        queryKey: ["agendamentos-colaborador", ownerId, range.start.toISOString(), range.end.toISOString()],
        enabled: !!ownerId,
        queryFn: async (): Promise<Row[]> => {
            const PAGE = 1000; // cap do PostgREST: paginar ou a lista trunca em silêncio
            const all: any[] = [];
            for (let from = 0; ; from += PAGE) {
                const { data, error } = await supabase
                    .from("appointments")
                    .select("id, start_time, status, price, created_at, created_by, created_via, service_name, professional_name, contact_id, contacts(push_name, number)")
                    .eq("user_id", ownerId!)
                    .eq("type", "appointment")
                    .gte("created_at", range.start.toISOString())
                    .lte("created_at", range.end.toISOString())
                    .order("created_at", { ascending: false })
                    .range(from, from + PAGE - 1);
                if (error) throw error;
                const page = (data || []) as any[];
                all.push(...page);
                if (page.length < PAGE) break;
            }

            const result: Row[] = [];
            for (const a of all) {
                const via = a.created_via || "";
                let authorKey: string;
                if (IA_ORIGINS.has(via)) authorKey = IA_KEY;
                else if (a.created_by) authorKey = a.created_by;
                // Agendamento antigo, anterior ao registro de autoria: sem dono
                // conhecido, fica de fora em vez de ser atribuído a quem não fez.
                else continue;

                result.push({
                    id: a.id,
                    contactId: a.contact_id,
                    clientName: a.contacts?.push_name || "—",
                    clientPhone: a.contacts?.number || "—",
                    service: a.service_name || "—",
                    professional: a.professional_name || "—",
                    startTime: a.start_time,
                    status: a.status,
                    price: a.price ?? null,
                    createdAt: a.created_at,
                    origin: via,
                    authorKey,
                });
            }
            return result;
        },
    });

    const tabs: AuthorTab[] = useMemo(() => {
        const nameById = new Map((staff || []).map((s) => [s.id, s.name]));
        const byAuthor = new Map<string, Row[]>();
        for (const r of rows || []) {
            const list = byAuthor.get(r.authorKey);
            if (list) list.push(r);
            else byAuthor.set(r.authorKey, [r]);
        }

        const collaborators: AuthorTab[] = [];
        let ia: AuthorTab | null = null;
        for (const [key, list] of byAuthor) {
            if (key === IA_KEY) {
                ia = { key, label: "IA", rows: list };
                continue;
            }
            collaborators.push({ key, label: nameById.get(key) || "Colaborador removido", rows: list });
        }
        collaborators.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
        return ia ? [...collaborators, ia] : collaborators;
    }, [rows, staff]);

    const visibleRows = useMemo(() => {
        if (activeTab === "todos") return rows || [];
        return tabs.find((t) => t.key === activeTab)?.rows || [];
    }, [activeTab, rows, tabs]);

    const handleExport = () => {
        if (tabs.length === 0) {
            toast.error("Nada para exportar neste período.");
            return;
        }
        const wb = XLSX.utils.book_new();
        const used = new Set<string>();
        for (const tab of tabs) {
            const sheet = XLSX.utils.json_to_sheet(
                tab.rows.map((r) => ({
                    Cliente: r.clientName,
                    Telefone: r.clientPhone,
                    Serviço: r.service,
                    Profissional: r.professional,
                    "Data do atendimento": dateTime(r.startTime),
                    Status: STATUS_LABELS[r.status || ""] || r.status || "—",
                    Valor: r.price ?? "",
                    "Agendado em": dateTime(r.createdAt),
                    Origem: ORIGIN_LABELS[r.origin] || r.origin || "—",
                })),
            );
            XLSX.utils.book_append_sheet(wb, sheet, sheetName(tab.label, used));
        }
        const stamp = (d: Date) => d.toISOString().slice(0, 10);
        XLSX.writeFile(wb, `agendamentos-por-colaborador_${stamp(range.start)}_a_${stamp(range.end)}.xlsx`);
    };

    return (
        <div className="space-y-3" data-tour="dashboard-agendamentos-colaborador">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Agendamentos por colaborador</h3>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                        <SelectTrigger className="h-8 w-[170px] text-xs">
                            <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent>
                            {PERIOD_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {period === "custom" && (
                        <div className="flex items-center gap-1.5">
                            <Input
                                type="date" value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="h-8 w-[135px] text-xs"
                            />
                            <span className="text-xs text-muted-foreground">até</span>
                            <Input
                                type="date" value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="h-8 w-[135px] text-xs"
                            />
                        </div>
                    )}

                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Exportar
                    </Button>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Conta pela data em que o agendamento foi feito. Agendamentos via API ou link público entram como IA;
                os importados por planilha ficam com quem subiu o arquivo.
            </p>

            <div className="border rounded-xl bg-card overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="border-b px-2 pt-2">
                        <TabsList className="overflow-x-auto flex-nowrap max-w-full justify-start">
                            <TabsTrigger value="todos" className="shrink-0">
                                Todos
                                <Badge variant="secondary" className="ml-1.5">{rows?.length ?? 0}</Badge>
                            </TabsTrigger>
                            {tabs.map((t) => (
                                <TabsTrigger key={t.key} value={t.key} className="shrink-0">
                                    {t.key === IA_KEY && <Bot className="h-3.5 w-3.5 mr-1" />}
                                    {t.label}
                                    <Badge variant="secondary" className="ml-1.5">{t.rows.length}</Badge>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    <div className="max-h-[420px] overflow-auto">
                        <table className="w-full text-sm min-w-[880px]">
                            <thead className="bg-muted/50 sticky top-0 z-10">
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="px-3 py-2 font-medium">Cliente</th>
                                    <th className="px-3 py-2 font-medium">Telefone</th>
                                    <th className="px-3 py-2 font-medium">Serviço</th>
                                    <th className="px-3 py-2 font-medium">Profissional</th>
                                    <th className="px-3 py-2 font-medium">Atendimento</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Valor</th>
                                    <th className="px-3 py-2 font-medium">Agendado em</th>
                                    <th className="px-3 py-2 font-medium">Origem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>
                                ) : visibleRows.length === 0 ? (
                                    <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                                        Nenhum agendamento feito neste período.
                                    </td></tr>
                                ) : (
                                    visibleRows.map((r) => (
                                        <tr key={r.id} className="hover:bg-muted/30">
                                            <td className="px-3 py-1.5 max-w-[180px]">
                                                {r.contactId ? (
                                                    <button
                                                        type="button"
                                                        className="text-primary hover:underline font-medium truncate max-w-full text-left block"
                                                        title="Abrir chat com este cliente"
                                                        onClick={() => setChatContact({ id: r.contactId!, name: r.clientName })}
                                                    >
                                                        {r.clientName}
                                                    </button>
                                                ) : r.clientName}
                                            </td>
                                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.clientPhone}</td>
                                            <td className="px-3 py-1.5 truncate max-w-[180px]" title={r.service}>{r.service}</td>
                                            <td className="px-3 py-1.5 truncate max-w-[150px]" title={r.professional}>{r.professional}</td>
                                            <td className="px-3 py-1.5 text-xs whitespace-nowrap">{dateTime(r.startTime)}</td>
                                            <td className="px-3 py-1.5">
                                                <Badge variant="secondary" className={STATUS_CLASSES[r.status || ""] || "bg-muted text-muted-foreground"}>
                                                    {STATUS_LABELS[r.status || ""] || r.status || "—"}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-1.5 whitespace-nowrap">{money(r.price)}</td>
                                            <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{dateTime(r.createdAt)}</td>
                                            <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                                                {ORIGIN_LABELS[r.origin] || r.origin || "—"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Tabs>
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
