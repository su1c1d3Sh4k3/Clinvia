import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, Bot, Star, Cake, Plus, Pencil, Trash2,
  AlertCircle, Clock, CheckCircle2, MessageSquareText, Info
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AutoMessage {
  id?: string;
  user_id?: string;
  trigger_type: string;
  is_active: boolean;
  message: string;
  timing_value: number;
  timing_unit: string;
  timing_direction: string;
  send_hour: number;
  send_minute: number;
  funnel_id?: string | null;
  stage_id?: string | null;
  instance_id?: string | null;
}

interface Instance {
  id: string;
  name: string;
  instance_name: string;
  status: string;
}

interface CRMFunnel { id: string; name: string; }
interface CRMStage  { id: string; name: string; funnel_id: string; is_system: boolean; }

// ─── Variables chip component (clickable to insert) ─────────────────────────

const VarChip = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:scale-95 transition-all cursor-pointer select-none"
    title={`Clique para inserir {${label}}`}
  >
    {"{" + label + "}"}
  </button>
);

const VariableHint = ({ vars, onInsert }: { vars: string[]; onInsert?: (v: string) => void }) => (
  <div className="flex flex-wrap gap-1.5 mt-1.5">
    <span className="text-xs text-muted-foreground mr-0.5 leading-5">Variáveis:</span>
    {vars.map(v => <VarChip key={v} label={v} onClick={() => onInsert?.(v)} />)}
  </div>
);

/** Hook: insere variável na posição do cursor de um textarea */
function useVariableInserter(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  getMessage: () => string,
  setMessage: (msg: string) => void,
) {
  return useCallback((variable: string) => {
    const ta = textareaRef.current;
    const varText = `{${variable}}`;
    if (!ta) {
      // Fallback: append ao final
      setMessage(getMessage() + varText);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const text = ta.value;
    const newText = text.substring(0, start) + varText + text.substring(end);
    setMessage(newText);
    // Restaurar cursor após re-render do React
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + varText.length;
    });
  }, [textareaRef, getMessage, setMessage]);
}

// ─── Empty state for a single config ─────────────────────────────────────────

const defaultAutoMessage = (triggerType: string, overrides: Partial<AutoMessage> = {}): AutoMessage => ({
  trigger_type: triggerType,
  is_active: false,
  message: "",
  timing_value: 0,
  timing_unit: "hours",
  timing_direction: "before",
  send_hour: 9,
  send_minute: 0,
  funnel_id: null,
  stage_id: null,
  instance_id: null,
  ...overrides,
});

// ─── Main Page ────────────────────────────────────────────────────────────────

const AutoMessages = () => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();

  // ── Data: all auto_messages for this owner
  const { data: allConfigs = [], isLoading } = useQuery({
    queryKey: ["auto-messages", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_messages" as any)
        .select("*")
        .eq("user_id", ownerId);
      if (error) throw error;
      return data as AutoMessage[];
    },
    enabled: !!ownerId,
  });

  // ── Helper: find config by trigger_type
  const cfg = (triggerType: string): AutoMessage =>
    allConfigs.find(c => c.trigger_type === triggerType) ?? defaultAutoMessage(triggerType);

  // ── ia_on status
  const { data: iaConfig } = useQuery({
    queryKey: ["ia-config-on", ownerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_config" as any)
        .select("ia_on")
        .eq("user_id", ownerId)
        .single();
      return data as { ia_on: boolean } | null;
    },
    enabled: !!ownerId,
  });

  // ── CRM funnels & stages
  const { data: funnels = [] } = useQuery({
    queryKey: ["crm-funnels-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_funnels" as any)
        .select("id, name")
        .order("created_at", { ascending: true });
      return (data ?? []) as CRMFunnel[];
    },
  });

  const { data: allStages = [] } = useQuery({
    queryKey: ["crm-stages-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_stages" as any)
        .select("id, name, funnel_id, is_system")
        .order("position", { ascending: true });
      return (data ?? []) as CRMStage[];
    },
  });

  // ── Instâncias do cliente (WhatsApp)
  const { data: instances = [] } = useQuery({
    queryKey: ["instances-simple", ownerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("instances")
        .select("id, name, instance_name, status")
        .order("name");
      return (data ?? []) as Instance[];
    },
    enabled: !!ownerId,
  });

  // ── Save mutation (for non-CRM types): update se existe, insert se novo
  const upsertMutation = useMutation({
    mutationFn: async (payload: AutoMessage) => {
      const { id, user_id: _uid, ...rest } = payload as any;
      const row = { ...rest, user_id: ownerId };

      if (id) {
        const { error } = await supabase
          .from("auto_messages" as any)
          .update(row)
          .eq("id", id);
        if (error) throw error;
      } else {
        // Tenta insert; se duplicar (race condition), faz update pelo trigger_type
        const { error } = await supabase
          .from("auto_messages" as any)
          .insert(row);
        if (error) {
          // Fallback: se já existe registro para esse trigger_type, faz update
          if (error.code === "23505") {
            const { error: updateError } = await supabase
              .from("auto_messages" as any)
              .update(row)
              .eq("user_id", ownerId)
              .eq("trigger_type", row.trigger_type);
            if (updateError) throw updateError;
          } else {
            throw error;
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-messages", ownerId] });
    },
    onError: (err: any) => toast.error("Erro ao salvar configuração"),
  });

  // ── Insert/update CRM rule
  const saveCrmMutation = useMutation({
    mutationFn: async (payload: AutoMessage) => {
      const { id, user_id: _uid, ...rest } = payload as any;
      const row = { ...rest, user_id: ownerId };

      if (id) {
        const { error } = await supabase
          .from("auto_messages" as any)
          .update(row)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("auto_messages" as any)
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-messages", ownerId] });
      toast.success("Regra salva com sucesso!");
    },
    onError: (err: any) => toast.error("Erro ao salvar regra: " + (err?.message || "")),
  });

  const deleteCrmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("auto_messages" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-messages", ownerId] });
      toast.success("Regra removida!");
    },
    onError: () => toast.error("Erro ao remover regra"),
  });

  const saveConfig = (config: AutoMessage) => {
    upsertMutation.mutate(config);
  };

  const iaOn = iaConfig?.ia_on ?? false;
  const crmRules = allConfigs.filter(c =>
    ["crm_stage_enter", "crm_after_days", "crm_stagnation"].includes(c.trigger_type)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Mensagens Automáticas</h1>
            <p className="text-sm text-muted-foreground">
              Configure templates enviados automaticamente em ocasiões específicas
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <Tabs defaultValue="agenda" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="agenda" className="gap-2">
              <Calendar className="w-4 h-4" /> Agenda
            </TabsTrigger>
            <TabsTrigger value="crm" className="gap-2">
              <Bot className="w-4 h-4" /> CRM
            </TabsTrigger>
            <TabsTrigger value="satisfaction" className="gap-2">
              <Star className="w-4 h-4" /> Satisfação
            </TabsTrigger>
            <TabsTrigger value="birthday" className="gap-2">
              <Cake className="w-4 h-4" /> Aniversário
            </TabsTrigger>
          </TabsList>

          {/* ─── TAB: AGENDA ─────────────────────────────── */}
          <TabsContent value="agenda" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {iaOn ? (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">IA está ativa</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                    Desative a IA em <strong>Definições da IA</strong> para configurar mensagens de agendamento —
                    enquanto a IA estiver ligada, ela já gerencia essas comunicações automaticamente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <AgendaCard
                  title="Confirmação de Agendamento"
                  description="Enviada imediatamente quando um novo agendamento é criado"
                  triggerType="appointment_created"
                  config={cfg("appointment_created")}
                  onSave={saveConfig}
                  showTiming={false}
                  variables={["nome_cliente", "primeiro_nome", "data_agendamento", "hora_agendamento", "nome_profissional", "nome_servico"]}
                  instances={instances}
                />
                <AgendaCard
                  title="Lembrete de Agendamento"
                  description="Enviada X horas antes do horário marcado"
                  triggerType="appointment_reminder"
                  config={cfg("appointment_reminder")}
                  onSave={saveConfig}
                  showTiming
                  timingDirection="before"
                  timingLabel="Enviar quantas horas antes?"
                  defaultTimingValue={24}
                  variables={["nome_cliente", "primeiro_nome", "data_agendamento", "hora_agendamento", "nome_profissional", "nome_servico"]}
                  instances={instances}
                />
                <AgendaCard
                  title="Lembrete no Dia"
                  description="Enviada no próprio dia, X horas antes do horário"
                  triggerType="appointment_day_reminder"
                  config={cfg("appointment_day_reminder")}
                  onSave={saveConfig}
                  showTiming
                  timingDirection="before"
                  timingLabel="Enviar quantas horas antes?"
                  defaultTimingValue={2}
                  variables={["nome_cliente", "primeiro_nome", "data_agendamento", "hora_agendamento", "nome_profissional", "nome_servico"]}
                  instances={instances}
                />
                <AgendaCard
                  title="Cancelamento"
                  description="Enviada imediatamente quando um agendamento é cancelado"
                  triggerType="appointment_cancelled"
                  config={cfg("appointment_cancelled")}
                  onSave={saveConfig}
                  showTiming={false}
                  variables={["nome_cliente", "primeiro_nome", "data_agendamento", "hora_agendamento", "nome_profissional"]}
                  instances={instances}
                />
                <AgendaCard
                  title="Pós-Atendimento"
                  description="Enviada após a conclusão do serviço"
                  triggerType="appointment_post_service"
                  config={cfg("appointment_post_service")}
                  onSave={saveConfig}
                  showTiming
                  timingDirection="after"
                  timingLabel="Enviar quantas horas depois?"
                  defaultTimingValue={2}
                  variables={["nome_cliente", "primeiro_nome", "nome_profissional", "nome_servico"]}
                  instances={instances}
                />
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: CRM ───────────────────────────────── */}
          <TabsContent value="crm" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CRMTab
              rules={crmRules}
              funnels={funnels}
              allStages={allStages}
              ownerId={ownerId ?? ""}
              onSave={(rule) => saveCrmMutation.mutate(rule)}
              onDelete={(id) => deleteCrmMutation.mutate(id)}
              isSaving={saveCrmMutation.isPending}
              instances={instances}
            />
          </TabsContent>

          {/* ─── TAB: SATISFAÇÃO ────────────────────────── */}
          <TabsContent value="satisfaction" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SatisfactionTab
              config={cfg("conversation_resolved")}
              onSave={saveConfig}
              instances={instances}
            />
          </TabsContent>

          {/* ─── TAB: ANIVERSÁRIO ───────────────────────── */}
          <TabsContent value="birthday" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <BirthdayTab
              config={cfg("patient_birthday")}
              onSave={saveConfig}
              instances={instances}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ─── InstancePicker (reutilizado em todas as abas) ──────────────────────────

function InstancePicker({ value, onChange, instances }: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  instances: Instance[];
}) {
  if (instances.length === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <MessageSquareText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Label className="text-sm text-muted-foreground whitespace-nowrap">Disparar pela instância</Label>
      <Select value={value || "_auto_"} onValueChange={v => onChange(v === "_auto_" ? null : v)}>
        <SelectTrigger className="w-[200px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_auto_">Automático (primeira disponível)</SelectItem>
          {instances.map(inst => (
            <SelectItem key={inst.id} value={inst.id}>
              {inst.name || inst.instance_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── AgendaCard ───────────────────────────────────────────────────────────────

interface AgendaCardProps {
  title: string;
  description: string;
  triggerType: string;
  config: AutoMessage;
  onSave: (c: AutoMessage) => void;
  showTiming: boolean;
  timingDirection?: "before" | "after";
  timingLabel?: string;
  defaultTimingValue?: number;
  variables: string[];
  instances: Instance[];
}

function AgendaCard({
  title, description, triggerType, config, onSave,
  showTiming, timingDirection = "before", timingLabel, defaultTimingValue = 0, variables, instances,
}: AgendaCardProps) {
  const [local, setLocal] = useState<AutoMessage>(() => ({
    ...config,
    timing_value: config.timing_value || defaultTimingValue,
    timing_direction: timingDirection,
  }));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocal({
      ...config,
      timing_value: config.timing_value || defaultTimingValue,
      timing_direction: timingDirection,
    });
  }, [config.id, config.is_active, config.message, config.timing_value]);

  const handleToggle = (checked: boolean) => {
    const updated = { ...local, is_active: checked };
    setLocal(updated);
    onSave(updated);
  };

  const handleBlur = () => {
    onSave(local);
  };

  const localRef = useRef(local);
  localRef.current = local;
  const insertVariable = useVariableInserter(
    textareaRef,
    () => localRef.current.message,
    (msg) => setLocal(prev => ({ ...prev, message: msg })),
  );

  return (
    <Card className={cn("transition-all duration-200", local.is_active ? "border-primary/30 bg-primary/5" : "")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full", local.is_active ? "bg-primary" : "bg-muted-foreground/40")} />
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <Switch checked={local.is_active} onCheckedChange={handleToggle} />
        </div>
      </CardHeader>
      {local.is_active && (
        <CardContent className="space-y-3 pt-0">
          <Separator />
          {showTiming && (
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Label className="text-sm text-muted-foreground whitespace-nowrap">{timingLabel}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={168}
                  value={local.timing_value}
                  onChange={e => setLocal({ ...local, timing_value: parseInt(e.target.value) || 0 })}
                  onBlur={handleBlur}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
            </div>
          )}
          <InstancePicker
            value={local.instance_id}
            onChange={v => { const updated = { ...local, instance_id: v }; setLocal(updated); onSave(updated); }}
            instances={instances}
          />
          <div className="space-y-1.5">
            <Label className="text-sm">Mensagem</Label>
            <Textarea
              ref={textareaRef}
              value={local.message}
              onChange={e => setLocal({ ...local, message: e.target.value })}
              onBlur={handleBlur}
              placeholder="Digite o template da mensagem..."
              className="min-h-[100px] text-sm resize-none"
            />
            <VariableHint vars={variables} onInsert={insertVariable} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── CRMTab ───────────────────────────────────────────────────────────────────

interface CRMTabProps {
  rules: AutoMessage[];
  funnels: CRMFunnel[];
  allStages: CRMStage[];
  ownerId: string;
  onSave: (rule: AutoMessage) => void;
  onDelete: (id: string) => void;
  isSaving: boolean;
  instances: Instance[];
}

const TRIGGER_LABELS: Record<string, string> = {
  crm_stage_enter: "Entrou na etapa",
  crm_after_days: "Após X dias na etapa",
  crm_stagnation: "Estagnado por X dias",
};

function CRMTab({ rules, funnels, allStages, onSave, onDelete, isSaving, instances }: CRMTabProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AutoMessage | null>(null);
  const crmTextareaRef = useRef<HTMLTextAreaElement>(null);

  const openNew = () => {
    setEditing(defaultAutoMessage("crm_stage_enter"));
    setOpen(true);
  };

  const openEdit = (rule: AutoMessage) => {
    setEditing({ ...rule });
    setOpen(true);
  };

  const handleSave = () => {
    if (!editing) return;
    onSave(editing);
    setOpen(false);
    setEditing(null);
  };

  const editingRef = useRef(editing);
  editingRef.current = editing;
  const insertCrmVariable = useVariableInserter(
    crmTextareaRef,
    () => editingRef.current?.message ?? "",
    (msg) => setEditing(prev => prev ? { ...prev, message: msg } : prev),
  );

  const stagesForFunnel = (funnelId: string) =>
    allStages.filter(s => s.funnel_id === funnelId && !s.is_system);

  const funnelName = (id?: string | null) =>
    funnels.find(f => f.id === id)?.name ?? "—";

  const stageName = (id?: string | null) =>
    allStages.find(s => s.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Envie mensagens automáticas quando um negócio entrar em uma etapa específica, estiver estagnado ou atingir um prazo.
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2 flex-shrink-0">
          <Plus className="w-4 h-4" /> Adicionar Regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl">
          <Bot className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">Nenhuma regra configurada</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Adicione regras para enviar mensagens automáticas baseadas em eventos do CRM
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <Card key={rule.id} className={cn("transition-all", rule.is_active ? "border-primary/30" : "opacity-60")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full mt-2 flex-shrink-0", rule.is_active ? "bg-primary" : "bg-muted-foreground/40")} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{funnelName(rule.funnel_id)}</Badge>
                        <span className="text-muted-foreground text-xs">→</span>
                        <Badge variant="secondary" className="text-xs">{stageName(rule.stage_id)}</Badge>
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                          {TRIGGER_LABELS[rule.trigger_type]}
                          {(rule.trigger_type === "crm_after_days" || rule.trigger_type === "crm_stagnation") &&
                            rule.timing_value > 0 && ` (${rule.timing_value} dias)`}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-md">
                        {rule.message || <span className="italic text-muted-foreground/50">Sem mensagem definida</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => rule.id && onDelete(rule.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Regra" : "Nova Regra de CRM"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              {/* Funil */}
              <div className="space-y-1.5">
                <Label>Funil</Label>
                <Select
                  value={editing.funnel_id ?? ""}
                  onValueChange={v => setEditing({ ...editing, funnel_id: v, stage_id: null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil..." />
                  </SelectTrigger>
                  <SelectContent>
                    {funnels.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Etapa */}
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select
                  value={editing.stage_id ?? ""}
                  onValueChange={v => setEditing({ ...editing, stage_id: v })}
                  disabled={!editing.funnel_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={editing.funnel_id ? "Selecione a etapa..." : "Selecione um funil primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stagesForFunnel(editing.funnel_id ?? "").map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Gatilho */}
              <div className="space-y-1.5">
                <Label>Gatilho</Label>
                <Select
                  value={editing.trigger_type}
                  onValueChange={v => setEditing({ ...editing, trigger_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crm_stage_enter">Entrou na etapa</SelectItem>
                    <SelectItem value="crm_after_days">Após X dias na etapa</SelectItem>
                    <SelectItem value="crm_stagnation">Estagnado por X dias (sem atividade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dias (se necessário) */}
              {(editing.trigger_type === "crm_after_days" || editing.trigger_type === "crm_stagnation") && (
                <div className="space-y-1.5">
                  <Label>Quantidade de dias</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={editing.timing_value || 1}
                      onChange={e => setEditing({ ...editing, timing_value: parseInt(e.target.value) || 1 })}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">dias</span>
                  </div>
                </div>
              )}

              {/* Mensagem */}
              <div className="space-y-1.5">
                <Label>Mensagem</Label>
                <Textarea
                  ref={crmTextareaRef}
                  value={editing.message}
                  onChange={e => setEditing({ ...editing, message: e.target.value })}
                  placeholder="Digite a mensagem que será enviada ao cliente..."
                  className="min-h-[120px] resize-none"
                />
                <VariableHint vars={["nome_cliente", "primeiro_nome", "nome_etapa", "nome_funil"]} onInsert={insertCrmVariable} />
              </div>

              {/* Instância */}
              <div className="space-y-1.5">
                <Label>Instância de envio</Label>
                <Select
                  value={editing.instance_id || "_auto_"}
                  onValueChange={v => setEditing({ ...editing, instance_id: v === "_auto_" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_auto_">Automático (primeira disponível)</SelectItem>
                    {instances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name || inst.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ativo */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Ativar regra</Label>
                  <p className="text-xs text-muted-foreground">A regra só envia mensagens quando estiver ativa</p>
                </div>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={v => setEditing({ ...editing, is_active: v })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !editing.funnel_id || !editing.stage_id || !editing.message.trim()}
                >
                  {isSaving ? "Salvando..." : "Salvar Regra"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SatisfactionTab ──────────────────────────────────────────────────────────

interface SatisfactionTabProps {
  config: AutoMessage;
  onSave: (c: AutoMessage) => void;
  instances: Instance[];
}

function SatisfactionTab({ config, onSave, instances }: SatisfactionTabProps) {
  const [local, setLocal] = useState<AutoMessage>(() => ({
    ...config,
    timing_value: config.timing_value || 0,
    timing_unit: "minutes",
  }));

  useEffect(() => {
    setLocal({ ...config, timing_unit: "minutes" });
  }, [config.id, config.is_active, config.timing_value]);

  const handleToggle = (checked: boolean) => {
    const updated = { ...local, is_active: checked };
    setLocal(updated);
    onSave(updated);
  };

  const handleBlur = () => onSave(local);

  const SURVEY_BUTTONS = [
    { stars: "⭐⭐⭐⭐⭐", label: "Excelente" },
    { stars: "⭐⭐⭐⭐", label: "Muito Bom" },
    { stars: "⭐⭐⭐", label: "Bom" },
    { stars: "⭐⭐", label: "Regular" },
    { stars: "⭐", label: "Ruim" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Pesquisa de Satisfação</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Enviada automaticamente quando uma conversa é encerrada
              </CardDescription>
            </div>
            <Switch checked={local.is_active} onCheckedChange={handleToggle} />
          </div>
        </CardHeader>
        {local.is_active && (
          <CardContent className="space-y-4 pt-0">
            <Separator />
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Enviar após</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={local.timing_value}
                  onChange={e => setLocal({ ...local, timing_value: parseInt(e.target.value) || 0 })}
                  onBlur={handleBlur}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-sm text-muted-foreground">minutos do fechamento</span>
              </div>
            </div>

            <InstancePicker
              value={local.instance_id}
              onChange={v => { const updated = { ...local, instance_id: v }; setLocal(updated); onSave(updated); }}
              instances={instances}
            />

            {/* Preview dos botões */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Prévia dos botões enviados ao cliente</p>
              </div>
              <div className="bg-background rounded-lg border p-3 space-y-2 max-w-xs">
                <p className="text-sm text-center text-muted-foreground italic">
                  Sua opinião é muito importante para seguirmos melhorando. Como você avalia seu atendimento?
                </p>
                <Separator />
                {SURVEY_BUTTONS.map(btn => (
                  <div key={btn.label} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                    <span className="text-sm">{btn.stars}</span>
                    <span className="text-sm font-medium">{btn.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Aviso sobre não reabrir */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <span>Ao clicar em um botão, a conversa <strong>permanece encerrada</strong>. A resposta é registrada sem reabrir o atendimento.</span>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ─── BirthdayTab ──────────────────────────────────────────────────────────────

interface BirthdayTabProps {
  config: AutoMessage;
  onSave: (c: AutoMessage) => void;
  instances: Instance[];
}

function BirthdayTab({ config, onSave, instances }: BirthdayTabProps) {
  const [local, setLocal] = useState<AutoMessage>(() => ({
    ...config,
    send_hour: config.send_hour ?? 9,
    send_minute: config.send_minute ?? 0,
  }));
  const birthdayTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocal({ ...config, send_hour: config.send_hour ?? 9, send_minute: config.send_minute ?? 0 });
  }, [config.id, config.is_active, config.message, config.send_hour, config.send_minute]);

  const handleToggle = (checked: boolean) => {
    const updated = { ...local, is_active: checked };
    setLocal(updated);
    onSave(updated);
  };

  const handleBlur = () => onSave(local);

  const localRef = useRef(local);
  localRef.current = local;
  const insertBirthdayVariable = useVariableInserter(
    birthdayTextareaRef,
    () => localRef.current.message,
    (msg) => setLocal(prev => ({ ...prev, message: msg })),
  );

  return (
    <div className="space-y-4">
      <Card className={cn(local.is_active ? "border-primary/30 bg-primary/5" : "")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Mensagem de Aniversário</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Enviada automaticamente no dia do aniversário dos pacientes
              </CardDescription>
            </div>
            <Switch checked={local.is_active} onCheckedChange={handleToggle} />
          </div>
        </CardHeader>
        {local.is_active && (
          <CardContent className="space-y-4 pt-0">
            <Separator />

            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Horário de envio</Label>
              <div className="flex items-center gap-1">
                <Select
                  value={String(local.send_hour)}
                  onValueChange={v => {
                    const updated = { ...local, send_hour: parseInt(v) };
                    setLocal(updated);
                    onSave(updated);
                  }}
                >
                  <SelectTrigger className="w-20 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {String(i).padStart(2, "0")}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-medium">:</span>
                <Select
                  value={String(local.send_minute ?? 0)}
                  onValueChange={v => {
                    const updated = { ...local, send_minute: parseInt(v) };
                    setLocal(updated);
                    onSave(updated);
                  }}
                >
                  <SelectTrigger className="w-20 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 10, 20, 30, 40, 50].map(m => (
                      <SelectItem key={m} value={String(m)}>
                        {String(m).padStart(2, "0")}min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <InstancePicker
              value={local.instance_id}
              onChange={v => { const updated = { ...local, instance_id: v }; setLocal(updated); onSave(updated); }}
              instances={instances}
            />

            <div className="space-y-1.5">
              <Label className="text-sm">Mensagem</Label>
              <Textarea
                ref={birthdayTextareaRef}
                value={local.message}
                onChange={e => setLocal({ ...local, message: e.target.value })}
                onBlur={handleBlur}
                placeholder="Ex: Feliz aniversário, {nome_paciente}! 🎂 Desejamos um dia incrível e contamos com sua presença em breve!"
                className="min-h-[120px] text-sm resize-none"
              />
              <VariableHint vars={["nome_paciente", "primeiro_nome"]} onInsert={insertBirthdayVariable} />
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <span>
                Enviado para pacientes com <strong>data de nascimento</strong> cadastrada e{" "}
                <strong>número de WhatsApp</strong> vinculado. Cada paciente recebe a mensagem{" "}
                <strong>uma vez por ano</strong>.
              </span>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default AutoMessages;
