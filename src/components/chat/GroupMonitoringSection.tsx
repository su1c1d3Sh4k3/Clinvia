import { useState } from "react";
import { Radar, ChevronUp, Users, CalendarClock, Tag as TagIcon, Loader2 } from "lucide-react";
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
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
    useActiveGroupMonitoring, useGroupMonitoringMutations, useMonitoringLeadCount,
} from "@/hooks/useGroupMonitoring";
import type { CampaignService } from "@/hooks/useCampaigns";

interface GroupMonitoringSectionProps {
    groupId: string;
    open: boolean;
    onToggle: () => void;
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
    const [iaEnabled, setIaEnabled] = useState(false);
    const [objective, setObjective] = useState("");
    const [selectedServices, setSelectedServices] = useState<CampaignService[]>([]);
    const [discountPct, setDiscountPct] = useState("");
    const [confirmEnd, setConfirmEnd] = useState(false);

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
        enabled: open && iaEnabled && !monitoring,
    });

    const toggleService = (svc: any) => {
        setSelectedServices((prev) => {
            const exists = prev.some((s) => s.id === svc.id);
            if (exists) return prev.filter((s) => s.id !== svc.id);
            return [...prev, { id: svc.id, name: svc.name, price: svc.price ?? null }];
        });
    };

    const resetForm = () => {
        setTerm(""); setMatchMode("contains"); setMessage(""); setValidUntil("");
        setIaEnabled(false); setObjective(""); setSelectedServices([]); setDiscountPct("");
    };

    const handleCreate = async () => {
        if (!term.trim()) return toast.error("Informe o termo monitorado");
        if (!message.trim()) return toast.error("Escreva a mensagem de abordagem");
        if (!validUntil) return toast.error("Defina a data de expiração");
        const until = new Date(validUntil);
        if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
            return toast.error("A data de expiração deve ser futura");
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
                objective: iaEnabled ? objective.trim() : "",
                services: iaEnabled ? selectedServices : [],
                discount_pct: iaEnabled && discountPct ? parseFloat(discountPct) : null,
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
                                    {monitoring.ia_enabled && (
                                        <Badge variant="secondary" className="text-[9px]">IA aborda os leads</Badge>
                                    )}
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
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={"Olá {{nome_cliente}}! Vi seu interesse no grupo..."}
                                        className="text-xs min-h-[70px]"
                                    />
                                    <p className="text-[9px] text-muted-foreground mt-0.5">
                                        Use {"{{nome_cliente}}"} para personalizar com o nome do lead.
                                    </p>
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
                                            <div className="max-h-32 overflow-y-auto border rounded divide-y">
                                                {(services || []).length === 0 && (
                                                    <p className="text-[10px] text-muted-foreground p-2">Nenhum serviço ativo.</p>
                                                )}
                                                {(services || []).map((svc: any) => (
                                                    <label key={svc.id} className="flex items-center gap-2 p-1.5 cursor-pointer hover:bg-muted/40">
                                                        <Checkbox
                                                            checked={selectedServices.some((s) => s.id === svc.id)}
                                                            onCheckedChange={() => toggleService(svc)}
                                                        />
                                                        <span className="text-[11px] flex-1 truncate">{svc.name}</span>
                                                    </label>
                                                ))}
                                            </div>
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
