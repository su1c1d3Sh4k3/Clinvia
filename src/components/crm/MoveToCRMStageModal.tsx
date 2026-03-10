import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMStage } from "@/types/crm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

interface MoveToCRMStageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dealId: string;
    dealTitle: string;
    targetFunnelId: string;
    targetFunnelName: string;
    currentUserId: string;
    onMoved: () => void;
}

export function MoveToCRMStageModal({
    open,
    onOpenChange,
    dealId,
    dealTitle,
    targetFunnelId,
    targetFunnelName,
    currentUserId,
    onMoved,
}: MoveToCRMStageModalProps) {
    const queryClient = useQueryClient();
    const [selectedStageId, setSelectedStageId] = useState("");

    const { data: stages = [] } = useQuery({
        queryKey: ["crm-stages", targetFunnelId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", targetFunnelId)
                .order("position", { ascending: true });
            if (error) throw error;
            return data as unknown as CRMStage[];
        },
        enabled: open && !!targetFunnelId,
    });

    const moveMutation = useMutation({
        mutationFn: async () => {
            if (!selectedStageId) throw new Error("Selecione uma etapa");

            const { error } = await supabase
                .from("crm_deals" as any)
                .update({
                    funnel_id: targetFunnelId,
                    stage_id: selectedStageId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", dealId);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success(`Negociação movida para "${targetFunnelName}"`);
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            onOpenChange(false);
            onMoved();
        },
        onError: (err: any) => {
            toast.error("Erro ao mover negociação: " + err.message);
        },
    });

    const handleConfirm = () => {
        if (!selectedStageId) {
            toast.error("Selecione uma etapa de destino");
            return;
        }
        moveMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5" />
                        Mover para "{targetFunnelName}"
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Selecione a etapa de destino para <strong>{dealTitle}</strong>:
                    </p>
                    <div className="space-y-1.5">
                        <Label>Etapa de destino</Label>
                        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma etapa..." />
                            </SelectTrigger>
                            <SelectContent>
                                {stages.map((stage) => (
                                    <SelectItem key={stage.id} value={stage.id}>
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="w-2 h-2 rounded-full inline-block"
                                                style={{ backgroundColor: stage.color }}
                                            />
                                            {stage.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedStageId || moveMutation.isPending}
                    >
                        {moveMutation.isPending ? "Movendo..." : "Confirmar Mover"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
