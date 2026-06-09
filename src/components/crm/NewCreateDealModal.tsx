import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useAuth } from "@/hooks/useAuth";
import { ContactPicker } from "@/components/ui/contact-picker";
import { toast } from "sonner";
import { CRM_STAGES, TERMINAL_STAGES, CrmStage } from "@/types/crm-client";
import { ServiceCategory, ServiceName, ServiceClient } from "@/types/services";

interface ServiceLine {
  serviceClientId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  minPrice: number;
}

export const NewCreateDealModal = () => {
  const { user } = useAuth();
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contactId, setContactId] = useState("");
  const [stage, setStage] = useState<string>("Qualificado");
  const [services, setServices] = useState<ServiceLine[]>([]);

  // Service selection state
  const [selCategoryId, setSelCategoryId] = useState("");
  const [selServiceNameId, setSelServiceNameId] = useState("");
  const [selApplicationId, setSelApplicationId] = useState("");

  useEffect(() => {
    if (!open) {
      setContactId("");
      setStage("Qualificado");
      setServices([]);
      setSelCategoryId("");
      setSelServiceNameId("");
      setSelApplicationId("");
    }
  }, [open]);

  // Categories
  const { data: categories } = useQuery({
    queryKey: ["services-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services_category" as any).select("*").order("name");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });

  // Service names for selected category
  const { data: serviceNames } = useQuery({
    queryKey: ["service-names", selCategoryId],
    enabled: !!selCategoryId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_name" as any).select("*").eq("category_id", selCategoryId).order("name");
      if (error) throw error;
      return data as ServiceName[];
    },
  });

  // Applications (from services_client) for selected service name
  const { data: applications } = useQuery({
    queryKey: ["services-client-by-service", selServiceNameId],
    enabled: !!selServiceNameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_client" as any)
        .select("*")
        .eq("service_name_id", selServiceNameId)
        .eq("status", true)
        .order("name");
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
    setServices((prev) => [
      ...prev,
      {
        serviceClientId: app.id,
        name: app.name,
        quantity: 1,
        unitPrice: app.price,
        minPrice: app.min_price,
      },
    ]);
    setSelApplicationId("");
  };

  const updateServiceLine = (idx: number, field: string, value: any) => {
    setServices((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // Clamp price between min_price and original price
      if (field === "unitPrice") {
        updated.unitPrice = Math.max(updated.minPrice, Math.min(value, s.unitPrice >= value ? s.unitPrice : value));
      }
      return updated;
    }));
  };

  const removeService = (idx: number) => setServices((p) => p.filter((_, i) => i !== idx));

  const totalValue = services.reduce((sum, s) => sum + s.unitPrice * s.quantity, 0);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleSave = async () => {
    if (!ownerId || !contactId) {
      toast.error("Selecione um contato");
      return;
    }

    // Check if contact already has active deal
    const { data: existing } = await supabase
      .from("crm_client" as any)
      .select("id")
      .eq("contact_id", contactId)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      toast.error("Este contato já possui uma negociação ativa");
      return;
    }

    setSaving(true);
    try {
      const { data: deal, error } = await supabase
        .from("crm_client" as any)
        .insert({
          user_id: ownerId,
          contact_id: contactId,
          stage,
          value: totalValue,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Insert services
      if (services.length > 0 && deal) {
        const rows = services.map((s) => ({
          crm_client_id: (deal as any).id,
          service_client_id: s.serviceClientId,
          service_name: s.name,
          quantity: s.quantity,
          unit_price: s.unitPrice,
          min_price: s.minPrice,
        }));

        const { error: svcErr } = await supabase
          .from("crm_client_services" as any)
          .insert(rows);

        if (svcErr) console.warn("Service insert error:", svcErr);
      }

      queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
      toast.success("Negociação criada com sucesso");
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1 text-xs md:text-sm h-8 md:h-9">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Negociação</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Negociação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contact */}
          <div className="space-y-1.5">
            <Label>Contato</Label>
            <ContactPicker
              value={contactId}
              onChange={(val) => setContactId(val || "")}
              placeholder="Buscar contato..."
            />
          </div>

          {/* Stage */}
          <div className="space-y-1.5">
            <Label>Etapa Inicial</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_STAGES.filter((s) => !TERMINAL_STAGES.includes(s)).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service Selection: Category → Service → Application */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium">Serviços</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={selCategoryId} onValueChange={setSelCategoryId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    {(categories || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Serviço</Label>
                <Select value={selServiceNameId} onValueChange={setSelServiceNameId} disabled={!selCategoryId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Serviço" /></SelectTrigger>
                  <SelectContent>
                    {(serviceNames || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Aplicação</Label>
                <Select value={selApplicationId} onValueChange={setSelApplicationId} disabled={!selServiceNameId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aplicação" /></SelectTrigger>
                  <SelectContent>
                    {(applications || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {fmt(a.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAddService} disabled={!selApplicationId}>
              <Plus className="w-3 h-3" /> Adicionar Serviço
            </Button>

            {/* Added services list */}
            {services.length > 0 && (
              <div className="space-y-2 mt-2">
                {services.map((svc, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                    <span className="flex-1 truncate font-medium">{svc.name}</span>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px]">Qtd</Label>
                      <Input
                        type="number"
                        min={1}
                        value={svc.quantity}
                        onChange={(e) => updateServiceLine(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px]">R$</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={svc.minPrice}
                        max={svc.unitPrice}
                        value={svc.unitPrice}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updateServiceLine(idx, "unitPrice", Math.max(svc.minPrice, val));
                        }}
                        className="w-24 h-7 text-xs"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeService(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="text-right">
                  <Badge variant="secondary" className="text-sm">
                    Total: {fmt(totalValue)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !contactId}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Criar Negociação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
