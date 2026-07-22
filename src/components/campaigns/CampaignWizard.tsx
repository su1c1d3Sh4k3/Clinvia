import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ChevronLeft, ChevronRight, Loader2, Megaphone, Clock, DollarSign, Users,
    FileSpreadsheet, FileCode2, Kanban, Tag as TagIcon, CalendarDays, ShoppingCart,
} from "lucide-react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import { useMetaInstances, useCampaignMutations, Campaign, CampaignService } from "@/hooks/useCampaigns";
import { useUsdBrlRate } from "@/hooks/useUsdBrlRate";
import { AudienceSelection, EMPTY_AUDIENCE } from "./audienceTypes";
import { AudienceFileUpload } from "./audience/AudienceFileUpload";
import { AudienceCrm } from "./audience/AudienceCrm";
import { AudienceTag } from "./audience/AudienceTag";
import { AudienceAppointments } from "./audience/AudienceAppointments";
import { AudienceSales } from "./audience/AudienceSales";

const COST_PER_MSG_USD = 0.0625;
const SPACING_SECONDS = 15;

const SOURCE_OPTIONS = [
    { value: "csv", label: "Arquivo CSV/Excel", icon: FileSpreadsheet },
    { value: "xml", label: "Arquivo XML", icon: FileCode2 },
    { value: "crm", label: "Etapa do CRM", icon: Kanban },
    { value: "tag", label: "Etiqueta", icon: TagIcon },
    { value: "appointments", label: "Agendamentos", icon: CalendarDays },
    { value: "sales", label: "Vendas", icon: ShoppingCart },
] as const;

type SourceType = (typeof SOURCE_OPTIONS)[number]["value"];

const STEPS = ["Dados", "Audiência", "Serviços", "Mensagem", "Objetivo", "Revisão"];

interface CampaignWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Campanha em edição (null = criação). */
    campaign?: Campaign | null;
}

function toLocalInputValue(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(totalSeconds: number): string {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.ceil((totalSeconds % 3600) / 60);
    if (h === 0) return `${m} min`;
    return `${h}h ${m}min`;
}

export function CampaignWizard({ open, onOpenChange, campaign }: CampaignWizardProps) {
    const isEdit = !!campaign;
    const { data: instances } = useMetaInstances();
    const { createCampaign, updateCampaign } = useCampaignMutations();
    const { data: rateData } = useUsdBrlRate();

    const [step, setStep] = useState(0);
    const [name, setName] = useState("");
    const [instanceId, setInstanceId] = useState("");
    const [scheduledAt, setScheduledAt] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [sourceType, setSourceType] = useState<SourceType | "">("");
    const [audience, setAudience] = useState<AudienceSelection>(EMPTY_AUDIENCE);
    const [selectedServices, setSelectedServices] = useState<CampaignService[]>([]);
    const [discountPct, setDiscountPct] = useState<string>("");
    const [message, setMessage] = useState("");
    const [objective, setObjective] = useState("");
    const [iaEnabled, setIaEnabled] = useState(true);
    const messageRef = useRef<HTMLTextAreaElement>(null);

    // Pré-preenche em edição / reseta em criação
    useEffect(() => {
        if (!open) return;
        if (campaign) {
            setName(campaign.name);
            setInstanceId(campaign.instance_id || "");
            setScheduledAt(toLocalInputValue(campaign.scheduled_at));
            setValidUntil(toLocalInputValue(campaign.valid_until));
            setSourceType(campaign.source_type);
            setAudience({ contactIds: [], invalidRows: [], config: campaign.source_config || {} });
            setSelectedServices(campaign.services || []);
            setDiscountPct(campaign.discount_pct != null ? String(campaign.discount_pct) : "");
            setMessage(campaign.initial_message);
            setObjective(campaign.objective);
            setIaEnabled(campaign.ia_enabled);
        } else {
            setName("");
            setInstanceId("");
            setScheduledAt("");
            setValidUntil("");
            setSourceType("");
            setAudience(EMPTY_AUDIENCE);
            setSelectedServices([]);
            setDiscountPct("");
            setMessage("");
            setObjective("");
            setIaEnabled(true);
        }
        setStep(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, campaign?.id]);

    // Carrega contatos existentes da campanha em edição (para manter audiência se não mudar)
    const { data: existingContactIds } = useQuery({
        queryKey: ["campaign-existing-contacts", campaign?.id],
        queryFn: async (): Promise<string[]> => {
            const { data } = await supabase
                .from("campaign_contacts" as any)
                .select("contact_id")
                .eq("campaign_id", campaign!.id)
                .not("contact_id", "is", null);
            return ((data || []) as any[]).map((r) => r.contact_id);
        },
        enabled: !!campaign?.id && open,
    });

    const { data: services } = useQuery({
        queryKey: ["campaign-services"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("services_client")
                .select("*")
                .eq("status", true)
                .order("name");
            if (error) throw error;
            return (data || []) as any[];
        },
        enabled: open,
    });

    const effectiveContactIds = audience.contactIds.length > 0
        ? audience.contactIds
        : (isEdit ? existingContactIds || [] : []);
    const contactCount = effectiveContactIds.length;

    const rate = rateData?.rate ?? 5.5;
    const estimatedCostBrl = contactCount * COST_PER_MSG_USD * rate;
    const estimatedSeconds = Math.max(0, (contactCount - 1) * SPACING_SECONDS);

    const minScheduled = useMemo(() => toLocalInputValue(new Date(Date.now() + 48 * 3600_000).toISOString()), [open]);

    const insertVariable = (variable: string) => {
        const el = messageRef.current;
        const token = `<${variable}>`;
        if (!el) {
            setMessage((m) => m + token);
            return;
        }
        const start = el.selectionStart ?? message.length;
        const end = el.selectionEnd ?? message.length;
        const next = message.slice(0, start) + token + message.slice(end);
        setMessage(next);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    const toggleService = (svc: any) => {
        setSelectedServices((prev) => {
            const exists = prev.some((s) => s.id === svc.id);
            if (exists) return prev.filter((s) => s.id !== svc.id);
            return [...prev, { id: svc.id, name: svc.name, price: svc.price ?? null }];
        });
    };

    const preview = useMemo(() => {
        const svcNames = selectedServices.map((s) => s.name).join(", ") || "nossos serviços";
        const dateStr = scheduledAt
            ? new Date(scheduledAt).toLocaleDateString("pt-BR")
            : new Date().toLocaleDateString("pt-BR");
        return message
            .replace(/<\s*nome\s*>/gi, "Maria")
            .replace(/<\s*servi[çc]o\s*>/gi, svcNames)
            .replace(/<\s*data\s*>/gi, dateStr);
    }, [message, selectedServices, scheduledAt]);

    const stepValid = (): string | null => {
        if (step === 0) {
            if (!name.trim()) return "Informe o nome da campanha";
            if (!instanceId) return "Selecione a instância Meta";
            if (!scheduledAt) return "Informe a data do disparo";
            if (new Date(scheduledAt).getTime() < Date.now() + 48 * 3600_000 - 60_000) {
                return "O disparo precisa ser agendado com pelo menos 48h de antecedência (tempo de aprovação do template pela Meta)";
            }
            if (!validUntil) return "Informe a validade da campanha";
            if (new Date(validUntil) <= new Date(scheduledAt)) return "A validade precisa ser depois do disparo";
        }
        if (step === 1) {
            if (!sourceType) return "Selecione a origem dos dados";
            if (contactCount === 0 && audience.invalidRows.length === 0) return "A audiência precisa de pelo menos um contato";
        }
        if (step === 3) {
            if (!message.trim()) return "Escreva a mensagem inicial";
        }
        if (step === 4) {
            if (!objective.trim()) return "Descreva o objetivo da campanha";
        }
        return null;
    };

    const next = () => {
        const err = stepValid();
        if (err) {
            toast.error(err);
            return;
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const submit = async () => {
        const payload: any = {
            name: name.trim(),
            instance_id: instanceId,
            source_type: sourceType,
            source_config: audience.config,
            scheduled_at: new Date(scheduledAt).toISOString(),
            valid_until: new Date(validUntil).toISOString(),
            services: selectedServices,
            discount_pct: discountPct ? parseFloat(discountPct) : null,
            initial_message: message.trim(),
            objective: objective.trim(),
            ia_enabled: iaEnabled,
        };
        try {
            if (isEdit) {
                // Só envia audiência se o usuário mexeu nela
                if (audience.contactIds.length > 0) {
                    payload.contact_ids = audience.contactIds;
                    payload.invalid_rows = audience.invalidRows;
                }
                await updateCampaign.mutateAsync({ campaignId: campaign!.id, ...payload });
                toast.success("Campanha atualizada!");
            } else {
                payload.contact_ids = audience.contactIds;
                payload.invalid_rows = audience.invalidRows;
                const res = await createCampaign.mutateAsync(payload);
                if (res.template_error) {
                    toast.warning(`Campanha criada, mas o template falhou: ${res.template_error}. Edite a campanha para tentar novamente.`);
                } else {
                    toast.success("Campanha criada! O template foi enviado para aprovação da Meta.");
                }
            }
            onOpenChange(false);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const saving = createCampaign.isPending || updateCampaign.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary" />
                        {isEdit ? "Editar campanha" : "Nova campanha"}
                    </DialogTitle>
                </DialogHeader>

                {/* Stepper */}
                <div className="flex items-center gap-1 mb-2">
                    {STEPS.map((label, i) => (
                        <div key={label} className="flex-1 flex flex-col items-center gap-1">
                            <div
                                className={cn(
                                    "h-1.5 w-full rounded-full",
                                    i <= step ? "bg-primary" : "bg-muted"
                                )}
                            />
                            <span className={cn("text-[10px]", i === step ? "text-foreground font-medium" : "text-muted-foreground")}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Step 0 — Dados básicos */}
                {step === 0 && (
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Nome da campanha *</p>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Promoção Botox Julho" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Instância Meta (WhatsApp API) *</p>
                            <Select value={instanceId} onValueChange={setInstanceId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a instância" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(instances || []).map((i: any) => (
                                        <SelectItem key={i.id} value={i.id}>
                                            {i.name || i.instance_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {(instances || []).length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Nenhuma instância Meta conectada. Campanhas exigem WhatsApp API oficial (Meta).
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Data/hora do disparo *</p>
                                <Input
                                    type="datetime-local"
                                    value={scheduledAt}
                                    min={minScheduled}
                                    onChange={(e) => setScheduledAt(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Mínimo 48h (aprovação do template)</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Válida até *</p>
                                <Input
                                    type="datetime-local"
                                    value={validUntil}
                                    min={scheduledAt || minScheduled}
                                    onChange={(e) => setValidUntil(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Fim da promoção e do prompt da IA</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 1 — Audiência */}
                {step === 1 && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            {SOURCE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        if (opt.value !== sourceType) {
                                            setSourceType(opt.value);
                                            setAudience(EMPTY_AUDIENCE);
                                        }
                                    }}
                                    className={cn(
                                        "border rounded-xl p-3 flex flex-col items-center gap-1.5 text-xs transition-colors",
                                        sourceType === opt.value
                                            ? "border-primary bg-primary/5 text-foreground font-medium"
                                            : "border-border text-muted-foreground hover:bg-muted/40"
                                    )}
                                >
                                    <opt.icon className="w-4 h-4" />
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {sourceType === "csv" && <AudienceFileUpload fileType="csv" value={audience} onChange={setAudience} />}
                        {sourceType === "xml" && <AudienceFileUpload fileType="xml" value={audience} onChange={setAudience} />}
                        {sourceType === "crm" && <AudienceCrm value={audience} onChange={setAudience} />}
                        {sourceType === "tag" && <AudienceTag value={audience} onChange={setAudience} />}
                        {sourceType === "appointments" && <AudienceAppointments value={audience} onChange={setAudience} />}
                        {sourceType === "sales" && <AudienceSales value={audience} onChange={setAudience} />}

                        {isEdit && audience.contactIds.length === 0 && (existingContactIds?.length || 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Mantendo a audiência atual ({existingContactIds!.length} contatos). Refaça a seleção acima para substituir.
                            </p>
                        )}
                    </div>
                )}

                {/* Step 2 — Serviços + desconto */}
                {step === 2 && (
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-2">Serviços atrelados à campanha</p>
                            <div className="max-h-56 overflow-y-auto border rounded-xl divide-y">
                                {(services || []).length === 0 && (
                                    <p className="text-sm text-muted-foreground p-3">Nenhum serviço ativo cadastrado.</p>
                                )}
                                {(services || []).map((svc: any) => {
                                    const checked = selectedServices.some((s) => s.id === svc.id);
                                    return (
                                        <label
                                            key={svc.id}
                                            className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40"
                                        >
                                            <Checkbox checked={checked} onCheckedChange={() => toggleService(svc)} />
                                            <span className="text-sm flex-1">{svc.name}</span>
                                            {svc.price != null && (
                                                <span className="text-xs text-muted-foreground">{formatCurrency(Number(svc.price))}</span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Desconto da campanha (%) — opcional</p>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={discountPct}
                                onChange={(e) => setDiscountPct(e.target.value)}
                                placeholder="Ex.: 20"
                                className="w-32"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                A IA aplicará o desconto sobre o preço dos serviços selecionados.
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 3 — Mensagem */}
                {step === 3 && (
                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-muted-foreground">Mensagem inicial (vira template Meta) *</p>
                                <div className="flex gap-1">
                                    {["nome", "serviço", "data"].map((v) => (
                                        <Button
                                            key={v}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-6 px-2 text-[10px]"
                                            onClick={() => insertVariable(v)}
                                        >
                                            {`<${v}>`}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <Textarea
                                ref={messageRef}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={6}
                                placeholder={"Olá <nome>! Temos uma condição especial em <serviço> válida a partir de <data>..."}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Mensagem alterada após a criação exige novo template (nova aprovação da Meta).
                            </p>
                        </div>
                        {message.trim() && (
                            <div className="border rounded-xl p-3 bg-muted/30">
                                <p className="text-[10px] text-muted-foreground mb-1">Pré-visualização</p>
                                <p className="text-sm whitespace-pre-wrap">{preview}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4 — Objetivo + IA */}
                {step === 4 && (
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Objetivo da campanha *</p>
                            <Textarea
                                value={objective}
                                onChange={(e) => setObjective(e.target.value)}
                                rows={4}
                                placeholder="Ex.: Vender pacotes de botox com desconto para pacientes antigas, incentivando o agendamento ainda esta semana."
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Usado para gerar automaticamente o prompt de vendas da IA (prioridade máxima durante a validade).
                            </p>
                        </div>
                        <div className="flex items-center justify-between border rounded-xl p-3">
                            <div>
                                <p className="text-sm font-medium">IA atende as respostas</p>
                                <p className="text-xs text-muted-foreground">
                                    {iaEnabled
                                        ? "Contatos vão para \"Em Atendimento IA\" e a IA responde com o prompt da campanha"
                                        : "Contatos vão para \"Em Atendimento Humano\" para sua equipe responder"}
                                </p>
                            </div>
                            <Switch checked={iaEnabled} onCheckedChange={setIaEnabled} />
                        </div>
                    </div>
                )}

                {/* Step 5 — Revisão */}
                {step === 5 && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="border rounded-xl p-3 flex flex-col items-center gap-1">
                                <Users className="w-4 h-4 text-primary" />
                                <span className="text-lg font-semibold">{contactCount}</span>
                                <span className="text-[10px] text-muted-foreground text-center">contatos</span>
                            </div>
                            <div className="border rounded-xl p-3 flex flex-col items-center gap-1">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="text-lg font-semibold">{formatDuration(estimatedSeconds)}</span>
                                <span className="text-[10px] text-muted-foreground text-center">tempo de disparo (15s/msg)</span>
                            </div>
                            <div className="border rounded-xl p-3 flex flex-col items-center gap-1">
                                <DollarSign className="w-4 h-4 text-primary" />
                                <span className="text-lg font-semibold">{formatCurrency(estimatedCostBrl)}</span>
                                <span className="text-[10px] text-muted-foreground text-center">custo estimado*</span>
                            </div>
                        </div>
                        <div className="text-sm space-y-1.5 border rounded-xl p-3">
                            <p><span className="text-muted-foreground">Campanha:</span> <span className="font-medium">{name}</span></p>
                            <p><span className="text-muted-foreground">Disparo:</span> {scheduledAt ? new Date(scheduledAt).toLocaleString("pt-BR") : "—"}</p>
                            <p><span className="text-muted-foreground">Válida até:</span> {validUntil ? new Date(validUntil).toLocaleString("pt-BR") : "—"}</p>
                            <p>
                                <span className="text-muted-foreground">Serviços:</span>{" "}
                                {selectedServices.length > 0 ? selectedServices.map((s) => s.name).join(", ") : "nenhum"}
                                {discountPct && <Badge variant="secondary" className="ml-2">{discountPct}% off</Badge>}
                            </p>
                            <p><span className="text-muted-foreground">IA atende:</span> {iaEnabled ? "Sim" : "Não"}</p>
                            {audience.invalidRows.length > 0 && (
                                <p className="text-amber-600 text-xs">
                                    {audience.invalidRows.length} linhas com número inválido serão registradas como falha.
                                </p>
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            * Estimativa: US$ {COST_PER_MSG_USD.toFixed(4)}/mensagem (marketing Meta BR) × cotação{" "}
                            {rate.toFixed(2)}{rateData?.isFallback ? " (cotação padrão — API indisponível)" : ""}. Valor final pode variar.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Ao {isEdit ? "salvar" : "criar"}: template Meta enviado para aprovação, etiqueta "{name}" aplicada aos contatos
                            e prompt de vendas gerado pela IA.
                        </p>
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-between pt-2">
                    <Button
                        variant="outline"
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                        disabled={step === 0 || saving}
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button onClick={next}>
                            Avançar <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={saving}>
                            {saving ? (
                                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando...</>
                            ) : isEdit ? "Salvar alterações" : "Criar campanha"}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
