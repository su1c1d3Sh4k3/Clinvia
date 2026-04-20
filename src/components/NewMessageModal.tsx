import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { User } from "lucide-react";

interface PrefilledContact {
    id: string;
    push_name?: string | null;
    number?: string | null;
    phone?: string | null;
}

interface NewMessageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prefilledPhone?: string;
    prefilledContact?: PrefilledContact | null;
}

export const NewMessageModal = ({ open, onOpenChange, prefilledPhone, prefilledContact }: NewMessageModalProps) => {
    const [selectedInstance, setSelectedInstance] = useState("");
    const [number, setNumber] = useState(prefilledPhone || "55");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);
    const { toast } = useToast();
    const { data: ownerId } = useOwnerId();

    // Pre-populate from prefilledContact whenever modal opens or contact changes
    useEffect(() => {
        if (open && prefilledContact) {
            setSelectedContact(prefilledContact.id);
            const phone = prefilledContact.number?.split('@')[0] || prefilledContact.phone || "55";
            setNumber(phone);
        } else if (!open) {
            // Reset state when modal closes
            setSelectedContact(null);
            setNumber("55");
            setMessage("");
            setSelectedInstance("");
        }
    }, [open, prefilledContact]);

    // Fetch contacts


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
        if (!selectedInstance || !number || !message) {
            toast({
                title: "Campos obrigatórios",
                description: "Preencha todos os campos para enviar.",
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
            // 1. Send Message via UZAPI API
            // UZAPI usa endpoint diferente do Evolution API
            const response = await fetch(`https://clinvia.uazapi.com/send/text`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "token": instance.apikey || "",
                },
                body: JSON.stringify({
                    number: number,
                    text: message,
                }),
            });

            if (!response.ok) {
                const errorData = await response.text();
                // Check if it's a 400 error (likely invalid number)
                if (response.status === 400) {
                    throw new Error("Número inválido ou não registrado no WhatsApp.");
                }
                throw new Error(`Falha ao enviar: ${errorData}`);
            }

            const apiData = await response.json();

            // 2. Handle Database Updates
            const remoteJid = `${number}@s.whatsapp.net`;

            // Use ownerId from hook for multi-tenancy
            if (!ownerId) {
                throw new Error("Usuário não autenticado");
            }

            // 2.1 Find or Create Contact
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
                        push_name: number, // Use number as initial name
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (contactError) throw contactError;
                contact = newContact;
            }

            if (!contact) throw new Error("Falha ao criar contato");

            // 2.2 Check for existing active conversation (BLOCKING)
            const activeConv = await checkActiveConversation(contact.id);

            if (activeConv) {
                // Use existing conversation - don't create new one
                // If assigned to another agent, just inform (but still use the conversation)
                if (activeConv.agent_name) {
                    toast({
                        title: "Cliente já em atendimento",
                        description: `Este cliente já está sendo atendido por ${activeConv.agent_name}.`,
                    });
                }
                // Use the existing conversation
                var conversation = { id: activeConv.id } as any;
            } else {
                // No active conversation - create new one as OPEN + assigned to current agent
                // Get current authenticated user
                const { data: { user: currentUser } } = await supabase.auth.getUser();

                if (!currentUser) {
                    throw new Error("Usuário não autenticado");
                }

                // Get team_member to use correct ID
                const { data: teamMember } = await supabase
                    .from("team_members")
                    .select("id")
                    .eq("auth_user_id", currentUser.id)
                    .single();

                if (!teamMember) {
                    throw new Error("Team member não encontrado");
                }

                const { data: newConversation, error: conversationError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contact.id,
                        status: "open", // Agent-initiated = open
                        assigned_agent_id: teamMember.id, // Assign to current agent
                        unread_count: 0,
                        last_message_at: new Date().toISOString(),
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (conversationError) throw conversationError;
                console.log("Created new conversation as 'open':", newConversation.id, "- Assigned to:", teamMember.id);
                var conversation = newConversation as any;
            }

            if (!conversation) throw new Error("Falha ao criar conversa");

            // 2.3 Insert Message
            const { error: messageError } = await supabase
                .from("messages")
                .insert({
                    conversation_id: conversation.id,
                    body: message,
                    direction: "outbound",
                    message_type: "text",
                    evolution_id: apiData?.key?.id || null,
                    user_id: ownerId,
                });

            if (messageError) throw messageError;

            toast({ title: "Mensagem enviada com sucesso!" });
            onOpenChange(false);
            setSelectedInstance("");
            setSelectedContact(null);
            setNumber("55");
            setMessage("");
        } catch (error: any) {
            console.error("Erro ao enviar mensagem:", error);
            toast({
                title: "Erro ao enviar",
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
                    <DialogTitle>Nova Mensagem</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Instância</Label>
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
                        {prefilledContact ? (
                            // Contact locked — show read-only display
                            <div className="flex items-center gap-2 h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium truncate">
                                    {prefilledContact.push_name || prefilledContact.phone || prefilledContact.number?.split('@')[0] || "Contato"}
                                </span>
                            </div>
                        ) : (
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
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input
                            value={formatPhoneNumber(number)}
                            onChange={(e) => {
                                const value = unformatPhoneNumber(e.target.value);
                                setNumber(value.slice(0, 13));
                            }}
                            placeholder="+55 (37) 9 9999-9999"
                            type="tel"
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            Formato: +55 (DDD) 9 XXXX-XXXX
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Mensagem</Label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Digite sua mensagem..."
                            rows={4}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSend} disabled={isLoading}>
                        {isLoading ? "Enviando..." : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
