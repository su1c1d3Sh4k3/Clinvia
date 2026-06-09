import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TERMINAL_STAGES, CrmStage } from "@/types/crm-client";

const LOSS_REASONS = [
  { value: "price", label: "Preço" },
  { value: "competitor", label: "Concorrência" },
  { value: "timing", label: "Timing" },
  { value: "no_budget", label: "Sem orçamento" },
  { value: "no_need", label: "Sem necessidade" },
  { value: "no_response", label: "Sem resposta" },
  { value: "service_quality", label: "Qualidade do serviço" },
  { value: "other", label: "Outro" },
];

interface CloseNegotiationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onConfirm: () => void; // Called after CRM is handled, triggers resolve-ticket
}

export const CloseNegotiationModal = ({
  open,
  onOpenChange,
  contactId,
  onConfirm,
}: CloseNegotiationModalProps) => {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<string>("");
  const [lossReason, setLossReason] = useState("");
  const [lossReasonOther, setLossReasonOther] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!stage) return;
    setSaving(true);
    try {
      // Find active crm_client for this contact
      const { data: deal } = await supabase
        .from("crm_client" as any)
        .select("id")
        .eq("contact_id", contactId)
        .eq("is_active", true)
        .maybeSingle();

      if (deal) {
        const updateData: any = {
          stage,
          is_active: false,
        };

        if (stage === "Perdido") {
          updateData.loss_reason = lossReason || null;
          updateData.loss_reason_other = lossReasonOther || null;
        }

        await supabase
          .from("crm_client" as any)
          .update(updateData)
          .eq("id", (deal as any).id);
      }

      queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
      queryClient.invalidateQueries({ queryKey: ["crm-client-active"] });
      onOpenChange(false);
      onConfirm(); // Trigger resolve-ticket
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrar Negociação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Para qual etapa deseja mover o cliente?</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ganho">Ganho (venda realizada)</SelectItem>
                <SelectItem value="Perdido">Perdido (sem venda)</SelectItem>
                <SelectItem value="Finalizado">Finalizado (encerrar sem decisão)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {stage === "Perdido" && (
            <>
              <div className="space-y-1.5">
                <Label>Motivo da perda</Label>
                <Select value={lossReason} onValueChange={setLossReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LOSS_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lossReason === "other" && (
                <div className="space-y-1.5">
                  <Label>Descreva o motivo</Label>
                  <Textarea
                    value={lossReasonOther}
                    onChange={(e) => setLossReasonOther(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !stage}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
