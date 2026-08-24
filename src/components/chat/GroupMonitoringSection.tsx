import { useMemo, useRef, useState } from "react";
import { Radar, ChevronUp, Users, CalendarClock, Tag as TagIcon, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
    useActiveGroupMonitoring, useGroupMonitoringMutations, useMonitoringLeadCount,
    type MonitoringService,
} from "@/hooks/useGroupMonitoring";

interface GroupMonitoringSectionProps {
    groupId: string;
    open: boolean;
    onToggle: () => void;
}

const MESSAGE_VARIABLES = [
    { key: "{{nome_cliente}}", label: "Nome do cliente" },
    { key: "{{telefone}}", label: "Telefone" },
    { key: "{{servico}}", label: "Serviço" },
];

interface ServiceRow {
    id: string;
    name: string;
    price: number | null;
    service_name_id: string | null;
    service_name: { id: string; name: string } | null;
}

/**
 * Seção "Monitoramento" do menu lateral do inbox — só aparece em conversas de
 * GRUPO (UAZAPI). Admin/supervisor criam e encerram; atendentes só visualizam.
 */
export const GroupMonitoringSection = ({ groupId, open, onToggle }: GroupMonitoringSectionProps) => {
    const { data: role } = useUserRole();
    const canManage = role === "admin" || role === "supervisor";

    const { data: monitoring, isLoading } = useActiveGroupMonitoring(groupId);
    const { data: leadCount } = useMonitoringLeadCount(monitoring?.id);
    const { createMonitoring, endMonitoring } = useGroupMonitoringMutations(groupId);

    // ── Form state ──
    const [term, setTerm] = useState("");
    const [matchMode, setMatchMode] = useState<"contains" | "equals">("contains");
    const [message, setMessage] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [buttonsEnabled, setButtonsEnabled] = useState(false);
    const [replyButtons, setReplyButtons] = useState<string[]>(["", "", ""]);
    const [iaEnabled, setIaEnabled] = useState(false);
    const [iaFunction, setIaFunction] = useState<"agendamento" | "qualificacao">("agendamento");
    const [objective, setObjective] = useState("");
    const [selectedServices, setSelectedServices] = useState<MonitoringService[]>([]);
    const [discountPct, setDiscountPct] = useState("");
    const [confirmEnd, setConfirmEnd] = useState(false);
    const messageRef = useRef<HTMLTextAreaElement | null>(null);

    // ── Modal "Adicionar serviço" ──
    const [svcDialogOpen, setSvcDialogOpen] = useState(false);
    const [svcGroupKey, setSvcGroupKey] = useState<string | null>(null);
    const [svcFullService, setSvcFullService] = useState(true);
    const [svcAppIds, setSvcAppIds] = useState<string[]>([]);

    const { data: services } = useQuery({
        queryKey: ["monitoring-services"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("services_client")
                .select("id, name, price, service_name_id, service_name:service_name(id, name)")
                .eq("status", true)
                .order("name");
            if (error) throw error;
            return (data || []) as unknown as ServiceRow[];
        },
        enabled: open && iaEnabled && !monitoring,
    });

    // Agrupa aplicações (services_client) pelo serviço-pai (service_name)
    const serviceGroups = useMemo(() => {
        const map = new Map<string, { key: string; label: string; apps: ServiceRow[] }>();
        for (const svc of services || []) {
            const key = svc.service_name_id || svc.id;
            const label = svc.service_name?.name || svc.name;
            const group = map.get(key) || { key, label, apps: [] };
            group.apps.push(svc);
            map.set(key, group);
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [services]);

    const activeGroup = serviceGroups.find((g) => g.key === svcGroupKey) || null;

    const insertVariable = (variable: string) => {
        const el = messageRef.current;
        if (!el) {
            setMessage((prev) => prev + variable);
            return;
        }
        const start = el.selectionStart ?? message.length;
        const end = el.selectionEnd ?? message.length;
        const next = message.slice(0, start) + variable + message.slice(end);
        setMessage(next);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + variable.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const openServiceDialog = () => {
        setSvcGroupKey(null);
        setSvcFullService(true);
        setSvcAppIds([]);
        setSvcDialogOpen(true);
    };

    const confirmAddService = () => {
        if (!activeGroup) return;
        const apps = svcFullService
            ? activeGroup.apps
            : activeGroup.apps.filter((a) => svcAppIds.includes(a.id));
        if (apps.length === 0) return toast.error("Selecione ao menos uma aplicação");
        setSelectedServices((prev) => {
            const withoutGroup = prev.filter(
                (s) => (s.service_name_id || s.id) !== activeGroup.key
            );
            const entries: MonitoringService[] = apps.map((a) => ({
                id: a.id,
                name: a.name,
                price: a.price ?? null,
                service_name: a.service_name?.name || a.name,
                service_name_id: a.service_name_id || null,
                full_service: svcFullService,
            }));
            return [...withoutGroup, ...entries];
        });
        setSvcDialogOpen(false);
    };

    const removeService = (id: string) => {
        setSelectedServices((prev) => prev.filter((s) => s.id !== id));
    };

    const resetForm = () => {
        setTerm(""); setMatchMode("contains"); setMessage(""); setValidUntil("");
        setButtonsEnabled(false); setReplyButtons(["", "", ""]);
        setIaEnabled(false); setIaFunction("agendamento");
        setObjective(""); setSelectedServices([]); setDiscountPct("");
    };

    const handleCreate = async () => {
        if (!term.trim()) return toast.error("Informe o termo monitorado");
        if (!message.trim()) return toast.error("Escreva a mensagem de abordagem");
        if (!validUntil) return toast.error("Defina a data de expiração");
        const until = new Date(validUntil);
        if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
            return toast.error("A data de expiração deve ser futura");
        }
        const buttons = buttonsEnabled
            ? replyButtons.map((b) => b.trim()).filter(Boolean)
            : [];
        if (buttonsEnabled && buttons.length === 0) {
            return toast.error("Preencha ao menos um botão de escolha");
        }
        if (iaEnabled && !objective.trim()) {
            return toast.error("Defina o objetivo para a IA abordar os clientes");
        }
        try {
            await createMonitoring.mutateAsync({
                group_id: groupId,
                monitor_term: term.trim(),
                monitor_match_mode: matchMode,
                valid_until: until.toISOString(),
                initial_message: message,
                ia_enabled: iaEnabled,
                ia_function: iaEnabled ? iaFunction : undefined,
                objective: iaEnabled ? objective.trim() : "",
                services: iaEnabled ? selectedServices : [],
                discount_pct: iaEnabled && discountPct ? parseFloat(discountPct) : null,
                reply_buttons: buttons,
            });
            toast.success("Monitoramento criado! Os leads que falarem o termo serão abordados.");
            resetForm();
        } catch (err: any) {
            toast.error(err?.message || "Erro ao criar monitoramento");
        }
    };

    const handleEnd = async () => {
        if (!monitoring) return;
        try {
            await endMonitoring.mutateAsync(monitoring.id);
            toast.success("Monitoramento encerrado — tags removidas.");
        } catch (err: any) {
            toast.error(err?.message || "Erro ao encerrar monitoramento");
        } finally {
            setConfirmEnd(false);
        }
    };

    return (
        <Collapsible open={open} onOpenChange={onToggle}>
            <Card className="border-[#1E2229]/20 dark:border-border">
                <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                            <Radar className="w-3.5 h-3.5" /> Monitoramento
                            {monitoring && (
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </CardTitle>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                                <ChevronUp className={`h-3.5 w-3.5 transition-transform ${open ? "" : "rotate-180"}`} />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0">
                        {isLoading ? (
                            <div className="flex justify-center py-3">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : monitoring ? (
                            /* ── Monitoramento ativo ── */
                            <div className="space-y-2">
                                <div className="text-[11px] bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-2 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium truncate">{monitoring.name}</span>
                                        <Badge variant="outline" className="text-[9px] shrink-0 border-green-400 text-green-700 dark:text-green-300">
                                            Ativo
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <TagIcon className="w-3 h-3 shrink-0" />
                                        <span>
                                            Termo: <span className="font-medium text-foreground">"{monitoring.monitor_term}"</span>
                                            {" "}({monitoring.monitor_match_mode === "equals" ? "Igual" : "Contém"})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Users className="w-3 h-3 shrink-0" />
                                        <span>Leads capturados: <span className="font-medium text-foreground">{leadCount ?? 0}</span></span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <CalendarClock className="w-3 h-3 shrink-0" />
                                        <span>Expira em {format(new Date(monitoring.valid_until), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {monitoring.ia_enabled && (
                                            <Badge variant="secondary" className="text-[9px]">
                                                IA — {monitoring.ia_function === "qualificacao" ? "Qualificação" : "Agendamento"}
                                            </Badge>
                                        )}
                                        {Array.isArray(monitoring.reply_buttons) && monitoring.reply_buttons.length > 0 && (
                                            <Badge variant="secondary" className="text-[9px]">
                                                {monitoring.reply_buttons.length} botão(ões) de escolha
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                {canManage && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="w-full text-xs h-7"
                                        onClick={() => setConfirmEnd(true)}
                                        disabled={endMonitoring.isPending}
                                    >
                                        {endMonitoring.isPending ? "Encerrando..." : "Encerrar monitoramento"}
                                    </Button>
                                )}
                            </div>
                        ) : canManage ? (
                            /* ── Formulário de criação ── */
                            <div className="space-y-2.5">
                                <div>
                                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Termo monitorado</p>
                                    <Input
                                        value={term}
                                        onChange={(e) => setTerm(e.target.value)}
                                        placeholder="Ex.: promoção especial"
                                        className="text-xs h-8"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Correspondência</p>
                                    <select
                                        className="w-full text-xs border rounded p-1.5 bg-background"
                                        value={matchMode}
                                        onChange={(e) => setMatchMode(e.target.value as "contains" | "equals")}
                                    >
                                        <option value="contains">Contém — o termo aparece na mensagem</option>
                                        <option value="equals">Igual — a mensagem é exatamente o termo</option>
                                    </select>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Mensagem de abordagem</p>
                                    <Textarea
                                        ref={messageRef}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={"Olá {{nome_cliente}}! Vi seu interesse no grupo..."}
                                        className="text-xs min-h-[70px]"
                                    />
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {MESSAGE_VARIABLES.map((v) => (
                                            <button
                                                key={v.key}
                                                type="button"
                                                onClick={() => insertVariable(v.key)}
                                                title={`Inserir ${v.label}`}
                                                className="text-[9px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-primary/10 hover:border-primary/40 transition-colors font-mono"
                                            >
                                                {v.key}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5">
                                        Clique numa variável para inserir na mensagem.
                                    </p>
                                </div>
                                <div className="border rounded-lg p-2 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-medium">Enviar botões de escolha</span>
                                        <Switch checked={buttonsEnabled} onCheckedChange={setButtonsEnabled} />
                                    </div>
                                    {buttonsEnabled && (
                                        <div className="space-y-1.5">
                                            {replyButtons.map((btn, idx) => (
                                                <Input
                                                    key={idx}
                                                    value={btn}
                                                    onChange={(e) => {
                                                        const next = [...replyButtons];
                                                        next[idx] = e.target.value;
                                                        setReplyButtons(next);
                                                    }}
                                                    placeholder={`Botão ${idx + 1}${idx > 0 ? " (opcional)" : " — ex.: Quero saber mais"}`}
                                                    maxLength={40}
                                                    className="text-xs h-8"
                                                />
                                            ))}
                                            <p className="text-[9px] text-muted-foreground">
                                                Até 3 botões enviados junto da mensagem de abordagem.
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Expira em</p>
                                    <Input
                                        type="datetime-local"
                                        value={validUntil}
                                        onChange={(e) => setValidUntil(e.target.value)}
                                        className="text-xs h-8"
                                    />
                                </div>
                                <div className="flex items-center justify-between border rounded-lg p-2">
                                    <span className="text-[11px] font-medium">IA aborda os leads</span>
                                    <Switch checked={iaEnabled} onCheckedChange={setIaEnabled} />
                                </div>
                                {iaEnabled && (
                                    <div className="space-y-2 border-l-2 border-primary/30 pl-2">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Função da IA</p>
                                            <div className="grid grid-cols-2 gap-1 border rounded-lg p-1">
                                                {([
                                                    ["agendamento", "Agendamento"],
                                                    ["qualificacao", "Qualificação"],
                                                ] as const).map(([value, label]) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => setIaFunction(value)}
                                                        className={cn(
                                                            "text-[11px] py-1 rounded transition-colors",
                                                            iaFunction === value
                                                                ? "bg-primary text-primary-foreground font-medium"
                                                                : "hover:bg-muted text-muted-foreground"
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Objetivo da IA</p>
                                            <Textarea
                                                value={objective}
                                                onChange={(e) => setObjective(e.target.value)}
                                                placeholder="Ex.: agendar avaliação do serviço"
                                                className="text-xs min-h-[50px]"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Serviços atrelados</p>
                                            {selectedServices.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mb-1.5">
                                                    {selectedServices.map((s) => (
                                                        <span
                                                            key={s.id}
                                                            className="inline-flex items-center gap-1 text-[10px] bg-muted border rounded-full pl-2 pr-1 py-0.5"
                                                        >
                                                            <span className="truncate max-w-[140px]">
                                                                {s.full_service ? (s.service_name || s.name) : s.name}
                                                            </span>
                                                            {s.full_service && (
                                                                <span className="text-[8px] text-primary font-semibold uppercase">todo</span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => removeService(s.id)}
                                                                className="rounded-full hover:bg-destructive/10 p-0.5"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full text-xs h-7"
                                                onClick={openServiceDialog}
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Adicionar serviço
                                            </Button>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Desconto (%) — opcional</p>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={discountPct}
                                                onChange={(e) => setDiscountPct(e.target.value)}
                                                placeholder="Ex.: 20"
                                                className="text-xs h-8 w-24"
                                            />
                                        </div>
                                    </div>
                                )}
                                <Button
                                    onClick={handleCreate}
                                    disabled={createMonitoring.isPending}
                                    size="sm"
                                    className="w-full text-xs h-8"
                                >
                                    {createMonitoring.isPending ? "Criando..." : "Iniciar monitoramento"}
                                </Button>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">
                                Nenhum monitoramento ativo neste grupo.
                            </p>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>

            {/* ── Modal Adicionar Serviço ── */}
            <Dialog open={svcDialogOpen} onOpenChange={setSvcDialogOpen}>
                <DialogContent className="w-[95vw] sm:w-full sm:max-w-[420px] max-h-[85vh] overflow-y-auto rounded-lg">
                    <DialogHeader>
                        <DialogTitle className="text-base">Adicionar serviço</DialogTitle>
                        <DialogDescription className="text-xs">
                            Escolha o serviço e selecione o serviço inteiro ou aplicações específicas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <p className="text-[11px] text-muted-foreground mb-1 font-medium">Serviço</p>
                            <select
                                className="w-full text-sm border rounded p-2 bg-background"
                                value={svcGroupKey ?? ""}
                                onChange={(e) => {
                                    setSvcGroupKey(e.target.value || null);
                                    setSvcFullService(true);
                                    setSvcAppIds([]);
                                }}
                            >
                                <option value="">Selecione um serviço...</option>
                                {serviceGroups.map((g) => (
                                    <option key={g.key} value={g.key}>{g.label}</option>
                                ))}
                            </select>
                            {serviceGroups.length === 0 && (
                                <p className="text-[10px] text-muted-foreground mt-1">Nenhum serviço ativo cadastrado.</p>
                            )}
                        </div>
                        {activeGroup && (
                            <>
                                <div className="grid grid-cols-2 gap-1 border rounded-lg p-1">
                                    <button
                                        type="button"
                                        onClick={() => { setSvcFullService(true); setSvcAppIds([]); }}
                                        className={cn(
                                            "text-xs py-1.5 rounded transition-colors",
                                            svcFullService ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        Todo o serviço
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSvcFullService(false)}
                                        className={cn(
                                            "text-xs py-1.5 rounded transition-colors",
                                            !svcFullService ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        Aplicações específicas
                                    </button>
                                </div>
                                {!svcFullService && (
                                    <div className="max-h-44 overflow-y-auto border rounded divide-y">
                                        {activeGroup.apps.map((app) => (
                                            <label key={app.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/40">
                                                <Checkbox
                                                    checked={svcAppIds.includes(app.id)}
                                                    onCheckedChange={(checked) => {
                                                        setSvcAppIds((prev) =>
                                                            checked ? [...prev, app.id] : prev.filter((id) => id !== app.id)
                                                        );
                                                    }}
                                                />
                                                <span className="text-xs flex-1 truncate">{app.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSvcDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={confirmAddService} disabled={!activeGroup}>
                            Adicionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
                <AlertDialogContent className="w-[95vw] sm:max-w-md rounded-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Encerrar monitoramento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            As tags dos leads capturados serão removidas e nenhum novo lead será
                            abordado. O histórico permanece no dashboard.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleEnd} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Encerrar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Collapsible>
    );
};
