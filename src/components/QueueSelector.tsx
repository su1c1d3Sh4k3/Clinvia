import { useState } from "react";
import { Check, ChevronsUpDown, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QueueSelectorProps {
    conversationId: string;
    currentQueueId?: string | null;
}

export function QueueSelector({ conversationId, currentQueueId }: QueueSelectorProps) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch active queues
    const { data: queues } = useQuery({
        queryKey: ["queues-active"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("id, name")
                .eq("is_active", true)
                .order("name");

            if (error) throw error;
            return data;
        },
    });

    // Mutation to update queue
    const updateQueue = useMutation({
        mutationFn: async (queueId: string | null) => {
            const { error } = await supabase
                .from("conversations")
                .update({ queue_id: queueId } as any) // Cast as any because type might not be updated yet
                .eq("id", conversationId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            toast({
                title: "Fila atualizada",
                description: "A conversa foi movida para a nova fila.",
            });
            setOpen(false);
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar fila",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const selectedQueue = queues?.find((q) => q.id === currentQueueId);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    size="sm"
                    className="justify-between"
                >
                    <ListOrdered className="mr-2 h-4 w-4" />
                    {selectedQueue ? selectedQueue.name : "Filas"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder="Buscar fila..." />
                    <CommandList>
                        <CommandEmpty>Nenhuma fila encontrada.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="none"
                                onSelect={() => updateQueue.mutate(null)}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        !currentQueueId ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                Sem Fila
                            </CommandItem>
                            {queues?.map((queue) => (
                                <CommandItem
                                    key={queue.id}
                                    value={queue.name}
                                    onSelect={() => updateQueue.mutate(queue.id)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            currentQueueId === queue.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {queue.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
