import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useCreateTicket } from "@/hooks/useSupportChat";
import { SUPPORT_PRIORITY_CONFIG, SUPPORT_PRIORITY_ORDER, type SupportPriority } from "@/types/support";

interface NewTicketFormProps {
    senderName: string;
    onCreated: (ticketId: string) => void;
    onCancel: () => void;
}

export function NewTicketForm({ senderName, onCreated, onCancel }: NewTicketFormProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<SupportPriority>("medium");
    const createTicket = useCreateTicket();

    const handleSubmit = async () => {
        if (!title.trim() || !description.trim()) {
            toast.error("Preencha o assunto e o relato");
            return;
        }
        try {
            const ticket = await createTicket.mutateAsync({
                title: title.trim(),
                description: description.trim(),
                priority,
                creatorName: senderName,
            });
            toast.success("Chamado aberto! O suporte responde por aqui mesmo.");
            onCreated(ticket.id);
        } catch (error: any) {
            toast.error(error.message || "Não foi possível abrir o chamado");
        }
    };

    return (
        <div className="p-3 space-y-3">
            <div className="space-y-1.5">
                <Label htmlFor="ticket-title">Assunto</Label>
                <Input
                    id="ticket-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: WhatsApp desconectou sozinho"
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="ticket-priority">Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as SupportPriority)}>
                    <SelectTrigger id="ticket-priority">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORT_PRIORITY_ORDER.map((p) => (
                            <SelectItem key={p} value={p}>
                                {SUPPORT_PRIORITY_CONFIG[p].label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="ticket-body">O que está acontecendo?</Label>
                <Textarea
                    id="ticket-body"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva o problema com o máximo de detalhes: onde acontece, o que você esperava e o que apareceu."
                    rows={5}
                    className="resize-none"
                />
            </div>

            <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={onCancel} className="flex-1">
                    Cancelar
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={createTicket.isPending}
                    className="flex-1 bg-[#0175EC] hover:bg-[#0165cc] text-white"
                >
                    {createTicket.isPending ? "Abrindo..." : "Abrir chamado"}
                </Button>
            </div>
        </div>
    );
}
