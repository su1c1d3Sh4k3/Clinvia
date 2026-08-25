import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecurrenceTab, RecurrenceData, defaultRecurrenceData, hasInvalidRecurrenceVariables } from "./RecurrenceTab";
import { ServiceName } from "@/types/services";
import { supabase } from "@/integrations/supabase/client";
import { syncRecurrenceTemplates } from "@/lib/recurrenceTemplateSync";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface EditServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceName | null;
}

/**
 * Edição do SERVIÇO (service_name): dados + configuração de recorrência
 * (ativa, tempos, descontos e mensagens personalizadas — em branco usa o
 * template padrão da conta). Mensagem personalizada alterada em conta com
 * Meta ⇒ alerta de aprovação antes de salvar.
 */
export const EditServiceModal = ({ open, onOpenChange, service }: EditServiceModalProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showMetaAlert, setShowMetaAlert] = useState(false);

  const [form, setForm] = useState({ name: "", description: "", recurrence: false });
  const [recurrenceData, setRecurrenceData] = useState<RecurrenceData>(defaultRecurrenceData);

  useEffect(() => {
    if (service) {
      setForm({
        name: service.name,
        description: service.description || "",
        recurrence: service.recurrence ?? false,
      });
      setRecurrenceData({
        msg_recurrence_1: service.msg_recurrence_1 || "",
        msg_recurrence_2: service.msg_recurrence_2 || "",
        msg_recurrence_3: service.msg_recurrence_3 || "",
        time_recurrence_1: service.time_recurrence_1 ?? null,
        time_recurrence_2: service.time_recurrence_2 ?? null,
        time_recurrence_3: service.time_recurrence_3 ?? null,
        recurrence_discount_pct_1: service.recurrence_discount_pct_1 ?? null,
        recurrence_discount_pct_2: service.recurrence_discount_pct_2 ?? null,
        recurrence_discount_pct_3: service.recurrence_discount_pct_3 ?? null,
      });
    }
  }, [service]);

  const customMessagesChanged = () => {
    if (!service) return false;
    return ([1, 2, 3] as const).some((n) => {
      const before = ((service as any)[`msg_recurrence_${n}`] || "").trim();
      const after = ((recurrenceData as any)[`msg_recurrence_${n}`] || "").trim();
      return before !== after && after !== "";
    });
  };

  const handleSaveClick = async () => {
    if (!service) return;
    if (hasInvalidRecurrenceVariables(recurrenceData)) {
      toast.error("Mensagem de recorrência com variável desconhecida — use os botões de variáveis");
      return;
    }
    if (customMessagesChanged()) {
      // Alerta só se o tenant tem instância Meta conectada
      const { data } = await supabase
        .from("instances")
        .select("id")
        .eq("provider", "meta")
        .eq("status", "connected")
        .limit(1);
      if (data && data.length > 0) {
        setShowMetaAlert(true);
        return;
      }
    }
    doSave();
  };

  const doSave = async () => {
    if (!service) return;
    setShowMetaAlert(false);
    setSaving(true);
    try {
      const hadCustomChange = customMessagesChanged();
      const { error } = await supabase
        .from("service_name" as any)
        .update({
          name: form.name,
          description: form.description || null,
          recurrence: form.recurrence,
          msg_recurrence_1: recurrenceData.msg_recurrence_1.trim() || null,
          msg_recurrence_2: recurrenceData.msg_recurrence_2.trim() || null,
          msg_recurrence_3: recurrenceData.msg_recurrence_3.trim() || null,
          time_recurrence_1: recurrenceData.time_recurrence_1,
          time_recurrence_2: recurrenceData.time_recurrence_2,
          time_recurrence_3: recurrenceData.time_recurrence_3,
          recurrence_discount_pct_1: recurrenceData.recurrence_discount_pct_1,
          recurrence_discount_pct_2: recurrenceData.recurrence_discount_pct_2,
          recurrence_discount_pct_3: recurrenceData.recurrence_discount_pct_3,
        })
        .eq("id", service.id);
      if (error) throw error;

      // Template personalizado alterado → submete à Meta (fire-and-forget)
      if (hadCustomChange) {
        syncRecurrenceTemplates({ serviceNameIds: [service.id] });
      }

      queryClient.invalidateQueries({ queryKey: ["service-names-all"] });
      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      queryClient.invalidateQueries({ queryKey: ["recurrence-template-badges"] });
      toast.success("Serviço atualizado com sucesso");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="recurrence">Recorrência</TabsTrigger>
            </TabsList>

            <TabsContent value="dados">
              <div className="grid gap-4 py-4">
                <div className="space-y-1.5">
                  <Label>Nome do Serviço</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="recurrence" className="py-4 space-y-4">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label>Recorrência ativa</Label>
                  <p className="text-xs text-muted-foreground">
                    Vale para todas as aplicações deste serviço
                  </p>
                </div>
                <Switch
                  checked={form.recurrence}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, recurrence: v }))}
                />
              </div>
              <RecurrenceTab data={recurrenceData} onChange={setRecurrenceData} />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveClick} disabled={saving || !form.name}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showMetaAlert} onOpenChange={setShowMetaAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template será enviado para aprovação da Meta</AlertDialogTitle>
            <AlertDialogDescription>
              Você alterou uma mensagem personalizada de recorrência. Para instâncias da
              API oficial (Meta), o novo texto será submetido como template e só passa a
              ser usado após a aprovação. Enquanto isso, campanhas deste serviço podem
              ficar bloqueadas aguardando aprovação. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doSave}>Salvar e enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
