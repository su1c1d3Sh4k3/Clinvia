import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Modal de Nota de Conversa — texto interno anexado à conversa, visível só
 * para a equipe (nunca enviado ao cliente). Também usado para editar uma nota
 * existente (o texto anterior fica preservado em edited_from).
 */
interface AddNoteModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (text: string) => Promise<void> | void;
    /** Texto inicial (modo edição) */
    initialText?: string;
    isEditing?: boolean;
    isSaving?: boolean;
}

export function AddNoteModal({ open, onOpenChange, onSave, initialText = "", isEditing = false, isSaving = false }: AddNoteModalProps) {
    const [text, setText] = useState(initialText);

    useEffect(() => {
        if (open) setText(initialText);
    }, [open, initialText]);

    const handleSave = async () => {
        if (!text.trim()) return;
        await onSave(text.trim());
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <StickyNote className="w-5 h-5 text-purple-600" />
                        {isEditing ? "Editar nota" : "Adicionar nota"}
                    </DialogTitle>
                    <DialogDescription>
                        Nota interna anexada à conversa — visível apenas para a equipe, nunca é enviada ao cliente.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escreva a nota..."
                    rows={5}
                    className="resize-none"
                    autoFocus
                />
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!text.trim() || isSaving}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {isSaving ? "Salvando..." : isEditing ? "Salvar edição" : "Anexar nota"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
