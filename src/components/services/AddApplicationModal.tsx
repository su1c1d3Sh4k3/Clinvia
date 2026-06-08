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
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";

interface AddApplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  serviceNameId: string;
}

export const AddApplicationModal = ({
  open,
  onOpenChange,
  categoryId,
  serviceNameId,
}: AddApplicationModalProps) => {
  const queryClient = useQueryClient();
  const { data: ownerId } = useOwnerId();
  const [saving, setSaving] = useState(false);

  const defaultForm = {
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
  };

  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) setForm(defaultForm);
  }, [open]);

  const handleSave = async () => {
    if (!ownerId || !form.name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("services_client" as any)
        .insert({
          user_id: ownerId,
          category_id: categoryId,
          service_name_id: serviceNameId,
          name: form.name.trim(),
          description: form.description || null,
          price: form.price,
          min_price: form.min_price,
          status: form.status,
          expiry_months: form.expiry_months,
          recurrence: form.recurrence,
          session_interval: form.session_interval,
          professionals: form.professionals,
          commission_pct: form.commission_pct,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      toast.success("Aplicação adicionada com sucesso");
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
          <DialogTitle>Nova Aplicação</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Ex: BOTOX - FACE"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              placeholder="Descrição do procedimento..."
            />
          </div>

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
                  setField("session_interval", e.target.value ? parseInt(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Comissão do Serviço (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.commission_pct}
              onChange={(e) => setField("commission_pct", parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Profissionais</Label>
            <ProfessionalSelector
              selected={form.professionals}
              onChange={(ids) => setField("professionals", ids)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
