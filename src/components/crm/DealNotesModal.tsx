import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CRMDeal } from "@/types/crm";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StickyNote, Plus, User } from "lucide-react";

interface DealNotesModalProps {
    deal: CRMDeal;
    trigger?: React.ReactNode;
}

export function DealNotesModal({ deal, trigger }: DealNotesModalProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [newNote, setNewNote] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const addNoteMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Usuário não autenticado");
            if (!newNote.trim()) return;

            // Get user name from team_members (fonte única de verdade)
            let userName = user.email;
            const { data: teamMember } = await supabase
                .from("team_members")
                .select("name")
                .eq("user_id", user.id)
                .single();

            if (teamMember?.name) {
                userName = teamMember.name;
            }

            const noteObject = {
                data: new Date().toISOString(),
                usuario: userName || "Usuário",
                nota: newNote.trim()
            };

            const currentNotes = Array.isArray(deal.notes)
                ? deal.notes
                : (typeof deal.notes === 'string' && (deal.notes as string).trim() !== ''
                    ? [{ data: deal.created_at || new Date().toISOString(), usuario: "Sistema/Automação", nota: deal.notes }]
                    : []);
            const updatedNotes = [...currentNotes, noteObject];

            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ notes: updatedNotes })
                .eq("id", deal.id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Nota adicionada com sucesso!");
            setNewNote("");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
        },
        onError: () => {
            toast.error("Erro ao adicionar nota");
        }
    });

    const handleSubmit = () => {
        if (!newNote.trim()) return;
        addNoteMutation.mutate();
    };

    // Normalizar notas (tratar registros antigos ou inserções de n8n/IA que salvaram como string pura)
    const normalizedNotes = Array.isArray(deal.notes)
        ? deal.notes
        : (typeof deal.notes === 'string' && (deal.notes as string).trim() !== ''
            ? [{ data: deal.created_at || new Date().toISOString(), usuario: "Sistema/Automação", nota: deal.notes }]
            : []);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <StickyNote className="h-4 w-4" />
                        Notas
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <StickyNote className="h-5 w-5" />
                        Notas da Negociação
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 mt-4">
                    <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-muted/20">
                        {normalizedNotes.length > 0 ? (
                            <div className="flex flex-col gap-4">
                                {[...normalizedNotes].reverse().map((note: any, idx) => (
                                    <div key={idx} className="flex flex-col gap-1 bg-background p-3 rounded-lg border shadow-sm">
                                        <div className="flex justify-between items-center text-xs text-muted-foreground border-b pb-1 mb-1">
                                            <div className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                <span className="font-medium">{note.usuario}</span>
                                            </div>
                                            <span>{note.data && !isNaN(new Date(note.data).getTime()) ? format(new Date(note.data), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Sem data"}</span>
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">{note.nota}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                                <StickyNote className="h-8 w-8 opacity-20" />
                                <p>Nenhuma nota adicionada ainda.</p>
                            </div>
                        )}
                    </ScrollArea>

                    <div className="flex flex-col gap-2">
                        <Textarea
                            placeholder="Digite sua nota aqui..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            className="min-h-[80px]"
                        />
                        <Button
                            onClick={handleSubmit}
                            disabled={!newNote.trim() || addNoteMutation.isPending}
                            className="self-end"
                        >
                            {addNoteMutation.isPending ? "Adicionando..." : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar Nota
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
