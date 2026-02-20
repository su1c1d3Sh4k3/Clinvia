import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface FavoriteMessagesModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
}

export function FavoriteMessagesModal({ open, onOpenChange, conversationId }: FavoriteMessagesModalProps) {
    const [messages, setMessages] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (open && conversationId) {
            loadFavorites();
        }
    }, [open, conversationId]);

    const loadFavorites = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .eq("is_favorite", true)
                .order("created_at", { ascending: false });

            if (error) throw error;
            setMessages(data || []);
        } catch (error) {
            console.error("Error loading favorite messages:", error);
            toast.error("Erro ao carregar mensagens favoritas");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveFavorite = async (messageId: string) => {
        try {
            const { error } = await supabase
                .from("messages")
                .update({ is_favorite: false })
                .eq("id", messageId);

            if (error) throw error;

            setMessages(prev => prev.filter(m => m.id !== messageId));
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            toast.success("Removido dos favoritos");
        } catch (error) {
            console.error("Error removing favorite:", error);
            toast.error("Erro ao remover dos favoritos");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                        Mensagens Favoritas
                    </DialogTitle>
                    <DialogDescription>
                        Mensagens marcadas como favoritas nesta conversa.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden p-6 pt-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            Carregando...
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                            <Star className="w-8 h-8 opacity-20" />
                            <p>Nenhuma mensagem favorita encontrada</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-full pr-4">
                            <div className="flex flex-col gap-4 pb-4">
                                {messages.map((msg) => (
                                    <div key={msg.id} className="bg-muted/50 rounded-lg p-3 group relative border text-sm">
                                        <div className="flex justify-between items-start mb-1 gap-4">
                                            <span className="font-medium text-xs text-muted-foreground">
                                                {msg.sender_name || (msg.direction === 'outbound' ? 'Você' : 'Contato')}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/70 shrink-0">
                                                {msg.created_at ? format(new Date(msg.created_at), "dd MMM HH:mm", { locale: ptBR }) : ''}
                                            </span>
                                        </div>

                                        <div className="break-words mt-1">
                                            {msg.body || (msg.media_url ? '[Mídia]' : '')}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-destructive hover:text-destructive-foreground z-10"
                                            onClick={() => handleRemoveFavorite(msg.id)}
                                            title="Remover dos favoritos"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
