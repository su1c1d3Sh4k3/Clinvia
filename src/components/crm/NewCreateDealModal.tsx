import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
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
import { ContactPicker } from "@/components/ui/contact-picker";
import { toast } from "sonner";
import { CRM_STAGES, TERMINAL_STAGES } from "@/types/crm-client";
import { ServiceCategory, ServiceName, ServiceClient } from "@/types/services";

interface ServiceLine {
  serviceClientId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  minPrice: number;
  maxPrice: number;
}

export const NewCreateDealModal = () => {
  const { data: ownerId } = useOwnerId();
  const { data: staffMembers } = useStaff();
  const { data: currentTeamMember } = useCurrentTeamMember();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contactId, setContactId] = useState("");
  const [stage, setStage] = useState<string>("Qualificado");
  const [priority, setPriority] = useState("medium");
  const [responsibleId, setResponsibleId] = useState("");
  const [description, setDescription] = useState("");
  const [services, setServices] = useState<ServiceLine[]>([]);

  const [selCategoryId, setSelCategoryId] = useState("");
  const [selServiceNameId, setSelServiceNameId] = useState("");
  const [selApplicationId, setSelApplicationId] = useState("");

  useEffect(() => {
    if (!open) {
      setContactId(""); setStage("Qualificado"); setPriority("medium");
      setResponsibleId(""); setDescription(""); setServices([]);
      setSelCategoryId(""); setSelServiceNameId(""); setSelApplicationId("");
    } else {
      setResponsibleId(currentTeamMember?.id || "");
    }
  }, [open, currentTeamMember]);

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
    queryKey: ["services-client-by-service", selServiceNameId],
    enabled: !!selServiceNameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_client" as any).select("*")
        .eq("service_name_id", selServiceNameId).eq("status", true).order("name");
      if (error) throw error;
      return data as ServiceClient[];
    },
  });

  useEffect(() => { setSelServiceNameId(""); setSelApplicationId(""); }, [selCategoryId]);
  useEffect(() => { setSelApplicationId(""); }, [selServiceNameId]);

  const handleAddService = () => {
    if (!selApplicationId || !applications) return;
    const app = applications.find((a) => a.id === selApplicationId);
    if (!app) return;
    if (services.some((s) => s.serviceClientId === app.id)) {
      toast.error("Serviço já adicionado");
      return;
    }
    setServices((prev) => [...prev, {
      serviceClientId: app.id, name: app.name,
      quantity: 1, unitPrice: app.price, minPrice: app.min_price, maxPrice: app.price,
    }]);
    setSelApplicationId("");
  };

  const updateLine = (idx: number, field: string, value: number) => {
    setServices((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      if (field === "unitPrice") return { ...s, unitPrice: Math.max(s.minPrice, Math.min(s.maxPrice, value)) };
      if (field === "quantity") return { ...s, quantity: Math.max(1, value) };
      return s;
    }));
  };

  const removeService = (idx: number) => setServices((p) => p.filter((_, i) => i !== idx));
  const totalValue = services.reduce((sum, s) => sum + s.unitPrice * s.quantity, 0);
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleSave = async () => {
    if (!ownerId || !contactId) { toast.error("Selecione um contato"); return; }

    const { data: existing } = await supabase
      .from("crm_client" as any).select("id")
      .eq("contact_id", contactId).eq("is_active", true).maybeSingle();
    if (existing) { toast.error("Este contato já possui uma negociação ativa"); return; }

    setSaving(true);
    try {
      const { data: deal, error } = await supabase
        .from("crm_client" as any)
        .insert({
          user_id: ownerId, contact_id: contactId, stage, value: totalValue,
          priority, responsible_id: responsibleId || currentTeamMember?.id || null,
          notes: description || null,
        }).select("id").single();
      if (error) throw error;

      if (services.length > 0 && deal) {
        await supabase.from("crm_client_services" as any).insert(
          services.map((s) => ({
            crm_client_id: (deal as any).id, service_client_id: s.serviceClientId,
            service_name: s.name, quantity: s.quantity, unit_price: s.unitPrice, min_price: s.minPrice,
          }))
        );
      }

      queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
      toast.success("Negociação criada com sucesso!");
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1 text-xs md:text-sm h-8 md:h-9">
          <Plus className="w-4 h-4" /> Nova Negociação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
          <DialogTitle>Nova Negociação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-5 pb-2 nav-scrollbar">
          {/* Contato */}
          <div className="space-y-1.5">
            <Label>Contato *</Label>
            <ContactPicker value={contactId} onChange={(val) => setContactId(val || "")} placeholder="Buscar contato..." />
          </div>

          {/* Serviços */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/10 dark:bg-white/5">
            <Label className="text-sm font-medium">Serviços</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px]">Categoria</Label>
                <Select value={selCategoryId} onValueChange={setSelCategoryId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>{(categories || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Serviço</Label>
                <Select value={selServiceNameId} onValueChange={setSelServiceNameId} disabled={!selCategoryId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Serviço" /></SelectTrigger>
                  <SelectContent>{(serviceNames || []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Aplicação</Label>
                <Select value={selApplicationId} onValueChange={setSelApplicationId} disabled={!selServiceNameId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aplicação" /></SelectTrigger>
                  <SelectContent>{(applications || []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} — {fmt(a.price)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAddService} disabled={!selApplicationId}>
              <Plus className="w-3 h-3" /> Adicionar
            </Button>

            {/* Lista de serviços adicionados */}
            {services.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                {services.map((svc, idx) => (
                  <div key={idx} className="p-2.5 border rounded-md bg-background space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate flex-1">{svc.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeService(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
                        <Input
                          type="number" min={1} value={svc.quantity}
                          onChange={(e) => updateLine(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor Unit. (R$)</Label>
                        <Input
                          type="number" step="0.01" min={svc.minPrice} max={svc.maxPrice}
                          value={svc.unitPrice}
                          onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                        <span className="text-[9px] text-muted-foreground">
                          Mín: {fmt(svc.minPrice)}
                        </span>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Subtotal</Label>
                        <Input value={fmt(svc.unitPrice * svc.quantity)} disabled className="h-8 text-sm bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Total */}
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
              <Label>Etapa Inicial</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRM_STAGES.filter((s) => !TERMINAL_STAGES.includes(s)).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !contactId}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Criar Negociação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
