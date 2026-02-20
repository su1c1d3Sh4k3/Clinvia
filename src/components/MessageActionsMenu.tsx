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
    is_favorite?: boolean;
}

interface MessageActionsMenuProps {
    message: Message;
    onReply: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (message: Message) => void;
    onReact: (message: Message) => void;
    onCopy: (message: Message) => void;
    onToggleFavorite: (message: Message) => void;
    onForward: (message: Message) => void;
    className?: string;
}

export function MessageActionsMenu({
    message,
    onReply,
    onEdit,
    onDelete,
    onReact,
    onCopy,
    onToggleFavorite,
    onForward,
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
                {/* Helper Nativo de Copiar - Texto */}
                {(message.body && message.body.trim().length > 0) && (
                    <DropdownMenuItem
                        onClick={() => {
                            onCopy(message);
                            setOpen(false);
                        }}
                        className="cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4 lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                        Copiar
                    </DropdownMenuItem>
                )}

                {/* Favoritar */}
                <DropdownMenuItem
                    onClick={() => {
                        onToggleFavorite(message);
                        setOpen(false);
                    }}
                    className="cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={message.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("mr-2 h-4 w-4 lucide lucide-star", message.is_favorite && "text-yellow-500")}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {message.is_favorite ? 'Desfavoritar' : 'Favoritar'}
                </DropdownMenuItem>

                {/* Encaminhar */}
                <DropdownMenuItem
                    onClick={() => {
                        onForward(message);
                        setOpen(false);
                    }}
                    className="cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4 lucide lucide-forward"><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></svg>
                    Encaminhar
                </DropdownMenuItem>

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

                {/* Reagir - disponível para todas as mensagens */}
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
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
