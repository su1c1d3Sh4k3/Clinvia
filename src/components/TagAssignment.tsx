import { useState } from "react";
import { Tag as TagIcon, Plus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface TagAssignmentProps {
    contactId?: string;
    open?: boolean;
    onClose?: () => void;
}

export const TagAssignment = ({ contactId, open: externalOpen, onClose }: TagAssignmentProps) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Use external open state if provided, otherwise use internal
    const open = externalOpen !== undefined ? externalOpen : internalOpen;
    const setOpen = onClose ? onClose : setInternalOpen;

    // Fetch all available tags for the user
    const { data: allTags } = useQuery({
        queryKey: ["tags"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags")
                .select("*")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // Fetch assigned tags for the contact
    const { data: assignedTags } = useQuery({
        queryKey: ["contact-tags", contactId],
        queryFn: async () => {
            if (!contactId) return [];
            const { data, error } = await supabase
                .from("contact_tags")
                .select("tag_id, tags(*)")
                .eq("contact_id", contactId);

            if (error) throw error;
            return data.map(item => item.tags);
        },
        enabled: !!contactId,
    });

    const assignTagMutation = useMutation({
        mutationFn: async (tagId: string) => {
            if (!contactId) throw new Error("No contact selected");
            const { error } = await supabase
                .from("contact_tags")
                .insert({ contact_id: contactId, tag_id: tagId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contact-tags", contactId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] }); // Refresh list to show new tags
            toast({ title: "Tag atribuída com sucesso" });
        },
        onError: (error) => {
            toast({
                title: "Erro ao atribuir tag",
                description: error.message,
                variant: "destructive"
            });
        },
    });

    const removeTagMutation = useMutation({
        mutationFn: async (tagId: string) => {
            if (!contactId) throw new Error("No contact selected");
            const { error } = await supabase
                .from("contact_tags")
                .delete()
                .eq("contact_id", contactId)
                .eq("tag_id", tagId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contact-tags", contactId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            toast({ title: "Tag removida com sucesso" });
        },
        onError: (error) => {
            toast({
                title: "Erro ao remover tag",
                description: error.message,
                variant: "destructive"
            });
        },
    });

    const availableTags = allTags?.filter(
        tag => !assignedTags?.some(assigned => assigned?.id === tag.id)
    ) || [];

    return (
        <Popover open={open} onOpenChange={(isOpen) => {
            if (!isOpen && onClose) {
                onClose();
            } else if (!onClose) {
                setInternalOpen(isOpen);
            }
        }}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="flex-1"
                    title="Atribuir Tag"
                    disabled={!contactId}
                >
                    <TagIcon className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
                <div className="space-y-2">
                    <h4 className="font-medium text-sm leading-none mb-2">Tags do Cliente</h4>

                    <div className="mb-2">
                        <Command>
                            <CommandInput placeholder="Buscar tag..." className="h-8 text-xs" />
                            <CommandList>
                                <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
                                <CommandGroup heading="Disponíveis">
                                    {availableTags.map((tag) => (
                                        <CommandItem
                                            key={tag.id}
                                            onSelect={() => {
                                                assignTagMutation.mutate(tag.id);
                                            }}
                                            className="text-xs cursor-pointer"
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full mr-2"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                            {tag.name}
                                            <Plus className="ml-auto h-3 w-3 opacity-50" />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </div>

                    {/* Assigned Tags List */}
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                        {assignedTags?.length === 0 && (
                            <span className="text-xs text-muted-foreground">Nenhuma tag atribuída</span>
                        )}
                        {assignedTags?.map((tag: any) => (
                            <Badge
                                key={tag.id}
                                variant="secondary"
                                className="text-xs flex items-center gap-1 pr-1"
                                style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color }}
                            >
                                {tag.name}
                                <button
                                    onClick={() => removeTagMutation.mutate(tag.id)}
                                    className="hover:bg-destructive/10 rounded-full p-0.5 transition-colors"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
