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
import { useCampaignInstances, isMetaInstance, useCampaignMutations, checkCampaignConflicts, Campaign, CampaignService } from "@/hooks/useCampaigns";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useMetaQuality } from "@/hooks/useMetaQuality";
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
const META_SPACING_SECONDS = 30;
const UAZAPI_SPACING_SECONDS = 38; // média do intervalo aleatório 30-45s
const MIN_LEAD_H = 1;

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
    /** Campanha disparada usada como base de reenvio — cria uma NOVA campanha
     *  pré-preenchida (datas de disparo/vencimento em branco). */
    resendFrom?: Campaign | null;
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

export function CampaignWizard({ open, onOpenChange, campaign, resendFrom }: CampaignWizardProps) {
    const isEdit = !!campaign;
    // Base de pré-preenchimento: campanha em edição OU campanha original do reenvio
    const baseCampaign = campaign || resendFrom || null;
    const isResend = !campaign && !!resendFrom;
    const { data: instances } = useCampaignInstances();
    const { data: ownerId } = useOwnerId();
    const { createCampaign, updateCampaign } = useCampaignMutations();
    const { data: rateData } = useUsdBrlRate();

    const [step, setStep] = useState(0);
    const [name, setName] = useState("");
    const [instanceId, setInstanceId] = useState("");
    const [scheduledAt, setScheduledAt] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [sourceType, setSourceType] = useState<SourceType | "">("");
    const [audience, setAudience] = useState<AudienceSelection>(EMPTY_AUDIENCE);
    // Query do builder de audiência em andamento (bloqueia o "Próximo")
    const [audienceLoading, setAudienceLoading] = useState(false);
    // Reenvio: reutiliza a audiência original até o usuário pedir para refazer
    const [keepResendAudience, setKeepResendAudience] = useState(false);
    const [campaignType, setCampaignType] = useState<"promotion" | "notification">("promotion");
    const [selectedServices, setSelectedServices] = useState<CampaignService[]>([]);
    const [discountPct, setDiscountPct] = useState<string>("");
    const [existingTemplateId, setExistingTemplateId] = useState("");
    const [varMapping, setVarMapping] = useState<Record<number, string>>({});
    const [message, setMessage] = useState("");
    const [objective, setObjective] = useState("");
    const [iaEnabled, setIaEnabled] = useState(true);
    const messageRef = useRef<HTMLTextAreaElement>(null);

    const selectedInstance = (instances || []).find((i: any) => i.id === instanceId);
    const isMeta = selectedInstance ? isMetaInstance(selectedInstance) : true;
    const minLeadHours = MIN_LEAD_H;

    // Limite diário da Meta (messaging_limit_tier) da instância selecionada
    const { data: metaQuality } = useMetaQuality();
    const selectedQuality = isMeta
        ? (metaQuality || []).find((q) => q.instance_id === instanceId)
        : undefined;
    const tierLimit = selectedQuality?.tier_limit ?? null;
    // Nome de exibição recusado pela Meta = TODO envio rejeitado (#131037)
    const sendBlocked = selectedQuality?.send_blocked === true;

    // Pré-preenche em edição / reseta em criação
    useEffect(() => {
        if (!open) return;
        if (baseCampaign) {
            setName(isResend ? `${baseCampaign.name} (reenvio)` : baseCampaign.name);
            setInstanceId(baseCampaign.instance_id || "");
            // Reenvio: datas em branco para o cliente definir
            setScheduledAt(isResend ? "" : toLocalInputValue(baseCampaign.scheduled_at));
            setValidUntil(isResend ? "" : toLocalInputValue(baseCampaign.valid_until));
            // Wizard nunca edita campanhas de recorrência nem de monitoramento
            // (ambas geradas fora daqui)
            setSourceType(
                baseCampaign.source_type === "recurrence" || baseCampaign.source_type === "monitoring"
                    ? ""
                    : baseCampaign.source_type
            );
            setAudience({ entries: [], invalidRows: [], config: baseCampaign.source_config || {} });
            setCampaignType(baseCampaign.campaign_type || "promotion");
            setSelectedServices(baseCampaign.services || []);
            setDiscountPct(baseCampaign.discount_pct != null ? String(baseCampaign.discount_pct) : "");
            setExistingTemplateId(baseCampaign.template_mode === "existing" ? baseCampaign.template_id || "" : "");
            setVarMapping({});
            setMessage(baseCampaign.template_mode === "none" ? baseCampaign.initial_message : "");
            setObjective(baseCampaign.objective);
            setIaEnabled(baseCampaign.ia_enabled);
            setKeepResendAudience(isResend);
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
            setExistingTemplateId("");
            setVarMapping({});
            setMessage("");
            setObjective("");
            setIaEnabled(true);
            setKeepResendAudience(false);
        }
        setAudienceLoading(false);
        setStep(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, campaign?.id, resendFrom?.id]);

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

    // Reenvio: carrega a audiência original com as vars do snapshot (raw_data)
    // como entries de CRIAÇÃO — o cliente pode substituir na etapa Audiência
    const { data: resendEntries, isLoading: resendLoading } = useQuery({
        queryKey: ["campaign-resend-entries", resendFrom?.id],
        queryFn: async (): Promise<AudienceSelection["entries"]> => {
            const { data } = await supabase
                .from("campaign_contacts" as any)
                .select("contact_id, raw_data")
                .eq("campaign_id", resendFrom!.id)
                .not("contact_id", "is", null);
            return ((data || []) as any[]).map((r) => ({
                contactId: r.contact_id,
                vars: r.raw_data || {},
            }));
        },
        enabled: isResend && !!resendFrom?.id && open,
    });

    useEffect(() => {
        if (!open || !isResend || !keepResendAudience || !resendEntries || resendEntries.length === 0) return;
        setAudience((a) => (a.entries.length > 0 ? a : { ...a, entries: resendEntries }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, isResend, keepResendAudience, resendEntries]);

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

    // Templates Meta aprovados para "usar template existente".
    // Aceita qualquer componente que não exija parâmetro dinâmico no envio:
    // BODY/FOOTER sempre; HEADER de texto fixo (sem {{n}}); botões QUICK_REPLY.
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
                    return comps.every((c: any) => {
                        const type = String(c?.type || "").toUpperCase();
                        if (["BODY", "FOOTER"].includes(type)) return true;
                        if (type === "HEADER") {
                            return String(c?.format || "TEXT").toUpperCase() === "TEXT"
                                && !/\{\{\s*\d+\s*\}\}/.test(String(c?.text || ""));
                        }
                        if (type === "BUTTONS") {
                            return (c?.buttons || []).every(
                                (b: any) => String(b?.type || "").toUpperCase() === "QUICK_REPLY"
                            );
                        }
                        return false;
                    });
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
        if (!baseCampaign || baseCampaign.template_mode !== "existing" || !selectedTemplate) return;
        if (Object.keys(varMapping).length > 0) return;
        const saved: string[] = baseCampaign?.variable_map || [];
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

    // Aviso: audiência maior que o limite diário do número na Meta
    const overTierLimit = tierLimit != null && contactCount > tierLimit;
    const overTierWarning = overTierLimit ? (
        <div className="flex items-start gap-2.5 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 rounded-xl p-3 animate-in fade-in duration-200">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
                <p className="font-semibold text-red-700 dark:text-red-300">
                    Audiência acima do limite diário do seu número ({contactCount.toLocaleString("pt-BR")} contatos
                    para um limite de {tierLimit!.toLocaleString("pt-BR")}/24h)
                </p>
                <p className="text-red-700/90 dark:text-red-300/90">
                    O risco de mensagens não entregues é <strong>extremamente alto</strong> e o número pode ser
                    penalizado ou banido pela Meta. Recomendamos dividir a audiência em disparos diários dentro do
                    limite. <strong>Não nos responsabilizamos por bloqueios e banimentos de números.</strong>
                </p>
            </div>
        </div>
    ) : null;

    // Aviso: instância com nome de exibição recusado — Meta rejeita TODO envio (#131037)
    const sendBlockedWarning = sendBlocked ? (
        <div className="flex items-start gap-2.5 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 rounded-xl p-3 animate-in fade-in duration-200">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
                <p className="font-semibold text-red-700 dark:text-red-300">
                    Este número está com envios bloqueados pela Meta — a campanha inteira será rejeitada
                </p>
                <p className="text-red-700/90 dark:text-red-300/90">
                    O nome de exibição do número foi recusado pela Meta (erro #131037). Nenhuma mensagem será
                    enviada até um novo nome ser aprovado no WhatsApp Manager. Corrija antes de agendar a campanha
                    ou selecione outra instância.
                </p>
            </div>
        </div>
    ) : null;

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
            const fileKeys: string[] = audience.config?.var_keys || baseCampaign?.source_config?.var_keys || [];
            for (const k of fileKeys) {
                if (k && !keys.includes(k) && !keys.map(slugVarKey).includes(k)) keys.push(k);
            }
        }
        return keys;
    }, [campaignType, sourceType, audience.config, baseCampaign?.source_config]);

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

    // Meta: sempre template existente já aprovado (modo "create" descontinuado)
    const useExistingTemplate = isMeta;

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
                return "O disparo precisa ser agendado com pelo menos 1h de antecedência";
            }
            if (!validUntil) return "Informe a validade da campanha";
            if (new Date(validUntil) <= new Date(scheduledAt)) return "A validade precisa ser depois do disparo";
        }
        if (step === 1) {
            if (isResend && keepResendAudience) {
                if (resendLoading) return "Aguarde — carregando a audiência da campanha original";
                if (contactCount === 0) return "A campanha original não tem contatos para reutilizar — refaça a seleção da audiência";
                return null;
            }
            if (!sourceType) return "Selecione a origem dos dados";
            if (audienceLoading) return "Aguarde — carregando a audiência selecionada";
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

    // ── Aviso: contatos que já participaram de outra campanha nos últimos 7 dias ──
    // Mapeado pela etiqueta da campanha (tags.name = nome da campanha, contact_tags
    // criado no envio pelo campaign-dispatch).
    interface RecentCampaignWarning {
        contactIds: string[];
        campaigns: { name: string; count: number; daysAgo: number }[];
    }
    const [recentWarning, setRecentWarning] = useState<RecentCampaignWarning | null>(null);
    const [checkingRecent, setCheckingRecent] = useState(false);

    const checkRecentParticipation = async (
        entries: AudienceSelection["entries"]
    ): Promise<RecentCampaignWarning | null> => {
        const contactIds = [...new Set(entries.map((e) => e.contactId).filter(Boolean))] as string[];
        if (contactIds.length === 0) return null;

        // Nomes de campanhas existentes (exclui a própria em edição) = etiquetas de campanha
        const { data: pastCampaigns } = await supabase
            .from("campaigns" as any)
            .select("name");
        const campaignNames = [...new Set(
            ((pastCampaigns || []) as any[])
                .map((c) => c.name)
                .filter((n) => n && n !== campaign?.name && n !== name.trim())
        )];
        if (campaignNames.length === 0) return null;

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const rows: { contact_id: string; created_at: string; tags: { name: string } }[] = [];
        for (let i = 0; i < contactIds.length; i += 200) {
            const chunk = contactIds.slice(i, i + 200);
            const { data } = await supabase
                .from("contact_tags" as any)
                .select("contact_id, created_at, tags!inner(name)")
                .in("contact_id", chunk)
                .gte("created_at", since)
                .in("tags.name", campaignNames);
            rows.push(...((data || []) as any[]));
        }
        if (rows.length === 0) return null;

        const flagged = new Set<string>();
        const byCampaign = new Map<string, { contacts: Set<string>; newest: number }>();
        for (const r of rows) {
            flagged.add(r.contact_id);
            const key = r.tags.name;
            const cur = byCampaign.get(key) || { contacts: new Set<string>(), newest: 0 };
            cur.contacts.add(r.contact_id);
            cur.newest = Math.max(cur.newest, new Date(r.created_at).getTime());
            byCampaign.set(key, cur);
        }
        return {
            contactIds: [...flagged],
            campaigns: [...byCampaign.entries()]
                .map(([n, v]) => ({
                    name: n,
                    count: v.contacts.size,
                    daysAgo: Math.floor((Date.now() - v.newest) / 86_400_000),
                }))
                .sort((a, b) => b.count - a.count),
        };
    };

    // ── Aviso: contatos já ativos em outra campanha da mesma instância ──
    // (takeover T-1h: 1h antes do disparo eles são encerrados da campanha anterior)
    const [conflictCount, setConflictCount] = useState<number | null>(null);

    const submit = async () => {
        const entriesToSend = audience.entries;
        if ((!isEdit || entriesToSend.length > 0) && instanceId && ownerId) {
            const contactIds = [...new Set(entriesToSend.map((e) => e.contactId).filter(Boolean))] as string[];
            if (contactIds.length > 0) {
                setCheckingRecent(true);
                try {
                    const conflicts = await checkCampaignConflicts(
                        ownerId, instanceId, contactIds, campaign?.id || resendFrom?.id
                    );
                    if (conflicts.length > 0) {
                        setConflictCount(conflicts.length);
                        return;
                    }
                } finally {
                    setCheckingRecent(false);
                }
            }
        }
        await submitAfterConflictCheck();
    };

    const submitAfterConflictCheck = async () => {
        const entriesToSend = audience.entries;
        if (!isEdit || entriesToSend.length > 0) {
            setCheckingRecent(true);
            try {
                const warning = await checkRecentParticipation(entriesToSend);
                if (warning) {
                    setRecentWarning(warning);
                    return;
                }
            } catch (e) {
                console.warn("Falha ao checar campanhas recentes:", e);
            } finally {
                setCheckingRecent(false);
            }
        }
        await doSubmit(entriesToSend);
    };

    const continueAnyway = async () => {
        setRecentWarning(null);
        await doSubmit(audience.entries);
    };

    const removeFlaggedAndContinue = async () => {
        const flagged = new Set(recentWarning?.contactIds || []);
        setRecentWarning(null);
        const remaining = audience.entries.filter((e) => !e.contactId || !flagged.has(e.contactId));
        if (remaining.length === 0) {
            toast.error("Todos os contatos da audiência participaram de campanhas nos últimos 7 dias.");
            return;
        }
        setAudience((a) => ({ ...a, entries: remaining }));
        await doSubmit(remaining);
    };

    const doSubmit = async (entriesToSend: AudienceSelection["entries"]) => {
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
            template_mode: !isMeta ? "none" : "existing",
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
                if (entriesToSend.length > 0) {
                    payload.entries = entriesToSend.map((e) => ({ contact_id: e.contactId, vars: e.vars }));
                    payload.invalid_rows = audience.invalidRows;
                }
                await updateCampaign.mutateAsync({ campaignId: campaign!.id, ...payload });
                toast.success("Campanha atualizada!");
            } else {
                payload.entries = entriesToSend.map((e) => ({ contact_id: e.contactId, vars: e.vars }));
                payload.invalid_rows = audience.invalidRows;
                // Reenvio: a campanha mãe é encerrada pelo campaign-manage (rotina de expiração)
                if (isResend && resendFrom?.id) payload.resend_from_campaign_id = resendFrom.id;
                await createCampaign.mutateAsync(payload);
                toast.success("Campanha criada!");
            }
            onOpenChange(false);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const saving = createCampaign.isPending || updateCampaign.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary" />
                        {isEdit ? "Editar campanha" : isResend ? "Reenvio de campanha" : "Nova campanha"}
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
                            {sendBlocked && <div className="mt-2">{sendBlockedWarning}</div>}
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
                                    Mínimo 1h de antecedência
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
                {step === 1 && isResend && keepResendAudience && (
                    <div className="space-y-3">
                        <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 space-y-2">
                            <p className="text-sm font-medium">
                                Reutilizando a audiência da campanha original
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {resendLoading
                                    ? "Carregando os contatos da campanha original..."
                                    : `${contactCount.toLocaleString("pt-BR")} contatos serão incluídos neste reenvio.`}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setKeepResendAudience(false);
                                    setAudience(EMPTY_AUDIENCE);
                                    setSourceType("");
                                }}
                            >
                                Refazer seleção de audiência
                            </Button>
                        </div>
                        {sendBlockedWarning}
                        {overTierWarning}
                    </div>
                )}
                {step === 1 && !(isResend && keepResendAudience) && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                        {sourceType === "crm" && <AudienceCrm value={audience} onChange={setAudience} onLoadingChange={setAudienceLoading} />}
                        {sourceType === "tag" && <AudienceTag value={audience} onChange={setAudience} onLoadingChange={setAudienceLoading} />}
                        {sourceType === "appointments" && <AudienceAppointments value={audience} onChange={setAudience} onLoadingChange={setAudienceLoading} />}
                        {sourceType === "sales" && <AudienceSales value={audience} onChange={setAudience} onLoadingChange={setAudienceLoading} />}

                        {isEdit && audience.entries.length === 0 && (existingContactIds?.length || 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Mantendo a audiência atual ({existingContactIds!.length} contatos). Refaça a seleção acima para substituir.
                            </p>
                        )}

                        {sendBlockedWarning}
                        {overTierWarning}
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
                            </p>
                        )}
                    </div>
                )}

                {/* Step 3 — Mensagem */}
                {step === 3 && (
                    <div className="space-y-3">
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
                                            Nenhum template aprovado (somente texto) nesta instância. Crie e aguarde a
                                            aprovação em{" "}
                                            <a href="/whatsapp-connection?tab=templates" className="underline font-medium">
                                                Conexões &gt; Templates
                                            </a>{" "}
                                            antes de criar a campanha.
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
                                        Mensagem inicial *
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
                                    tempo de disparo ({isMeta ? "30s/msg" : "30-45s/msg"})
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
                        {sendBlockedWarning}
                        {overTierWarning}
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
                            {isMeta ? "template aprovado reutilizado, " : ""}
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
                        <Button onClick={submit} disabled={saving || checkingRecent}>
                            {checkingRecent ? (
                                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Verificando...</>
                            ) : saving ? (
                                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando...</>
                            ) : isEdit ? "Salvar alterações" : "Criar campanha"}
                        </Button>
                    )}
                </div>

                {/* Aviso: contatos ativos em outra campanha (takeover T-1h) */}
                <Dialog open={conflictCount !== null} onOpenChange={(o) => !o && setConflictCount(null)}>
                    <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                Contatos em campanha ativa
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 text-sm">
                            <p>
                                <strong>{conflictCount}</strong>{" "}
                                {conflictCount === 1 ? "cliente desta campanha está atribuído" : "clientes desta campanha estão atribuídos"}{" "}
                                a outra campanha ativa desta instância.
                            </p>
                            <p>
                                1 hora antes do início desta campanha, eles serão automaticamente
                                encerrados da campanha anterior. Deseja continuar?
                            </p>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={() => setConflictCount(null)}>
                                Cancelar
                            </Button>
                            <Button onClick={async () => { setConflictCount(null); await submitAfterConflictCheck(); }}>
                                Continuar
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Aviso: contatos em campanhas dos últimos 7 dias */}
                <Dialog open={!!recentWarning} onOpenChange={(o) => !o && setRecentWarning(null)}>
                    <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                Contatos em campanhas recentes
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 text-sm">
                            {(recentWarning?.campaigns || []).map((c) => (
                                <p key={c.name}>
                                    Foi identificado que <strong>{c.count}</strong>{" "}
                                    {c.count === 1 ? "cliente participou" : "clientes participaram"} da campanha{" "}
                                    <strong>{c.name}</strong>{" "}
                                    {c.daysAgo === 0 ? "hoje" : `há ${c.daysAgo} dia${c.daysAgo > 1 ? "s" : ""}`}.
                                </p>
                            ))}
                            <p>
                                Enviar uma nova campanha a eles pode acarretar problemas para seu score com a
                                Meta. Deseja continuar?
                            </p>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={() => setRecentWarning(null)}>
                                Cancelar
                            </Button>
                            <Button variant="outline" onClick={removeFlaggedAndContinue}>
                                Excluir clientes ({recentWarning?.contactIds.length ?? 0})
                            </Button>
                            <Button onClick={continueAnyway}>Continuar</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
