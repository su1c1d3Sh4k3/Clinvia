import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface EditMessageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messageBody: string;
    onSave: (newText: string) => Promise<void>;
}

export function EditMessageModal({
    open,
    onOpenChange,
    messageBody,
    onSave,
}: EditMessageModalProps) {
    const [text, setText] = useState(messageBody);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setText(messageBody);
    }, [messageBody]);

    const handleSave = async () => {
        if (!text.trim() || text === messageBody) return;

        setIsLoading(true);
        try {
            await onSave(text.trim());
            onOpenChange(false);
        } catch (error) {
            console.error("Error saving edited message:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Mensagem</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[100px] resize-none"
                        placeholder="Digite a nova mensagem..."
                        autoFocus
                    />
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || !text.trim() || text === messageBody}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            "Salvar"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
