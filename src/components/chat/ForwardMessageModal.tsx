import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOwnerId } from "@/hooks/useOwnerId";
import { checkActiveConversation } from "@/hooks/useActiveConversation";
import { ContactPicker } from "@/components/ui/contact-picker";
import { formatPhoneNumber, unformatPhoneNumber } from "@/utils/formatters";
import { useSendMessage } from "@/hooks/useSendMessage";

interface ForwardMessageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messageToForward: any | null;
}

export const ForwardMessageModal = ({ open, onOpenChange, messageToForward }: ForwardMessageModalProps) => {
    const [selectedInstance, setSelectedInstance] = useState("");
    const [number, setNumber] = useState("55");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);
    const { toast } = useToast();
    const { data: ownerId } = useOwnerId();
    const sendMessageMutation = useSendMessage();

    // Fetch connected instances
    const { data: instances } = useQuery({
        queryKey: ["connected-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .eq("status", "connected");

            if (error) throw error;
            return data;
        },
    });

    const handleSend = async () => {
        if (!selectedInstance || !number || !messageToForward) {
            toast({
                title: "Campos obrigatórios",
                description: "Selecione uma instância e um contato de destino.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        const instance = instances?.find(i => i.name === selectedInstance);

        if (!instance) {
            toast({ title: "Erro", description: "Instância não encontrada", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            const remoteJid = `${number}@s.whatsapp.net`;

            if (!ownerId) {
                throw new Error("Usuário não autenticado");
            }

            // Find or Create Contact
            let { data: contact } = await supabase
                .from("contacts")
                .select("*")
                .eq("number", remoteJid)
                .eq("user_id", ownerId)
                .single();

            if (!contact) {
                const { data: newContact, error: contactError } = await supabase
                    .from("contacts")
                    .insert({
                        number: remoteJid,
                        push_name: number,
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (contactError) throw contactError;
                contact = newContact;
            }

            if (!contact) throw new Error("Falha ao criar contato");

            // Check for existing active conversation
            const activeConv = await checkActiveConversation(contact.id);
            let conversationId;

            if (activeConv) {
                conversationId = activeConv.id;
            } else {
                // No active conversation - create new one
                const { data: { user: currentUser } } = await supabase.auth.getUser();

                if (!currentUser) throw new Error("Usuário não autenticado");

                const { data: teamMember } = await supabase
                    .from("team_members")
                    .select("id")
                    .eq("auth_user_id", currentUser.id)
                    .single();

                if (!teamMember) throw new Error("Team member não encontrado");

                const { data: newConversation, error: conversationError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contact.id,
                        status: "open",
                        assigned_agent_id: teamMember.id,
                        unread_count: 0,
                        last_message_at: new Date().toISOString(),
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (conversationError) throw conversationError;
                conversationId = newConversation.id;
            }

            if (!conversationId) throw new Error("Falha ao resolver conversa");

            // Dispatch message through our mutation with the forward flag
            await sendMessageMutation.mutateAsync({
                conversationId,
                contactId: contact.id,
                body: messageToForward.body || "",
                direction: "outbound",
                messageType: messageToForward.message_type || "text",
                mediaUrl: messageToForward.media_url || undefined,
                caption: messageToForward.caption || undefined,
                forward: true, // THE MAGIC FLAG
            });

            toast({ title: "Mensagem encaminhada com sucesso!" });
            onOpenChange(false);
            setNumber("55");
        } catch (error: any) {
            console.error("Erro ao encaminhar mensagem:", error);
            toast({
                title: "Erro ao encaminhar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Encaminhar Mensagem</DialogTitle>
                    <DialogDescription>
                        Selecione o destinatário para quem deseja enviar esta mensagem.
                    </DialogDescription>
                </DialogHeader>

                {messageToForward && (
                    <div className="bg-muted p-3 my-2 rounded-md border text-sm max-h-32 overflow-y-auto">
                        <span className="font-semibold text-xs text-muted-foreground block mb-1">Conteúdo:</span>
                        {messageToForward.body || (messageToForward.media_url ? '[Mídia]' : '')}
                    </div>
                )}

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Instância de Envio</Label>
                        <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma instância" />
                            </SelectTrigger>
                            <SelectContent>
                                {instances?.map((instance) => (
                                    <SelectItem key={instance.id} value={instance.name}>
                                        {instance.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 flex flex-col">
                        <Label>Selecionar contato</Label>
                        <ContactPicker
                            value={selectedContact || ""}
                            onChange={(val, contact) => {
                                setSelectedContact(val || null);
                                if (contact?.number) {
                                    setNumber(contact.number.split('@')[0]);
                                } else if (!val) {
                                    setNumber("");
                                }
                            }}
                            placeholder="Buscar contato..."
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Telefone (caso não esteja na lista)</Label>
                        <Input
                            value={formatPhoneNumber(number)}
                            onChange={(e) => {
                                const value = unformatPhoneNumber(e.target.value);
                                setNumber(value.slice(0, 13));
                            }}
                            placeholder="+55 (37) 9 9999-9999"
                            type="tel"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSend} disabled={isLoading}>
                        {isLoading ? "Encaminhando..." : "Encaminhar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
