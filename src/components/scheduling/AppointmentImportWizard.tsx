import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, ArrowRight, ArrowLeft, Check, AlertTriangle, XCircle, Download, Loader2, CalendarPlus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { parseFile, ParsedSheet } from "@/lib/importParser";
import { autoMapColumns } from "@/lib/importMapper";
import { ValidatedRow } from "@/lib/importTransformers";
import {
    APPOINTMENT_FIELDS, STATUS_LABELS, entityKey,
    validateAppointmentRow, importAppointments,
    EntityLink, AppointmentImportResult,
} from "@/lib/importAppointments";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type Step = "upload" | "mapping" | "links" | "preview" | "result";

const STEP_LABELS: Record<Step, string> = {
    upload: "Upload",
    mapping: "Mapeamento",
    links: "Vínculos",
    preview: "Validação",
    result: "Resultado",
};

const STEPS: Step[] = ["upload", "mapping", "links", "preview", "result"];

interface AppointmentImportWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AppointmentImportWizard({ open, onOpenChange }: AppointmentImportWizardProps) {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const [step, setStep] = useState<Step>("upload");
    const [parsed, setParsed] = useState<ParsedSheet | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [validated, setValidated] = useState<ValidatedRow[]>([]);
    const [profLinks, setProfLinks] = useState<EntityLink[]>([]);
    const [svcLinks, setSvcLinks] = useState<EntityLink[]>([]);
    const [autoCrm, setAutoCrm] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<AppointmentImportResult | null>(null);

    const { data: professionals } = useQuery({
        queryKey: ["professionals"],
        queryFn: async () => {
            const { data, error } = await supabase.from("professionals").select("*");
            if (error) throw error;
            return data as any[];
        },
        enabled: open,
    });

    const { data: services } = useQuery({
        queryKey: ["services-client-active"],
        queryFn: async () => {
            const { data, error } = await supabase.from("services_client").select("*").eq("status", true);
            if (error) throw error;
            return data as any[];
        },
        enabled: open,
    });

    const reset = () => {
        setStep("upload");
        setParsed(null);
        setMapping({});
        setValidated([]);
        setProfLinks([]);
        setSvcLinks([]);
        setAutoCrm(false);
        setResult(null);
        setProgress(0);
    };

    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            if (importing) return;
            reset();
        }
        onOpenChange(isOpen);
    };

    // ─── Step 1: Upload ──────────────────────────────────────────────

    const processFile = async (f: File) => {
        try {
            const data = await parseFile(f);
            if (data.rows.length === 0) throw new Error("Planilha sem dados");
            setParsed(data);
            setMapping(autoMapColumns(data.headers, APPOINTMENT_FIELDS));
            setStep("mapping");
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleFileDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) await processFile(f);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) await processFile(f);
        e.target.value = "";
    };

    const downloadTemplate = () => {
        const headers = ["Nome", "Telefone", "Data", "Hora", "Profissional", "Serviço", "Status", "Valor", "Observações"];
        const example = ["Ana Silva", "(11) 99999-9999", "15/08/2026", "14:30", "Dra. Paula", "Limpeza de Pele", "Confirmado", "250,00", ""];
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "modelo_agendamentos.xlsx");
    };

    // ─── Step 2: Mapping ─────────────────────────────────────────────

    const updateMapping = (header: string, fieldKey: string) => {
        setMapping((prev) => {
            const next = { ...prev };
            if (fieldKey) {
                for (const [h, f] of Object.entries(next)) {
                    if (f === fieldKey && h !== header) delete next[h];
                }
                next[header] = fieldKey;
            } else {
                delete next[header];
            }
            return next;
        });
    };

    const requiredFieldsMapped = APPOINTMENT_FIELDS
        .filter((f) => f.required)
        .every((f) => Object.values(mapping).includes(f.key));

    const goToLinks = () => {
        if (!parsed) return;
        const rows = parsed.rows.map((row) => validateAppointmentRow(row, mapping));
        setValidated(rows);

        const usable = rows.filter((r) => r.status !== "error");

        // Profissionais distintos — auto-match por nome; sem match → criar automaticamente
        const profMap = new Map<string, EntityLink>();
        for (const r of usable) {
            const key = r.data.professionalKey as string;
            if (!key) continue;
            const existing = profMap.get(key);
            if (existing) { existing.count++; continue; }
            const match = (professionals || []).find((p) => entityKey(p.name) === key);
            profMap.set(key, { key, label: r.data.professionalLabel, target: match?.id || "__create", count: 1 });
        }
        setProfLinks([...profMap.values()].sort((a, b) => a.label.localeCompare(b.label)));

        // Serviços distintos — auto-match por nome; sem match → seleção obrigatória
        const svcMap = new Map<string, EntityLink>();
        for (const r of usable) {
            const key = r.data.serviceKey as string;
            if (!key) continue;
            const existing = svcMap.get(key);
            if (existing) { existing.count++; continue; }
            const match = (services || []).find((s) => entityKey(s.name) === key);
            svcMap.set(key, { key, label: r.data.serviceLabel, target: match?.id || "", count: 1 });
        }
        setSvcLinks([...svcMap.values()].sort((a, b) => a.label.localeCompare(b.label)));

        setStep("links");
    };

    // ─── Step 3: Links ───────────────────────────────────────────────

    const allServicesLinked = svcLinks.length > 0 && svcLinks.every((l) => !!l.target);
    const sortedServices = [...(services || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const sortedProfessionals = [...(professionals || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // ─── Step 4: Preview ─────────────────────────────────────────────

    const validCount = validated.filter((r) => r.status === "valid").length;
    const warningCount = validated.filter((r) => r.status === "warning").length;
    const errorCount = validated.filter((r) => r.status === "error").length;
    const importableRows = validated.filter((r) => r.status !== "error");

    const resolveProfName = (key: string) => {
        const link = profLinks.find((l) => l.key === key);
        if (!link) return "—";
        if (link.target === "__create") return `${link.label} (novo)`;
        return (professionals || []).find((p) => p.id === link.target)?.name || link.label;
    };

    const resolveSvcName = (key: string) => {
        const link = svcLinks.find((l) => l.key === key);
        if (!link?.target) return "—";
        return (services || []).find((s) => s.id === link.target)?.name || link.label;
    };

    const effectiveStatus = (r: ValidatedRow) => {
        if (r.data.status) return r.data.status as string;
        if (!r.data.start) return "pending";
        return new Date(r.data.start).getTime() < Date.now() ? "completed" : "pending";
    };

    const startImport = async () => {
        if (!ownerId || importableRows.length === 0) return;
        setImporting(true);
        setProgress(0);
        try {
            const res = await importAppointments({
                ownerId,
                rows: importableRows,
                professionalLinks: profLinks,
                serviceLinks: svcLinks,
                autoCrm,
                onProgress: (cur, total) => setProgress(Math.round((cur / total) * 100)),
            });
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            queryClient.invalidateQueries({ queryKey: ["professionals"] });
            queryClient.invalidateQueries({ queryKey: ["services-client-active"] });
            queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
            queryClient.invalidateQueries({ queryKey: ["sales"] });
            setResult(res);
            setStep("result");
        } catch (err: any) {
            toast.error("Erro na importação: " + err.message);
        } finally {
            setImporting(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────

    const stepIndex = STEPS.indexOf(step);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarPlus className="w-5 h-5" />
                        Importar Agendamentos
                    </DialogTitle>
                </DialogHeader>

                {/* Step indicators */}
                <div className="flex items-center gap-1 px-1">
                    {STEPS.map((s, i) => (
                        <div key={s} className="flex items-center gap-1 flex-1">
                            <div className={cn(
                                "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0",
                                i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                                {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                            </div>
                            <span className={cn("text-[11px] truncate", i === stepIndex ? "font-semibold" : "text-muted-foreground")}>
                                {STEP_LABELS[s]}
                            </span>
                            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">

                    {/* ── STEP 1: Upload ── */}
                    {step === "upload" && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Importe agendamentos de uma planilha. Aceitamos <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong>.
                                Data e hora podem estar em colunas separadas ou combinadas na mesma coluna.
                            </p>

                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleFileDrop}
                                className="border-2 border-dashed rounded-lg p-10 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer"
                                onClick={() => document.getElementById("appointment-import-file-input")?.click()}
                            >
                                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                                <p className="text-sm font-medium">Arraste seu arquivo aqui</p>
                                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                                <input id="appointment-import-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
                            </div>

                            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                                <Download className="w-4 h-4" />
                                Baixar modelo de exemplo (.xlsx)
                            </Button>
                        </div>
                    )}

                    {/* ── STEP 2: Mapping ── */}
                    {step === "mapping" && parsed && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Associe cada coluna da planilha ao campo correspondente.
                                </p>
                                <Badge variant="secondary" className="text-xs shrink-0">{parsed.rows.length} linhas</Badge>
                            </div>

                            <div className="space-y-2">
                                {parsed.headers.map((header) => {
                                    const mappedField = mapping[header] || "";
                                    const sampleValues = parsed.rows.slice(0, 3).map((r) => r[header]).filter(Boolean);
                                    return (
                                        <div key={header} className="flex items-center gap-3 p-2.5 border rounded-md bg-background">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-medium truncate">{header}</span>
                                                    {!!mappedField && <Badge variant="outline" className="text-[8px] px-1 py-0">auto</Badge>}
                                                </div>
                                                {sampleValues.length > 0 && (
                                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                                        ex: {sampleValues.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <select
                                                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                                value={mappedField}
                                                onChange={(e) => updateMapping(header, e.target.value)}
                                            >
                                                <option value="">Ignorar</option>
                                                {APPOINTMENT_FIELDS.map((f) => (
                                                    <option key={f.key} value={f.key} disabled={Object.values(mapping).includes(f.key) && mapping[header] !== f.key}>
                                                        {f.label} {f.required ? "*" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>

                            {!requiredFieldsMapped && (
                                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <p className="text-xs text-muted-foreground">
                                        Campos obrigatórios (*) precisam ser mapeados para continuar. A Hora pode vir combinada na coluna Data.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 3: Links ── */}
                    {step === "links" && (
                        <div className="space-y-5">
                            <div>
                                <h4 className="text-sm font-semibold mb-1">Profissionais</h4>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Vincule cada profissional da planilha a um cadastrado, ou crie automaticamente com jornada padrão.
                                </p>
                                <div className="space-y-2">
                                    {profLinks.map((link) => (
                                        <div key={link.key} className="flex items-center gap-3 p-2.5 border rounded-md bg-background">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs font-medium truncate block">{link.label}</span>
                                                <span className="text-[10px] text-muted-foreground">{link.count} agendamento{link.count > 1 ? "s" : ""}</span>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <select
                                                className="h-8 w-56 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                                value={link.target}
                                                onChange={(e) =>
                                                    setProfLinks((prev) => prev.map((l) => l.key === link.key ? { ...l, target: e.target.value } : l))
                                                }
                                            >
                                                <option value="__create">Criar automaticamente</option>
                                                {sortedProfessionals.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            {link.target === "__create" && (
                                                <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200 shrink-0">
                                                    <UserPlus className="w-3 h-3" /> novo
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                    {profLinks.length === 0 && (
                                        <p className="text-xs text-muted-foreground">Nenhum profissional encontrado nas linhas válidas.</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold mb-1">Serviços</h4>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Vincule cada serviço da planilha a um serviço cadastrado. A duração do serviço define o horário final do agendamento.
                                </p>
                                <div className="space-y-2">
                                    {svcLinks.map((link) => (
                                        <div key={link.key} className="flex items-center gap-3 p-2.5 border rounded-md bg-background">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs font-medium truncate block">{link.label}</span>
                                                <span className="text-[10px] text-muted-foreground">{link.count} agendamento{link.count > 1 ? "s" : ""}</span>
                                            </div>
                                            {!link.target && (
                                                <Badge className="gap-1 bg-red-100 text-red-700 border-red-200 shrink-0">
                                                    <XCircle className="w-3 h-3" /> serviço não existente
                                                </Badge>
                                            )}
                                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <select
                                                className={cn(
                                                    "h-8 w-56 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                                                    link.target ? "border-input" : "border-red-300"
                                                )}
                                                value={link.target}
                                                onChange={(e) =>
                                                    setSvcLinks((prev) => prev.map((l) => l.key === link.key ? { ...l, target: e.target.value } : l))
                                                }
                                            >
                                                <option value="" disabled>Selecionar serviço...</option>
                                                {sortedServices.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                    {svcLinks.length === 0 && (
                                        <p className="text-xs text-muted-foreground">Nenhum serviço encontrado nas linhas válidas.</p>
                                    )}
                                </div>
                            </div>

                            {!allServicesLinked && svcLinks.length > 0 && (
                                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <p className="text-xs text-muted-foreground">
                                        Todos os serviços precisam ser vinculados a um serviço cadastrado para continuar.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 4: Preview ── */}
                    {step === "preview" && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                                    <Check className="w-3 h-3" /> {validCount} válidos
                                </Badge>
                                {warningCount > 0 && (
                                    <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                                        <AlertTriangle className="w-3 h-3" /> {warningCount} avisos
                                    </Badge>
                                )}
                                {errorCount > 0 && (
                                    <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">
                                        <XCircle className="w-3 h-3" /> {errorCount} erros
                                    </Badge>
                                )}
                            </div>

                            <p className="text-xs text-muted-foreground">
                                Linhas com <span className="text-red-600 font-medium">erros</span> não serão importadas.
                                Contatos serão localizados pelos últimos 8 dígitos do telefone (novos serão criados).
                                Status vazio: data passada → Finalizado; data futura → Pendente.
                            </p>

                            <div className="border rounded-md overflow-x-auto max-h-[280px] overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted sticky top-0">
                                        <tr>
                                            <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Nome</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Data/Hora</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Profissional</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Serviço</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Status</th>
                                            <th className="px-2 py-1.5 text-left font-medium">Valor</th>
                                            <th className="px-2 py-1.5 text-left font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {validated.slice(0, 100).map((row, i) => (
                                            <tr key={i} className={cn(
                                                "border-t",
                                                row.status === "error" && "bg-red-50 dark:bg-red-950/20",
                                                row.status === "warning" && "bg-amber-50 dark:bg-amber-950/20"
                                            )}>
                                                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                                                <td className="px-2 py-1 truncate max-w-[120px]">{row.data.name || "—"}</td>
                                                <td className="px-2 py-1 whitespace-nowrap">
                                                    {row.data.start
                                                        ? new Date(row.data.start).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                                                        : "—"}
                                                </td>
                                                <td className="px-2 py-1 truncate max-w-[110px]">
                                                    {row.status === "error" ? (row.data.professionalLabel || "—") : resolveProfName(row.data.professionalKey)}
                                                </td>
                                                <td className="px-2 py-1 truncate max-w-[110px]">
                                                    {row.status === "error" ? (row.data.serviceLabel || "—") : resolveSvcName(row.data.serviceKey)}
                                                </td>
                                                <td className="px-2 py-1 whitespace-nowrap">
                                                    {row.status === "error" ? "—" : STATUS_LABELS[effectiveStatus(row)] || effectiveStatus(row)}
                                                </td>
                                                <td className="px-2 py-1 whitespace-nowrap">
                                                    {row.data.price != null
                                                        ? row.data.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                                        : "cadastrado"}
                                                </td>
                                                <td className="px-2 py-1">
                                                    {row.status === "valid" && <Check className="w-3.5 h-3.5 text-green-600" />}
                                                    {row.status === "warning" && (
                                                        <span title={row.errors.join(", ")}><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /></span>
                                                    )}
                                                    {row.status === "error" && (
                                                        <span className="flex items-center gap-1 text-red-600" title={row.errors.join(", ")}>
                                                            <XCircle className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] truncate max-w-[100px]">{row.errors[0]}</span>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {validated.length > 100 && (
                                    <p className="text-center text-[10px] text-muted-foreground py-2">
                                        Mostrando 100 de {validated.length} linhas
                                    </p>
                                )}
                            </div>

                            <label className="flex items-start gap-2.5 p-3 border rounded-lg cursor-pointer hover:bg-accent/30 transition-colors">
                                <Checkbox
                                    checked={autoCrm}
                                    onCheckedChange={(v) => setAutoCrm(!!v)}
                                    className="mt-0.5"
                                />
                                <span className="text-xs">
                                    <span className="font-medium block">Lançar vendas e criar negociações automaticamente</span>
                                    <span className="text-muted-foreground">
                                        Finalizados → venda + card Ganho · Pendentes/Confirmados → card em Agendado · Cancelados/Faltas → card Perdido
                                    </span>
                                </span>
                            </label>

                            {importing && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm">Importando... {progress}%</span>
                                    </div>
                                    <Progress value={progress} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 5: Result ── */}
                    {step === "result" && result && (
                        <div className="space-y-4 text-center py-4">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                                <Check className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-lg font-semibold">Importação concluída!</h3>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
                                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                                    <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                                    <p className="text-[10px] text-muted-foreground">Agendamentos</p>
                                </div>
                                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                                    <p className="text-2xl font-bold text-blue-600">{result.contactsCreated}</p>
                                    <p className="text-[10px] text-muted-foreground">Contatos criados</p>
                                </div>
                                <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20">
                                    <p className="text-2xl font-bold text-violet-600">{result.professionalsCreated}</p>
                                    <p className="text-[10px] text-muted-foreground">Profissionais criados</p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                                    <p className="text-2xl font-bold text-amber-600">{result.salesCreated + result.cardsCreated}</p>
                                    <p className="text-[10px] text-muted-foreground">Vendas + negociações</p>
                                </div>
                            </div>

                            {result.failed > 0 && (
                                <p className="text-xs text-red-600">{result.failed} linha{result.failed > 1 ? "s" : ""} não importada{result.failed > 1 ? "s" : ""}</p>
                            )}

                            {result.errors.length > 0 && (
                                <div className="text-left max-w-md mx-auto">
                                    <p className="text-xs font-medium mb-1">Erros:</p>
                                    <div className="max-h-[100px] overflow-y-auto space-y-1">
                                        {result.errors.map((err, i) => (
                                            <p key={i} className="text-[10px] text-red-600">{err}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer nav */}
                <div className="flex items-center justify-between pt-3 border-t">
                    <div>
                        {step !== "upload" && step !== "result" && (
                            <Button variant="ghost" size="sm" onClick={() => setStep(STEPS[stepIndex - 1])} disabled={importing}>
                                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                            </Button>
                        )}
                    </div>
                    <div>
                        {step === "mapping" && (
                            <Button size="sm" onClick={goToLinks} disabled={!requiredFieldsMapped}>
                                Vincular <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                        {step === "links" && (
                            <Button size="sm" onClick={() => setStep("preview")} disabled={!allServicesLinked}>
                                Validar <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                        {step === "preview" && (
                            <Button size="sm" onClick={startImport} disabled={importing || importableRows.length === 0}>
                                {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                                Importar {importableRows.length} agendamento{importableRows.length !== 1 ? "s" : ""}
                            </Button>
                        )}
                        {step === "result" && (
                            <Button size="sm" onClick={() => handleClose(false)}>
                                Fechar
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
