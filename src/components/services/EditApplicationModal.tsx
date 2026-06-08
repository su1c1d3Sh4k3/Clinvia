import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ProfessionalSelector } from "./ProfessionalSelector";
import { ServiceClient } from "@/types/services";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface EditApplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: ServiceClient | null;
}

export const EditApplicationModal = ({
  open,
  onOpenChange,
  application,
}: EditApplicationModalProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [applyProfToAll, setApplyProfToAll] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: 0,
    min_price: 0,
    status: true,
    expiry_months: 6,
    recurrence: true,
    session_interval: null as number | null,
    professionals: [] as string[],
    commission_pct: 0,
  });

  useEffect(() => {
    if (application) {
      setForm({
        name: application.name,
        description: application.description || "",
        price: application.price,
        min_price: application.min_price,
        status: application.status,
        expiry_months: application.expiry_months,
        recurrence: application.recurrence,
        session_interval: application.session_interval,
        professionals: application.professionals || [],
        commission_pct: application.commission_pct,
      });
      setApplyProfToAll(false);
    }
  }, [application]);

  const handleSave = async () => {
    if (!application) return;
    setSaving(true);
    try {
      const updateData: any = {
        name: form.name,
        description: form.description || null,
        price: form.price,
        min_price: form.min_price,
        status: form.status,
        expiry_months: form.expiry_months,
        recurrence: form.recurrence,
        session_interval: form.session_interval,
        professionals: form.professionals,
        commission_pct: form.commission_pct,
      };

      const { error } = await supabase
        .from("services_client" as any)
        .update(updateData)
        .eq("id", application.id);

      if (error) throw error;

      // Commission is per-service: update all applications of same service
      if (form.commission_pct !== application.commission_pct) {
        await supabase
          .from("services_client" as any)
          .update({ commission_pct: form.commission_pct })
          .eq("user_id", application.user_id)
          .eq("service_name_id", application.service_name_id);
      }

      // Apply professionals to all applications of this service if checked
      if (applyProfToAll) {
        await supabase
          .from("services_client" as any)
          .update({ professionals: form.professionals })
          .eq("user_id", application.user_id)
          .eq("service_name_id", application.service_name_id);
      }

      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      toast.success("Aplicação atualizada com sucesso");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Aplicação</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Row 1: Name */}
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>

          {/* Row 2: Description */}
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
            />
          </div>

          {/* Row 3: Price / Min Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor de Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setField("price", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Mínimo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_price}
                onChange={(e) => setField("min_price", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Row 4: Status / Expiry */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {form.status ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  checked={form.status}
                  onCheckedChange={(v) => setField("status", v)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento (meses)</Label>
              <Input
                type="number"
                value={form.expiry_months}
                onChange={(e) => setField("expiry_months", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Row 5: Recurrence / Session Interval */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Recorrência</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {form.recurrence ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  checked={form.recurrence}
                  onCheckedChange={(v) => setField("recurrence", v)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo entre Sessões (dias)</Label>
              <Input
                type="number"
                value={form.session_interval ?? ""}
                onChange={(e) =>
                  setField(
                    "session_interval",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
              />
            </div>
          </div>

          {/* Row 6: Commission */}
          <div className="space-y-1.5">
            <Label>Comissão do Serviço (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.commission_pct}
              onChange={(e) => setField("commission_pct", parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              A comissão é aplicada a todas as aplicações deste serviço.
            </p>
          </div>

          {/* Row 7: Professionals */}
          <div className="space-y-1.5">
            <Label>Profissionais</Label>
            <ProfessionalSelector
              selected={form.professionals}
              onChange={(ids) => setField("professionals", ids)}
              showApplyToAll
              applyToAll={applyProfToAll}
              onApplyToAllChange={setApplyProfToAll}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
