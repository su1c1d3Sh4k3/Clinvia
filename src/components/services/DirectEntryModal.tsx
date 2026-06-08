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
import { ServiceClient } from "@/types/services";

interface DirectEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  /** Default service_name_id for this direct category */
  serviceNameId: string;
  /** If set, edit mode */
  editItem?: ServiceClient | null;
}

export const DirectEntryModal = ({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  serviceNameId,
  editItem,
}: DirectEntryModalProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const isEdit = !!editItem;

  const defaultForm = {
    name: "",
    description: "",
    price: 0,
    min_price: 0,
    status: true,
    recurrence: true,
    expiry_months: 6,
    duration_minutes: null as number | null,
    professionals: [] as string[],
    commission_pct: 0,
  };

  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name: editItem.name,
          description: editItem.description || "",
          price: editItem.price,
          min_price: editItem.min_price,
          status: editItem.status,
          recurrence: editItem.recurrence,
          expiry_months: editItem.expiry_months,
          duration_minutes: editItem.duration_minutes,
          professionals: editItem.professionals || [],
          commission_pct: editItem.commission_pct,
        });
      } else {
        setForm(defaultForm);
      }
    }
  }, [open, editItem]);

  const handleSave = async () => {
    if (!ownerId || !form.name.trim()) return;
    setSaving(true);
    try {
      const data: any = {
        name: form.name.trim(),
        description: form.description || null,
        price: form.price,
        min_price: form.price === 0 ? 0 : form.min_price,
        status: form.status,
        recurrence: form.recurrence,
        expiry_months: form.expiry_months,
        duration_minutes: form.duration_minutes,
        professionals: form.professionals,
        commission_pct: form.commission_pct,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("services_client" as any)
          .update(data)
          .eq("id", editItem!.id);
        if (error) throw error;
        toast.success(`${categoryName} atualizada com sucesso`);
      } else {
        const { error } = await supabase
          .from("services_client" as any)
          .insert({
            ...data,
            user_id: ownerId,
            category_id: categoryId,
            service_name_id: serviceNameId,
          });
        if (error) throw error;
        toast.success(`${categoryName} adicionada com sucesso`);
      }

      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isFree = form.price === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar" : "Nova"} {categoryName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder={`Ex: ${categoryName === "Consultas" ? "Consulta Dermatológica" : "Avaliação Facial"}`}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor de Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setField("price", val);
                  if (val === 0) setField("min_price", 0);
                }}
              />
              {isFree && (
                <p className="text-xs text-green-600 font-medium">Gratuito</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className={isFree ? "text-muted-foreground" : ""}>
                Valor Mínimo (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_price}
                onChange={(e) => setField("min_price", parseFloat(e.target.value) || 0)}
                disabled={isFree}
                className={isFree ? "opacity-50" : ""}
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Retorno (meses)</Label>
              <Input
                type="number"
                value={form.expiry_months}
                onChange={(e) => setField("expiry_months", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tempo de Atendimento (min)</Label>
              <Input
                type="number"
                value={form.duration_minutes ?? ""}
                onChange={(e) =>
                  setField("duration_minutes", e.target.value ? parseInt(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Comissão (%)</Label>
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
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
