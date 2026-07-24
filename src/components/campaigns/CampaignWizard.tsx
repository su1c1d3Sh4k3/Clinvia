import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ChevronLeft, ChevronRight, Loader2, Megaphone, Clock, DollarSign, Users,
    FileSpreadsheet, FileCode2, Kanban, Tag as TagIcon, CalendarDays, ShoppingCart,
    AlertTriangle, BadgePercent, Bell,
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
import { useCampaignInstances, isMetaInstance, useCampaignMutations, Campaign, CampaignService } from "@/hooks/useCampaigns";
import { useUsdBrlRate } from "@/hooks/useUsdBrlRate";
import {
    AudienceSelection, EMPTY_AUDIENCE, SOURCE_VAR_KEYS, BASE_VAR_KEYS, slugVarKey,
} from "./audienceTypes";
import { AudienceFileUpload } from "./audience/AudienceFileUpload";
import { AudienceCrm } from "./audience/AudienceCrm";
import { AudienceTag } from "./audience/AudienceTag";
import { AudienceAppointments } from "./audience/AudienceAppointments";
import { AudienceSales } from "./audience/AudienceSales";

const COST_PER_MSG_USD = 0.0625;
const META_SPACING_SECONDS = 15;
const UAZAPI_SPACING_SECONDS = 38; // média do intervalo aleatório 30-45s
const META_MIN_LEAD_H = 24;
const UAZAPI_MIN_LEAD_H = 2;

const SOURCE_OPTIONS = [
    { value: "csv", label: "Arquivo CSV/Excel", icon: FileSpreadsheet },
    { value: "xml", label: "Arquivo XML", icon: FileCode2 },
    { value: "crm", label: "Etapa do CRM", icon: Kanban },
    { value: "tag", label: "Etiqueta", icon: TagIcon },
    { value: "appointments", label: "Agendamentos", icon: CalendarDays },
    { value: "sales", label: "Vendas", icon: ShoppingCart },
] as const;

type SourceType = (typeof SOURCE_OPTIONS)[number]["value"];

const STEPS = ["Dados", "Audiência", "Tipo", "Mensagem", "Objetivo", "Revisão"];

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
    const { data: instances } = useCampaignInstances();
    const { createCampaign, updateCampaign } = useCampaignMutations();
    const { data: rateData } = useUsdBrlRate();

    const [step, setStep] = useState(0);
    const [name, setName] = useState("");
    const [instanceId, setInstanceId] = useState("");
    const [scheduledAt, setScheduledAt] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [sourceType, setSourceType] = useState<SourceType | "">("");
    const [audience, setAudience] = useState<AudienceSelection>(EMPTY_AUDIENCE);
    const [campaignType, setCampaignType] = useState<"promotion" | "notification">("promotion");
    const [selectedServices, setSelectedServices] = useState<CampaignService[]>([]);
    const [discountPct, setDiscountPct] = useState<string>("");
    const [templateChoice, setTemplateChoice] = useState<"create" | "existing">("create");
    const [existingTemplateId, setExistingTemplateId] = useState("");
    const [varMapping, setVarMapping] = useState<Record<number, string>>({});
    const [message, setMessage] = useState("");
    const [objective, setObjective] = useState("");
    const [iaEnabled, setIaEnabled] = useState(true);
    const messageRef = useRef<HTMLTextAreaElement>(null);

    const selectedInstance = (instances || []).find((i: any) => i.id === instanceId);
    const isMeta = selectedInstance ? isMetaInstance(selectedInstance) : true;
    const minLeadHours = isMeta ? META_MIN_LEAD_H : UAZAPI_MIN_LEAD_H;

    // Pré-preenche em edição / reseta em criação
    useEffect(() => {
        if (!open) return;
        if (campaign) {
            setName(campaign.name);
            setInstanceId(campaign.instance_id || "");
            setScheduledAt(toLocalInputValue(campaign.scheduled_at));
            setValidUntil(toLocalInputValue(campaign.valid_until));
            setSourceType(campaign.source_type);
            setAudience({ entries: [], invalidRows: [], config: campaign.source_config || {} });
            setCampaignType(campaign.campaign_type || "promotion");
            setSelectedServices(campaign.services || []);
            setDiscountPct(campaign.discount_pct != null ? String(campaign.discount_pct) : "");
            setTemplateChoice(campaign.template_mode === "existing" ? "existing" : "create");
            setExistingTemplateId(campaign.template_mode === "existing" ? campaign.template_id || "" : "");
            setVarMapping({});
            setMessage(campaign.template_mode === "existing" ? "" : campaign.initial_message);
            setObjective(campaign.objective);
            setIaEnabled(campaign.ia_enabled);
        } else {
            setName("");
            setInstanceId("");
            setScheduledAt("");
            setValidUntil("");
            setSourceType("");
            setAudience(EMPTY_AUDIENCE);
            setCampaignType("promotion");
            setSelectedServices([]);
            setDiscountPct("");
            setTemplateChoice("create");
            setExistingTemplateId("");
            setVarMapping({});
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

    // Templates Meta aprovados (somente BODY/FOOTER) para "usar template existente"
    const { data: approvedTemplates } = useQuery({
        queryKey: ["campaign-approved-templates", instanceId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("message_templates" as any)
                .select("id, name, language, status, components")
                .eq("instance_id", instanceId)
                .eq("status", "APPROVED")
                .order("name");
            if (error) throw error;
            return ((data || []) as any[])
                .filter((t) => {
                    const comps = Array.isArray(t.components) ? t.components : [];
                    return comps.every((c: any) =>
                        ["BODY", "FOOTER"].includes(String(c?.type || "").toUpperCase())
                    );
                })
                .map((t) => ({
                    ...t,
                    body: (Array.isArray(t.components) ? t.components : []).find(
                        (c: any) => String(c?.type || "").toUpperCase() === "BODY"
                    )?.text || "",
                }));
        },
        enabled: open && !!instanceId && isMeta,
    });

    const selectedTemplate = (approvedTemplates || []).find((t: any) => t.id === existingTemplateId);

    const templateVarNums = useMemo(() => {
        const nums = new Set<number>();
        const re = /\{\{(\d+)\}\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(selectedTemplate?.body || ""))) nums.add(Number(m[1]));
        return [...nums].sort((a, b) => a - b);
    }, [selectedTemplate?.body]);

    // Em edição de campanha com template existente, pré-preenche o mapeamento salvo
    useEffect(() => {
        if (!isEdit || campaign?.template_mode !== "existing" || !selectedTemplate) return;
        if (Object.keys(varMapping).length > 0) return;
        const saved: string[] = campaign?.variable_map || [];
        if (saved.length === 0) return;
        const next: Record<number, string> = {};
        templateVarNums.forEach((n, idx) => {
            if (saved[idx]) next[n] = saved[idx];
        });
        setVarMapping(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTemplate?.id, templateVarNums.join(",")]);

    const effectiveEntries = audience.entries.length > 0
        ? audience.entries
        : (isEdit ? (existingContactIds || []).map((id) => ({ contactId: id, vars: {} })) : []);
    const contactCount = effectiveEntries.length;

    const rate = rateData?.rate ?? 5.5;
    const estimatedCostBrl = isMeta ? contactCount * COST_PER_MSG_USD * rate : 0;
    const spacingSeconds = isMeta ? META_SPACING_SECONDS : UAZAPI_SPACING_SECONDS;
    const estimatedSeconds = Math.max(0, (contactCount - 1) * spacingSeconds);

    const minScheduled = useMemo(
        () => toLocalInputValue(new Date(Date.now() + minLeadHours * 3600_000).toISOString()),
        [open, minLeadHours]
    );

    // Variáveis disponíveis (exibição) — base + tipo + fonte de dados
    const availableVars = useMemo(() => {
        const keys: string[] = [...BASE_VAR_KEYS];
        if (campaignType === "promotion") keys.push("serviço", "data");
        if (sourceType && SOURCE_VAR_KEYS[sourceType]) {
            for (const k of SOURCE_VAR_KEYS[sourceType]) if (!keys.includes(k)) keys.push(k);
        }
        if (sourceType === "csv" || sourceType === "xml") {
            const fileKeys: string[] = audience.config?.var_keys || campaign?.source_config?.var_keys || [];
            for (const k of fileKeys) {
                if (k && !keys.includes(k) && !keys.map(slugVarKey).includes(k)) keys.push(k);
            }
        }
        return keys;
    }, [campaignType, sourceType, audience.config, campaign?.source_config]);

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

    const useExistingTemplate = isMeta && templateChoice === "existing";

    // Mensagem derivada do template existente ({{n}} → <variável mapeada>)
    const existingInitialMessage = useMemo(() => {
        if (!useExistingTemplate || !selectedTemplate) return "";
        return String(selectedTemplate.body).replace(/\{\{(\d+)\}\}/g, (_m, n) => {
            const key = varMapping[Number(n)];
            return key ? `<${key}>` : `{{${n}}}`;
        });
    }, [useExistingTemplate, selectedTemplate, varMapping]);

    const effectiveMessage = useExistingTemplate ? existingInitialMessage : message;

    const preview = useMemo(() => {
        const svcNames = selectedServices.map((s) => s.name).join(", ") || "nossos serviços";
        const dateStr = scheduledAt
            ? new Date(scheduledAt).toLocaleDateString("pt-BR")
            : new Date().toLocaleDateString("pt-BR");
        const sample = audience.entries[0]?.vars || {};
        return effectiveMessage.replace(/<\s*([^<>]+?)\s*>/g, (m, raw: string) => {
            const key = slugVarKey(raw);
            if (sample[key]) return sample[key];
            if (key === "nome") return "Maria";
            if (key === "telefone") return "(11) 91234-5678";
            if (key === "servico") return svcNames;
            if (key === "data") return dateStr;
            return m;
        });
    }, [effectiveMessage, selectedServices, scheduledAt, audience.entries]);

    const stepValid = (): string | null => {
        if (step === 0) {
            if (!name.trim()) return "Informe o nome da campanha";
            if (!instanceId) return "Selecione a instância de disparo";
            if (!scheduledAt) return "Informe a data do disparo";
            if (new Date(scheduledAt).getTime() < Date.now() + minLeadHours * 3600_000 - 60_000) {
                return isMeta
                    ? "Instância Meta: o disparo precisa ser agendado com pelo menos 24h de antecedência (tempo de aprovação do template)"
                    : "O disparo precisa ser agendado com pelo menos 2h de antecedência";
            }
            if (!validUntil) return "Informe a validade da campanha";
            if (new Date(validUntil) <= new Date(scheduledAt)) return "A validade precisa ser depois do disparo";
        }
        if (step === 1) {
            if (!sourceType) return "Selecione a origem dos dados";
            if (contactCount === 0 && audience.invalidRows.length === 0) return "A audiência precisa de pelo menos um contato";
        }
        if (step === 3) {
            if (useExistingTemplate) {
                if (!selectedTemplate) return "Selecione o template aprovado";
                const missing = templateVarNums.filter((n) => !varMapping[n]);
                if (missing.length > 0) {
                    return `Mapeie a variável {{${missing[0]}}} do template`;
                }
            } else if (!message.trim()) {
                return "Escreva a mensagem inicial";
            }
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
            campaign_type: campaignType,
            services: campaignType === "promotion" ? selectedServices : [],
            discount_pct: campaignType === "promotion" && discountPct ? parseFloat(discountPct) : null,
            initial_message: effectiveMessage.trim(),
            objective: objective.trim(),
            ia_enabled: iaEnabled,
            template_mode: !isMeta ? "none" : templateChoice,
        };
        if (useExistingTemplate && selectedTemplate) {
            payload.existing_template = {
                id: selectedTemplate.id,
                name: selectedTemplate.name,
                language: selectedTemplate.language || "pt_BR",
            };
            payload.variable_map = templateVarNums.map((n) => varMapping[n]);
        }
        try {
            if (isEdit) {
                // Só envia audiência se o usuário mexeu nela
                if (audience.entries.length > 0) {
                    payload.entries = audience.entries.map((e) => ({ contact_id: e.contactId, vars: e.vars }));
                    payload.invalid_rows = audience.invalidRows;
                }
                await updateCampaign.mutateAsync({ campaignId: campaign!.id, ...payload });
                toast.success("Campanha atualizada!");
            } else {
                payload.entries = audience.entries.map((e) => ({ contact_id: e.contactId, vars: e.vars }));
                payload.invalid_rows = audience.invalidRows;
                const res = await createCampaign.mutateAsync(payload);
                if (res.template_error) {
                    toast.warning(`Campanha criada, mas o template falhou: ${res.template_error}. Edite a campanha para tentar novamente.`);
                } else if (isMeta && templateChoice === "create") {
                    toast.success("Campanha criada! O template foi enviado para aprovação da Meta.");
                } else {
                    toast.success("Campanha criada!");
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
                            <p className="text-xs text-muted-foreground mb-1">Instância de disparo *</p>
                            <Select value={instanceId} onValueChange={setInstanceId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a instância" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(instances || []).map((i: any) => (
                                        <SelectItem key={i.id} value={i.id}>
                                            <span className="flex items-center gap-2">
                                                {i.name || i.instance_name}
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                    {isMetaInstance(i) ? "API oficial (Meta)" : "API não oficial"}
                                                </Badge>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {(instances || []).length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Nenhuma instância de WhatsApp conectada.
                                </p>
                            )}
                            {selectedInstance && !isMeta && (
                                <div className="mt-2 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 rounded-lg p-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        Instância de API não oficial: não nos responsabilizamos por bloqueios e
                                        banimentos de disparos realizados pela API não oficial.
                                    </p>
                                </div>
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
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    {isMeta ? "Mínimo 24h (aprovação do template Meta)" : "Mínimo 2h (API não oficial, sem template)"}
                                </p>
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

                        {isEdit && audience.entries.length === 0 && (existingContactIds?.length || 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Mantendo a audiência atual ({existingContactIds!.length} contatos). Refaça a seleção acima para substituir.
                            </p>
                        )}
                    </div>
                )}

                {/* Step 2 — Tipo de campanha */}
                {step === 2 && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                { value: "promotion", label: "Promoção", desc: "Divulga serviços com condição especial", icon: BadgePercent },
                                { value: "notification", label: "Notificação", desc: "Aviso/lembrete sem oferta comercial", icon: Bell },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setCampaignType(opt.value)}
                                    className={cn(
                                        "border rounded-xl p-3 flex flex-col items-center gap-1.5 text-xs transition-colors",
                                        campaignType === opt.value
                                            ? "border-primary bg-primary/5 text-foreground font-medium"
                                            : "border-border text-muted-foreground hover:bg-muted/40"
                                    )}
                                >
                                    <opt.icon className="w-4 h-4" />
                                    <span className="text-sm">{opt.label}</span>
                                    <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
                                </button>
                            ))}
                        </div>

                        {campaignType === "promotion" && (
                            <>
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
                            </>
                        )}
                        {campaignType === "notification" && (
                            <p className="text-xs text-muted-foreground border rounded-xl p-3">
                                Campanha de notificação: sem serviços nem desconto.
                                {isMeta && " O template Meta será criado na categoria UTILITY (aprovação mais rápida e custo menor)."}
                            </p>
                        )}
                    </div>
                )}

                {/* Step 3 — Mensagem */}
                {step === 3 && (
                    <div className="space-y-3">
                        {isMeta && (
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { value: "create", label: "Criar novo template" },
                                    { value: "existing", label: "Usar template existente" },
                                ] as const).map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setTemplateChoice(opt.value)}
                                        className={cn(
                                            "border rounded-xl p-2.5 text-xs transition-colors",
                                            templateChoice === opt.value
                                                ? "border-primary bg-primary/5 text-foreground font-medium"
                                                : "border-border text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {useExistingTemplate ? (
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Template aprovado *</p>
                                    <Select value={existingTemplateId} onValueChange={(v) => { setExistingTemplateId(v); setVarMapping({}); }}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o template" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(approvedTemplates || []).map((t: any) => (
                                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {(approvedTemplates || []).length === 0 && (
                                        <p className="text-xs text-amber-600 mt-1">
                                            Nenhum template aprovado (somente texto) nesta instância.
                                        </p>
                                    )}
                                </div>
                                {selectedTemplate && (
                                    <>
                                        <div className="border rounded-xl p-3 bg-muted/30">
                                            <p className="text-[10px] text-muted-foreground mb-1">Corpo do template</p>
                                            <p className="text-sm whitespace-pre-wrap">{selectedTemplate.body}</p>
                                        </div>
                                        {templateVarNums.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">Mapeie cada variável do template:</p>
                                                {templateVarNums.map((n) => (
                                                    <div key={n} className="flex items-center gap-2">
                                                        <Badge variant="outline" className="shrink-0 font-mono">{`{{${n}}}`}</Badge>
                                                        <Select
                                                            value={varMapping[n] || ""}
                                                            onValueChange={(v) => setVarMapping((prev) => ({ ...prev, [n]: v }))}
                                                        >
                                                            <SelectTrigger className="h-8">
                                                                <SelectValue placeholder="Escolha o dado" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {availableVars.map((k) => (
                                                                    <SelectItem key={k} value={slugVarKey(k)}>{k}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-1 gap-2">
                                    <p className="text-xs text-muted-foreground shrink-0">
                                        {isMeta ? "Mensagem inicial (vira template Meta) *" : "Mensagem inicial *"}
                                    </p>
                                    <div className="flex gap-1 flex-wrap justify-end">
                                        {availableVars.map((v) => (
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
                                    placeholder={"Olá <nome>! Temos uma condição especial válida até..."}
                                />
                                {isMeta && (
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                        Mensagem alterada após a criação exige novo template (nova aprovação da Meta).
                                    </p>
                                )}
                            </div>
                        )}

                        {effectiveMessage.trim() && (
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
                                <span className="text-[10px] text-muted-foreground text-center">mensagens</span>
                            </div>
                            <div className="border rounded-xl p-3 flex flex-col items-center gap-1">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="text-lg font-semibold">{formatDuration(estimatedSeconds)}</span>
                                <span className="text-[10px] text-muted-foreground text-center">
                                    tempo de disparo ({isMeta ? "15s/msg" : "30-45s/msg"})
                                </span>
                            </div>
                            <div className="border rounded-xl p-3 flex flex-col items-center gap-1">
                                <DollarSign className="w-4 h-4 text-primary" />
                                <span className="text-lg font-semibold">{formatCurrency(estimatedCostBrl)}</span>
                                <span className="text-[10px] text-muted-foreground text-center">
                                    {isMeta ? "custo estimado*" : "sem custo por mensagem"}
                                </span>
                            </div>
                        </div>
                        <div className="text-sm space-y-1.5 border rounded-xl p-3">
                            <p><span className="text-muted-foreground">Campanha:</span> <span className="font-medium">{name}</span></p>
                            <p>
                                <span className="text-muted-foreground">Tipo:</span>{" "}
                                {campaignType === "promotion" ? "Promoção" : "Notificação"}
                                <span className="text-muted-foreground ml-3">Instância:</span>{" "}
                                {selectedInstance ? (isMeta ? "API oficial (Meta)" : "API não oficial") : "—"}
                            </p>
                            <p><span className="text-muted-foreground">Disparo:</span> {scheduledAt ? new Date(scheduledAt).toLocaleString("pt-BR") : "—"}</p>
                            <p><span className="text-muted-foreground">Válida até:</span> {validUntil ? new Date(validUntil).toLocaleString("pt-BR") : "—"}</p>
                            {campaignType === "promotion" && (
                                <p>
                                    <span className="text-muted-foreground">Serviços:</span>{" "}
                                    {selectedServices.length > 0 ? selectedServices.map((s) => s.name).join(", ") : "nenhum"}
                                    {discountPct && <Badge variant="secondary" className="ml-2">{discountPct}% off</Badge>}
                                </p>
                            )}
                            {useExistingTemplate && selectedTemplate && (
                                <p><span className="text-muted-foreground">Template:</span> {selectedTemplate.name} (já aprovado)</p>
                            )}
                            <p><span className="text-muted-foreground">IA atende:</span> {iaEnabled ? "Sim" : "Não"}</p>
                            {audience.invalidRows.length > 0 && (
                                <p className="text-amber-600 text-xs">
                                    {audience.invalidRows.length} linhas com número inválido serão registradas como falha.
                                </p>
                            )}
                        </div>
                        {!isMeta && (
                            <p className="text-[10px] text-amber-600">
                                API não oficial: não nos responsabilizamos por bloqueios e banimentos de disparos
                                realizados pela API não oficial.
                            </p>
                        )}
                        {isMeta && (
                            <p className="text-[10px] text-muted-foreground">
                                * Estimativa: US$ {COST_PER_MSG_USD.toFixed(4)}/mensagem (marketing Meta BR) × cotação{" "}
                                {rate.toFixed(2)}{rateData?.isFallback ? " (cotação padrão — API indisponível)" : ""}. Valor final pode variar.
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Ao {isEdit ? "salvar" : "criar"}:{" "}
                            {isMeta
                                ? templateChoice === "existing"
                                    ? "template aprovado reutilizado, "
                                    : "template Meta enviado para aprovação, "
                                : ""}
                            etiqueta "{name}" aplicada aos contatos e prompt de vendas gerado pela IA.
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
