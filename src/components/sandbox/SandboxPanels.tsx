import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Pencil, Save, ShoppingBag, Terminal, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_COLORS, type CrmStage } from "@/types/crm-client";
import { CLIENT_STAGE_LABEL, normalizeClientStage } from "@/lib/clientStage";
import type {
    SandboxApiLog,
    SandboxAppointment,
    SandboxContact,
    SandboxCrmCard,
    SandboxCrmHistory,
    SandboxSale,
} from "@/hooks/useSandbox";
import type { CatalogoConvenio, CatalogoSala, CatalogoServico } from "./useSandboxCatalog";

/**
 * Painéis do lado direito do chat: o que a IA fez e como o mundo fictício ficou.
 * Tudo é leitura das tabelas `sandbox_*` — só o paciente é editável.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const HORA = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
});
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
});

const STATUS_AGENDAMENTO: Record<string, string> = {
    pending: "Aguardando confirmação",
    confirmed: "Confirmado",
    completed: "Concluído",
    canceled: "Cancelado",
    cancelled: "Cancelado",
    rescheduled: "Reagendado",
    no_show: "Não compareceu",
};

// ── Paciente fictício ────────────────────────────────────────────────────────

interface PacienteCardProps {
    contato: SandboxContact | undefined;
    convenios: CatalogoConvenio[];
    salvando: boolean;
    onSalvar: (patch: Record<string, unknown>) => void;
}

export function SandboxPacienteCard({
    contato,
    convenios,
    salvando,
    onSalvar,
}: PacienteCardProps) {
    const [editando, setEditando] = useState(false);
    const [form, setForm] = useState({
        push_name: "",
        email: "",
        cpf: "",
        instagram: "",
        convenio_ids: [] as string[],
    });

    useEffect(() => {
        if (!contato) return;
        setForm({
            push_name: contato.push_name || "",
            email: contato.email || "",
            cpf: contato.cpf || "",
            instagram: contato.instagram || "",
            convenio_ids: contato.convenio_ids || [],
        });
    }, [contato]);

    if (!contato) return null;

    const salvar = () => {
        onSalvar({
            push_name: form.push_name.trim() || "Paciente de Teste",
            email: form.email.trim() || null,
            cpf: form.cpf.trim() || null,
            instagram: form.instagram.trim() || null,
            convenio_ids: form.convenio_ids,
        });
        setEditando(false);
    };

    const nomeConvenio = (id: string) => convenios.find((c) => c.id === id)?.nome || "Convênio";

    return (
        <Card data-tour="sandbox-paciente">
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="text-sm">Paciente fictício</CardTitle>
                {editando
                    ? (
                        <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" onClick={salvar} disabled={salvando}>
                                {salvando
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Save className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    )
                    : (
                        <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {editando
                    ? (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Nome</Label>
                                <Input
                                    value={form.push_name}
                                    onChange={(e) => setForm({ ...form, push_name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">E-mail</Label>
                                <Input
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">CPF</Label>
                                    <Input
                                        value={form.cpf}
                                        onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Instagram</Label>
                                    <Input
                                        value={form.instagram}
                                        onChange={(e) =>
                                            setForm({ ...form, instagram: e.target.value })}
                                    />
                                </div>
                            </div>
                            {convenios.length > 0 && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Convênios do paciente</Label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {convenios.map((c) => {
                                            const marcado = form.convenio_ids.includes(c.id);
                                            return (
                                                <Badge
                                                    key={c.id}
                                                    variant={marcado ? "default" : "outline"}
                                                    className="cursor-pointer"
                                                    onClick={() =>
                                                        setForm({
                                                            ...form,
                                                            convenio_ids: marcado
                                                                ? form.convenio_ids.filter((id) =>
                                                                    id !== c.id
                                                                )
                                                                : [...form.convenio_ids, c.id],
                                                        })}
                                                >
                                                    {c.nome}
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                    : (
                        <div className="space-y-1.5">
                            <p className="font-medium">{contato.push_name}</p>
                            <p className="text-xs text-muted-foreground">{contato.number}</p>
                            {contato.email && (
                                <p className="text-xs text-muted-foreground">{contato.email}</p>
                            )}
                            {contato.cpf && (
                                <p className="text-xs text-muted-foreground">CPF {contato.cpf}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                <Badge variant="secondary">
                                    {CLIENT_STAGE_LABEL[normalizeClientStage(contato.client_stage)]}
                                </Badge>
                                {(contato.convenio_ids || []).map((id) => (
                                    <Badge key={id} variant="outline">{nomeConvenio(id)}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
            </CardContent>
        </Card>
    );
}

// ── Chamadas de API ──────────────────────────────────────────────────────────

export function SandboxLogsCard({ logs }: { logs: SandboxApiLog[] }) {
    return (
        <Card data-tour="sandbox-logs">
            <CardHeader className="flex-row items-center gap-2 space-y-0 py-3">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">O que a IA fez</CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 space-y-2 overflow-y-auto">
                {logs.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        Nenhuma chamada ainda. Cada consulta ou agendamento da IA aparece aqui.
                    </p>
                )}
                {logs.map((l) => (
                    <div key={l.id} className="flex items-start gap-2 text-xs">
                        {l.ok
                            ? (
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            )
                            : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                        <div className="min-w-0">
                            <p className="leading-snug">{l.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                                {HORA.format(new Date(l.created_at))} · {l.function_name}
                            </p>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// ── CRM ──────────────────────────────────────────────────────────────────────

export function SandboxCrmCardPanel({
    cards,
    historico,
}: {
    cards: SandboxCrmCard[];
    historico: SandboxCrmHistory[];
}) {
    const ativo = cards.find((c) => c.is_active) || cards[0];

    return (
        <Card data-tour="sandbox-crm">
            <CardHeader className="py-3">
                <CardTitle className="text-sm">Etapa no CRM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {!ativo && (
                    <p className="text-xs text-muted-foreground">
                        A IA ainda não criou card. Ele nasce quando ela qualifica ou agenda.
                    </p>
                )}
                {ativo && (
                    <div className="flex items-center gap-2">
                        <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                                backgroundColor: STAGE_COLORS[ativo.stage as CrmStage] || "#94a3b8",
                            }}
                        />
                        <span className="text-sm font-medium">{ativo.stage}</span>
                        {!ativo.is_active && (
                            <Badge variant="outline" className="text-[10px]">encerrado</Badge>
                        )}
                    </div>
                )}

                {historico.length > 0 && (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto border-t pt-2">
                        {historico.map((h) => (
                            <div key={h.id} className="text-xs text-muted-foreground">
                                <span className="text-foreground">{h.to_stage}</span>
                                {h.from_stage && <span> — veio de {h.from_stage}</span>}
                                <span className="block text-[10px]">
                                    {DATA_HORA.format(new Date(h.created_at))}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Agendamentos e vendas ────────────────────────────────────────────────────

export function SandboxAgendaCard({
    agendamentos,
    vendas,
    salas,
    servicos,
}: {
    agendamentos: SandboxAppointment[];
    vendas: SandboxSale[];
    salas: CatalogoSala[];
    servicos: CatalogoServico[];
}) {
    const nomeSala = (id: string | null) =>
        (id && salas.find((s) => s.id === id)?.name) || "Sala";
    const nomeServico = (id: string | null, fallback: string | null) =>
        (id && servicos.find((s) => s.id === id)?.label) || fallback || "Procedimento";

    return (
        <Card data-tour="sandbox-agenda-card">
            <CardHeader className="flex-row items-center gap-2 space-y-0 py-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Agendamentos e vendas do teste</CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 space-y-3 overflow-y-auto">
                {agendamentos.length === 0 && vendas.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        Nada agendado ainda neste ambiente.
                    </p>
                )}

                {agendamentos.map((a) => (
                    <div key={a.id} className="rounded-md border p-2 text-xs">
                        <p className="font-medium">
                            {nomeServico(a.service_id, a.title)}
                        </p>
                        <p className="text-muted-foreground">
                            {DATA_HORA.format(new Date(a.start_time))} · {nomeSala(a.professional_id)}
                        </p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                            {STATUS_AGENDAMENTO[a.status] || a.status}
                        </Badge>
                    </div>
                ))}

                {vendas.length > 0 && (
                    <div className="space-y-1.5 border-t pt-2">
                        {vendas.map((v) => (
                            <div key={v.id} className="flex items-start gap-2 text-xs">
                                <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="truncate">
                                        {nomeServico(v.service_client_id, v.service_name)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {BRL.format(Number(v.value || 0))}
                                        {v.appointment_id ? " · já agendado" : " · aguardando agendamento"}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
