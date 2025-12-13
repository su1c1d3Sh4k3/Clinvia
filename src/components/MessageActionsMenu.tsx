import { useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Reply, Trash2, Pencil, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
    id: string;
    evolution_id?: string | null;
    body?: string | null;
    direction: "inbound" | "outbound";
    sender_name?: string | null;
}

interface MessageActionsMenuProps {
    message: Message;
    onReply: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (message: Message) => void;
    onReact: (message: Message) => void;
    className?: string;
}

export function MessageActionsMenu({
    message,
    onReply,
    onEdit,
    onDelete,
    onReact,
    className,
}: MessageActionsMenuProps) {
    const [open, setOpen] = useState(false);
    const isOutbound = message.direction === "outbound";

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-white/20",
                        className
                    )}
                >
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOutbound ? "end" : "start"} className="w-48">
                {/* Responder - disponível para todas as mensagens */}
                <DropdownMenuItem
                    onClick={() => {
                        onReply(message);
                        setOpen(false);
                    }}
                    className="cursor-pointer"
                >
                    <Reply className="mr-2 h-4 w-4" />
                    Responder
                </DropdownMenuItem>

                {/* Opções para mensagens enviadas (outbound) */}
                {isOutbound && (
                    <>
                        <DropdownMenuItem
                            onClick={() => {
                                onEdit(message);
                                setOpen(false);
                            }}
                            className="cursor-pointer"
                        >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar mensagem
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                onDelete(message);
                                setOpen(false);
                            }}
                            className="cursor-pointer text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Apagar para todos
                        </DropdownMenuItem>
                    </>
                )}

                {/* Reagir - disponível para mensagens recebidas (inbound) */}
                {!isOutbound && (
                    <DropdownMenuItem
                        onClick={() => {
                            onReact(message);
                            setOpen(false);
                        }}
                        className="cursor-pointer"
                    >
                        <Smile className="mr-2 h-4 w-4" />
                        Reagir
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
