import { Pencil, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Bolha roxa de Nota de Conversa — nota interna, nunca enviada ao cliente.
 * Mesmo design de uma mensagem enviada pelo usuário, com título
 * "Nota de Conversa - <autor> - <data_hora>". Notas nunca são apagadas;
 * quando editadas, mostram "editado de <início do texto anterior>..." com o
 * texto completo anterior no hover.
 */
interface NoteBubbleProps {
    note: {
        title: string;
        body?: string | null;
        description?: string | null;
        edited_from?: string | null;
        created_at: string;
    };
    onEdit?: () => void;
    isMobile?: boolean;
}

export const NoteBubble = ({ note, onEdit, isMobile = false }: NoteBubbleProps) => {
    const text = note.body ?? note.description ?? "";
    const editedPreview = note.edited_from
        ? note.edited_from.length > 40
            ? `${note.edited_from.slice(0, 40)}...`
            : note.edited_from
        : null;

    return (
        <div className={cn("group relative flex items-end gap-1 min-w-0", isMobile ? "max-w-[calc(100%-3rem)]" : "max-w-[70%]")}>
            {onEdit && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 self-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[#6d5f8d] hover:text-[#5e5279]"
                    onClick={onEdit}
                    title="Editar nota"
                >
                    <Pencil className="w-3.5 h-3.5" />
                </Button>
            )}
            <div className="flex flex-col gap-0 rounded-lg p-3 overflow-hidden min-w-0 break-words shadow-sm bg-[#6d5f8d] text-white">
                <p className="text-xs font-bold mb-1 flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 shrink-0" />
                    {note.title}
                </p>
                <p className="text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{text}</p>
                {editedPreview && (
                    <p
                        className="text-[11px] italic text-white/70 mt-1 cursor-help"
                        title={note.edited_from || undefined}
                    >
                        editado de "{editedPreview}"
                    </p>
                )}
                <span className="text-xs mt-1 flex items-center gap-1 text-white/70 justify-end">
                    {new Date(note.created_at || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
            </div>
        </div>
    );
};
