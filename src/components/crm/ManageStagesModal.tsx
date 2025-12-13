import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMStage } from "@/types/crm";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Settings, Plus, Trash2, GripVertical, Clock } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface ManageStagesModalProps {
    funnelId: string;
}

export function ManageStagesModal({ funnelId }: ManageStagesModalProps) {
    const [open, setOpen] = useState(false);
    const [newStageName, setNewStageName] = useState("");
    const [newStageStagnation, setNewStageStagnation] = useState("0");
    const queryClient = useQueryClient();

    const { data: stages, isLoading } = useQuery({
        queryKey: ["crm-stages", funnelId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", funnelId)
                .order("position", { ascending: true });

            if (error) throw error;
            return data as unknown as CRMStage[];
        },
        enabled: open && !!funnelId,
    });

    const addStageMutation = useMutation({
        mutationFn: async (name: string) => {
            // Calculate next position (before system stages)
            const systemStages = stages?.filter(s => s.is_system) || [];
            const customStages = stages?.filter(s => !s.is_system) || [];
            const nextPosition = customStages.length;

            if (customStages.length >= 10) {
                throw new Error("Limite de 10 etapas atingido");
            }

            const { error } = await supabase
                .from("crm_stages" as any)
                .insert({
                    funnel_id: funnelId,
                    name,
                    position: nextPosition,
                    color: "#000000", // Default color
                    is_system: false,
                    stagnation_limit_days: parseInt(newStageStagnation) || 0
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });
            setNewStageName("");
            setNewStageStagnation("0");
            toast.success("Etapa adicionada!");
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao adicionar etapa");
        }
    });

    const deleteStageMutation = useMutation({
        mutationFn: async (stageId: string) => {
            const { error } = await supabase
                .from("crm_stages" as any)
                .delete()
                .eq("id", stageId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });
            toast.success("Etapa removida!");
        },
        onError: () => {
            toast.error("Erro ao remover etapa");
        }
    });

    const updatePositionsMutation = useMutation({
        mutationFn: async (updatedStages: CRMStage[]) => {
            // Update each stage position
            for (const stage of updatedStages) {
                await supabase
                    .from("crm_stages" as any)
                    .update({ position: stage.position })
                    .eq("id", stage.id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });
        }
    });

    const updateStageMutation = useMutation({
        mutationFn: async ({ id, color, stagnation_limit_days }: { id: string; color?: string; stagnation_limit_days?: number }) => {
            const updates: any = {};
            if (color !== undefined) updates.color = color;
            if (stagnation_limit_days !== undefined) updates.stagnation_limit_days = stagnation_limit_days;

            const { error } = await supabase
                .from("crm_stages" as any)
                .update(updates)
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });
            queryClient.invalidateQueries({ queryKey: ["crm-stages", funnelId] });
            toast.success("Etapa atualizada!");
        },
        onError: () => {
            toast.error("Erro ao atualizar etapa");
        }
    });

    // Nomes reservados para etapas da IA (não podem ser criados manualmente)
    const RESERVED_STAGE_NAMES = [
        "Cliente Novo (IA)",
        "Qualificado (IA)",
        "Agendado (IA)",
        "Atendimento Humano (IA)",
        "Follow Up (IA)",
        "Sem Contato (IA)",
        "Sem Interesse (IA)",
    ];

    const handleAddStage = () => {
        if (!newStageName.trim()) return;

        // Validar nome reservado
        if (RESERVED_STAGE_NAMES.some(name =>
            name.toLowerCase() === newStageName.toLowerCase()
        )) {
            toast.error("Este nome de etapa é reservado pelo sistema");
            return;
        }

        addStageMutation.mutate(newStageName);
    };

    const handleOnDragEnd = (result: any) => {
        if (!result.destination || !stages) return;

        const items = Array.from(stages);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Update positions locally
        const updatedItems = items.map((item, index) => ({
            ...item,
            position: index
        }));

        // Optimistic update could go here, but for now we just trigger mutation
        updatePositionsMutation.mutate(updatedItems);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Gerenciar Etapas</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2 mb-4 items-end">
                    <div className="flex-1">
                        <Label htmlFor="stage-name" className="text-xs mb-1 block">Nome</Label>
                        <Input
                            id="stage-name"
                            placeholder="Nome da nova etapa"
                            value={newStageName}
                            onChange={(e) => setNewStageName(e.target.value)}
                        />
                    </div>
                    <div className="w-24">
                        <Label htmlFor="stage-stagnation" className="text-xs mb-1 block">Estagnação (dias)</Label>
                        <Input
                            id="stage-stagnation"
                            type="number"
                            min="0"
                            max="30"
                            placeholder="Dias"
                            value={newStageStagnation}
                            onChange={(e) => setNewStageStagnation(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleAddStage} disabled={addStageMutation.isPending}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {isLoading ? (
                        <p className="text-center text-muted-foreground">Carregando...</p>
                    ) : (
                        <DragDropContext onDragEnd={handleOnDragEnd}>
                            <Droppable droppableId="stages">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                        {stages?.filter(s => !s.is_system).map((stage, index) => (
                                            <Draggable key={stage.id} draggableId={stage.id} index={index}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className="flex items-center justify-between p-3 bg-muted text-primary-foreground rounded-md"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div {...provided.dragHandleProps}>
                                                                <GripVertical className="h-4 w-4 text-primary-foreground/70 cursor-grab" />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="color"
                                                                    value={stage.color || "#000000"}
                                                                    onChange={(e) => updateStageMutation.mutate({ id: stage.id, color: e.target.value })}
                                                                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                                                                    title="Alterar cor da etapa"
                                                                />
                                                                <span className="text-sm font-medium">{stage.name}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/70">
                                                                        <Clock className={`h-4 w-4 ${stage.stagnation_limit_days && stage.stagnation_limit_days > 0 ? "text-yellow-500" : ""}`} />
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-60">
                                                                    <div className="space-y-2">
                                                                        <h4 className="font-medium leading-none">Estagnação</h4>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            Defina o limite de dias para considerar esta etapa estagnada (0-30).
                                                                        </p>
                                                                        <div className="flex items-center gap-2">
                                                                            <Input
                                                                                type="number"
                                                                                min="0"
                                                                                max="30"
                                                                                defaultValue={stage.stagnation_limit_days || 0}
                                                                                onChange={(e) => {
                                                                                    const val = parseInt(e.target.value);
                                                                                    if (!isNaN(val)) {
                                                                                        updateStageMutation.mutate({ id: stage.id, stagnation_limit_days: val });
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <span className="text-sm text-muted-foreground">dias</span>
                                                                        </div>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => deleteStageMutation.mutate(stage.id)}
                                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}

                    <div className="pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">Etapas do Sistema (Fixas)</p>
                        {stages?.filter(s => s.is_system).map((stage) => (
                            <div key={stage.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md opacity-70">
                                <span>{stage.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
