import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useStaff, useCurrentTeamMember } from "@/hooks/useStaff";
import { toast } from "sonner";
import { CRM_STAGES, TERMINAL_STAGES } from "@/types/crm-client";
import { ServiceCategory, ServiceName } from "@/types/services";

interface ServiceLine {
  id?: string; // crm_client_services.id (linhas já salvas, no modo edição)
  serviceClientId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  minPrice: number;
}

interface NegotiationQuickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  /** Negociação ativa (crm_client + crm_client_services) — se ausente, modo criação */
  deal?: any | null;
}

export const NegotiationQuickModal = ({ open, onOpenChange, contactId, deal }: NegotiationQuickModalProps) => {
  const { data: ownerId } = useOwnerId();
  const { data: staffMembers } = useStaff();
  const { data: currentTeamMember } = useCurrentTeamMember();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const isEdit = !!deal;

  const [stage, setStage] = useState<string>("Qualificado");
  const [priority, setPriority] = useState("medium");
  const [responsibleId, setResponsibleId] = useState("");
  const [description, setDescription] = useState("");
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [removedServiceIds, setRemovedServiceIds] = useState<string[]>([]);

  const [selCategoryId, setSelCategoryId] = useState("");
  const [selServiceNameId, setSelServiceNameId] = useState("");
  const [selApplicationId, setSelApplicationId] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelCategoryId(""); setSelServiceNameId(""); setSelApplicationId("");
    setRemovedServiceIds([]);
    if (deal) {
      setStage(deal.stage || "Qualificado");
      setPriority(deal.priority || "medium");
      setResponsibleId(deal.responsible_id || "");
      setDescription(deal.notes || "");
      setServices((deal.crm_client_services || []).map((s: any) => ({
        id: s.id,
        serviceClientId: s.service_client_id,
        name: s.service_name,
        quantity: s.quantity,
        unitPrice: Number(s.unit_price),
        minPrice: Number(s.min_price ?? 0),
      })));
    } else {
      setStage("Qualificado");
      setPriority("medium");
      setResponsibleId(currentTeamMember?.id || "");
      setDescription("");
      setServices([]);
    }
  }, [open, deal, currentTeamMember]);

  const { data: categories } = useQuery({
    queryKey: ["services-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services_category" as any).select("*").order("name");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });

  const { data: serviceNames } = useQuery({
    queryKey: ["service-names", selCategoryId],
    enabled: !!selCategoryId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_name" as any).select("*").eq("category_id", selCategoryId).order("name");
      if (error) throw error;
      return data as ServiceName[];
    },
  });

  const { data: applications } = useQuery({
    queryKey: ["deal-applications", selServiceNameId],
    enabled: !!selServiceNameId,
    queryFn: async () => {
      const { data: clientApps } = await supabase
        .from("services_client" as any).select("*")
        .eq("service_name_id", selServiceNameId).eq("status", true).order("name");
      if (clientApps && clientApps.length > 0) {
        return clientApps.map((a: any) => ({ id: a.id, name: a.name, price: a.price, min_price: a.min_price }));
      }
      const { data: tpl, error } = await supabase
        .from("service_applications" as any).select("*")
        .eq("service_name_id", selServiceNameId).order("name");
      if (error) throw error;
      return (tpl || []).map((a: any) => ({ id: a.id, name: a.name, price: a.default_price, min_price: a.default_min_price }));
    },
  });

  const handleAddService = () => {
    if (!selApplicationId || !applications) return;
    const app = applications.find((a: any) => a.id === selApplicationId);
    if (!app) return;
    if (services.some((s) => s.serviceClientId === app.id)) {
      toast.error("Serviço já adicionado");
      return;
    }
    setServices((prev) => [...prev, {
      serviceClientId: app.id, name: app.name,
      quantity: 1, unitPrice: app.price, minPrice: app.min_price ?? 0,
    }]);
    setSelApplicationId("");
  };

  const updateLine = (idx: number, field: "quantity" | "unitPrice", value: number) => {
    setServices((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      if (field === "unitPrice") return { ...s, unitPrice: Math.max(s.minPrice, value) };
      return { ...s, quantity: Math.max(1, value) };
    }));
  };

  const removeService = (idx: number) => {
    const line = services[idx];
    if (line.id) setRemovedServiceIds((p) => [...p, line.id!]);
    setServices((p) => p.filter((_, i) => i !== idx));
  };

  const totalValue = services.reduce((sum, s) => sum + s.unitPrice * s.quantity, 0);
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["crm-client-sidebar", contactId] });
    queryClient.invalidateQueries({ queryKey: ["crm-client-all", contactId] });
    queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
  };

  const handleSave = async () => {
    if (!ownerId || !contactId) return;
    setSaving(true);
    try {
      if (isEdit) {
        const updates: Record<string, any> = {
          priority,
          responsible_id: responsibleId || null,
          notes: description || null,
          value: totalValue,
        };
        if (stage !== deal.stage) {
          updates.stage = stage;
          updates.stage_changed_at = new Date().toISOString();
        }
        const { error } = await supabase.from("crm_client" as any).update(updates).eq("id", deal.id);
        if (error) throw error;

        if (removedServiceIds.length > 0) {
          await supabase.from("crm_client_services" as any).delete().in("id", removedServiceIds);
        }
        for (const s of services) {
          if (s.id) {
            await supabase.from("crm_client_services" as any)
              .update({ quantity: s.quantity, unit_price: s.unitPrice })
              .eq("id", s.id);
          } else {
            await supabase.from("crm_client_services" as any).insert({
              crm_client_id: deal.id, service_client_id: s.serviceClientId,
              service_name: s.name, quantity: s.quantity, unit_price: s.unitPrice, min_price: s.minPrice,
            });
          }
        }
        toast.success("Negociação atualizada!");
      } else {
        const { data: existing } = await supabase
          .from("crm_client" as any).select("id")
          .eq("contact_id", contactId).eq("is_active", true).maybeSingle();
        if (existing) {
          toast.error("Este contato já possui uma negociação ativa");
          setSaving(false);
          return;
        }
        const { data: created, error } = await supabase
          .from("crm_client" as any)
          .insert({
            user_id: ownerId, contact_id: contactId, stage, value: totalValue,
            priority, responsible_id: responsibleId || currentTeamMember?.id || null,
            notes: description || null,
          }).select("id").single();
        if (error) throw error;

        if (services.length > 0 && created) {
          await supabase.from("crm_client_services" as any).insert(
            services.map((s) => ({
              crm_client_id: (created as any).id, service_client_id: s.serviceClientId,
              service_name: s.name, quantity: s.quantity, unit_price: s.unitPrice, min_price: s.minPrice,
            }))
          );
        }
        toast.success("Negociação criada com sucesso!");
      }
      invalidateAll();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setSaving(false); }
  };

  const nativeSelectClass = "h-8 text-xs w-full rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
  const stageOptions = isEdit ? CRM_STAGES : CRM_STAGES.filter((s) => !TERMINAL_STAGES.includes(s));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
          <DialogTitle>{isEdit ? "Editar Negociação" : "Nova Negociação"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-5 pb-2 nav-scrollbar">
          {/* Serviços */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/10 dark:bg-white/5">
            <Label className="text-sm font-medium">Adicionar Serviço</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px]">Categoria</Label>
                <select
                  className={nativeSelectClass}
                  value={selCategoryId}
                  onChange={(e) => { setSelCategoryId(e.target.value); setSelServiceNameId(""); setSelApplicationId(""); }}
                >
                  <option value="">Selecione...</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Procedimento</Label>
                <select
                  className={nativeSelectClass}
                  value={selServiceNameId}
                  onChange={(e) => { setSelServiceNameId(e.target.value); setSelApplicationId(""); }}
                  disabled={!selCategoryId}
                >
                  <option value="">Selecione...</option>
                  {(serviceNames || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Aplicação</Label>
                <select
                  className={nativeSelectClass}
                  value={selApplicationId}
                  onChange={(e) => setSelApplicationId(e.target.value)}
                  disabled={!selServiceNameId}
                >
                  <option value="">Selecione...</option>
                  {(applications || []).map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmt(a.price)}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAddService} disabled={!selApplicationId}>
              <Plus className="w-3 h-3" /> Adicionar
            </Button>

            {services.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                {services.map((svc, idx) => (
                  <div key={svc.id || svc.serviceClientId} className="p-2.5 border rounded-md bg-background space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate flex-1">{svc.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeService(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
                        <Input type="number" min={1} value={svc.quantity}
                          onChange={(e) => updateLine(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor Unit. (R$)</Label>
                        <Input type="number" step="0.01" min={svc.minPrice}
                          value={svc.unitPrice}
                          onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm" />
                        <span className="text-[9px] text-muted-foreground">Mín: {fmt(svc.minPrice)}</span>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Subtotal</Label>
                        <Input value={fmt(svc.unitPrice * svc.quantity)} disabled className="h-8 text-sm bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Valor Total</span>
                  <span className="text-lg font-bold text-primary">{fmt(totalValue)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Etapa + Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{isEdit ? "Etapa" : "Etapa Inicial"}</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Responsável */}
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(staffMembers || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.role === "admin" ? "Admin" : s.role === "supervisor" ? "Superv." : "Atend."})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes da negociação..." rows={3} />
          </div>
        </div>

        <div className="shrink-0 px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isEdit ? "Salvar Alterações" : "Criar Negociação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
