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
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneNumber, unformatPhoneNumber } from "@/utils/formatters";
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

interface NewMessageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prefilledPhone?: string;
}

export const NewMessageModal = ({ open, onOpenChange, prefilledPhone }: NewMessageModalProps) => {
    const [selectedInstance, setSelectedInstance] = useState("");
    const [number, setNumber] = useState(prefilledPhone || "55");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [openCombobox, setOpenCombobox] = useState(false);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);
    const { toast } = useToast();
    const { data: ownerId } = useOwnerId();

    // Fetch contacts
    const { data: contacts } = useQuery({
        queryKey: ["contacts-select"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("contacts")
                .select("id, push_name, number")
                .not('number', 'ilike', '%@g.us') // Filter out groups
                .order("push_name");

            if (error) throw error;

            return data.map(contact => ({
                ...contact,
                // Extract phone from remote_jid (everything before @)
                phone: contact.number ? contact.number.split('@')[0] : ''
            }));
        },
    });

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
                // No active conversation - create new one
                const { data: newConversation, error: conversationError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contact.id,
                        status: "pending",
                        unread_count: 0,
                        last_message_at: new Date().toISOString(),
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (conversationError) throw conversationError;
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
                        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCombobox}
                                    className="w-full justify-between"
                                >
                                    {selectedContact
                                        ? contacts?.find((contact) => contact.id === selectedContact)?.push_name ||
                                        contacts?.find((contact) => contact.id === selectedContact)?.phone || "Contato selecionado"
                                        : "Nenhum"}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar contato..." />
                                    <CommandList>
                                        <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="nenhum"
                                                onSelect={() => {
                                                    setSelectedContact(null);
                                                    setNumber("");
                                                    setOpenCombobox(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        !selectedContact ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                Nenhum
                                            </CommandItem>
                                            {contacts?.map((contact) => (
                                                <CommandItem
                                                    key={contact.id}
                                                    value={contact.push_name || contact.phone || ""}
                                                    onSelect={() => {
                                                        setSelectedContact(contact.id);
                                                        if (contact.phone) {
                                                            setNumber(contact.phone);
                                                        }
                                                        setOpenCombobox(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            selectedContact === contact.id ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {contact.push_name || "Sem nome"}
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        ({contact.phone})
                                                    </span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
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
