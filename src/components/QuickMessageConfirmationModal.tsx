import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Image as ImageIcon, Mic, Video } from "lucide-react";

interface QuickMessage {
    id: string;
    shortcut: string;
    message_type: 'text' | 'image' | 'audio' | 'video';
    content: string | null;
    media_url: string | null;
}

interface QuickMessageConfirmationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    message: QuickMessage | null;
    onConfirm: () => void;
}

export function QuickMessageConfirmationModal({
    open,
    onOpenChange,
    message,
    onConfirm
}: QuickMessageConfirmationModalProps) {
    if (!message) return null;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Enviar Mensagem Rápida?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Você está prestes a enviar a seguinte mensagem rápida:
                    </AlertDialogDescription>

                    <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-primary">/{message.shortcut}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
                                {message.message_type === 'text' && <FileText className="w-3 h-3" />}
                                {message.message_type === 'image' && <ImageIcon className="w-3 h-3" />}
                                {message.message_type === 'audio' && <Mic className="w-3 h-3" />}
                                {message.message_type === 'video' && <Video className="w-3 h-3" />}
                                {message.message_type === 'text' ? 'Texto' :
                                    message.message_type === 'image' ? 'Imagem' :
                                        message.message_type === 'audio' ? 'Áudio' : 'Vídeo'}
                            </span>
                        </div>

                        {message.content && (
                            <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
                                {message.content}
                            </p>
                        )}

                        {message.media_url && (
                            <div className="mt-2">
                                {message.message_type === 'image' && (
                                    <img src={message.media_url} alt="Preview" className="max-h-32 rounded-md" />
                                )}
                                {message.message_type === 'audio' && (
                                    <audio controls src={message.media_url} className="w-full" />
                                )}
                                {message.message_type === 'video' && (
                                    <video controls src={message.media_url} className="max-h-32 rounded-md" />
                                )}
                            </div>
                        )}
                    </div>

                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Enviar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
