import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { useStaff } from "@/hooks/useStaff";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TaskBoardConfigModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    boardId?: string | null;
}

interface BoardFormValues {
    name: string;
    start_hour: number;
    end_hour: number;
    interval_minutes: number;
    allowed_agents: string[];
}

export function TaskBoardConfigModal({ open, onOpenChange, boardId }: TaskBoardConfigModalProps) {
    const queryClient = useQueryClient();
    const { data: staff } = useStaff();
    const { register, handleSubmit, reset, setValue, watch } = useForm<BoardFormValues>({
        defaultValues: {
            name: "",
            start_hour: 8,
            end_hour: 18,
            interval_minutes: 30,
            allowed_agents: [],
        },
    });

    const selectedAgents = watch("allowed_agents");

    // Fetch board details if editing
    const { data: board } = useQuery({
        queryKey: ["task-board", boardId],
        queryFn: async () => {
            if (!boardId) return null;
            const { data, error } = await supabase
                .from("task_boards")
                .select("*")
                .eq("id", boardId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!boardId && open,
    });

    useEffect(() => {
        if (board) {
            setValue("name", board.name);
            setValue("start_hour", board.start_hour);
            setValue("end_hour", board.end_hour);
            setValue("interval_minutes", board.interval_minutes);
            setValue("allowed_agents", board.allowed_agents || []);
        } else {
            reset({
                name: "",
                start_hour: 8,
                end_hour: 18,
                interval_minutes: 30,
                allowed_agents: [],
            });
        }
    }, [board, open, reset, setValue]);

    const mutation = useMutation({
        mutationFn: async (values: BoardFormValues) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            if (boardId) {
                const { error } = await supabase
                    .from("task_boards")
                    .update({ ...values })
                    .eq("id", boardId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("task_boards")
                    .insert({ ...values, user_id: user.id });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["task-boards"] });
            toast.success(boardId ? "Quadro atualizado!" : "Quadro criado!");
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error("Erro ao salvar quadro: " + error.message);
        },
    });

    const onSubmit = (data: BoardFormValues) => {
        mutation.mutate(data);
    };

    const toggleAgent = (agentId: string) => {
        const current = selectedAgents || [];
        const updated = current.includes(agentId)
            ? current.filter(id => id !== agentId)
            : [...current, agentId];
        setValue("allowed_agents", updated);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{boardId ? "Editar Quadro" : "Novo Quadro de Tarefas"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome do Quadro</Label>
                        <Input id="name" {...register("name", { required: true })} placeholder="Ex: Agenda Comercial" />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start_hour">Início (h)</Label>
                            <Input
                                id="start_hour"
                                type="number"
                                min="0"
                                max="23"
                                {...register("start_hour", { valueAsNumber: true })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end_hour">Fim (h)</Label>
                            <Input
                                id="end_hour"
                                type="number"
                                min="0"
                                max="23"
                                {...register("end_hour", { valueAsNumber: true })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="interval">Intervalo (min)</Label>
                            <Input
                                id="interval"
                                type="number"
                                min="10"
                                max="720"
                                step="5"
                                {...register("interval_minutes", { valueAsNumber: true })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Permitir Acesso (Funcionários)</Label>
                        <ScrollArea className="h-[150px] border rounded-md p-2">
                            <div className="space-y-2">
                                {staff?.map((agent) => (
                                    <div key={agent.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`agent-${agent.id}`}
                                            checked={selectedAgents?.includes(agent.id)}
                                            onCheckedChange={() => toggleAgent(agent.id)}
                                        />
                                        <Label htmlFor={`agent-${agent.id}`} className="cursor-pointer">
                                            {agent.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
