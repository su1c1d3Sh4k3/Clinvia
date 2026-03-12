import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Image, Link2, Files, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ConversationMediaModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    onJumpToMessage?: (messageId: string) => void;
}

const FILE_CONFIG: Record<string, { iconUrl: string; label: string }> = {
    pdf:  { iconUrl: '/assets/file-icons/pdf.png',  label: 'PDF' },
    doc:  { iconUrl: '/assets/file-icons/doc.png',  label: 'Word' },
    docx: { iconUrl: '/assets/file-icons/doc.png',  label: 'Word' },
    xls:  { iconUrl: '/assets/file-icons/xls.png',  label: 'Excel' },
    xlsx: { iconUrl: '/assets/file-icons/xls.png',  label: 'Excel' },
    ppt:  { iconUrl: '/assets/file-icons/ppt.png',  label: 'PowerPoint' },
    pptx: { iconUrl: '/assets/file-icons/ppt.png',  label: 'PowerPoint' },
    zip:  { iconUrl: '/assets/file-icons/zip.png',  label: 'ZIP' },
    txt:  { iconUrl: '/assets/file-icons/txt.png',  label: 'Texto' },
    jpg:  { iconUrl: '/assets/file-icons/jpg.png',  label: 'JPG' },
    jpeg: { iconUrl: '/assets/file-icons/jpg.png',  label: 'JPEG' },
    png:  { iconUrl: '/assets/file-icons/png.png',  label: 'PNG' },
    gif:  { iconUrl: '/assets/file-icons/gif.png',  label: 'GIF' },
    mp3:  { iconUrl: '/assets/file-icons/mp3.png',  label: 'MP3' },
    mpg:  { iconUrl: '/assets/file-icons/mpg.png',  label: 'MPG' },
    mpeg: { iconUrl: '/assets/file-icons/mpg.png',  label: 'MPEG' },
};

const MIME_TO_EXT: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'text/plain': 'txt',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
};

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

function getFileConfig(filename: string, mimetype?: string) {
    let ext = filename.split('.').pop()?.toLowerCase() || '';
    if (!ext && mimetype) ext = MIME_TO_EXT[mimetype] || '';
    return FILE_CONFIG[ext] || { iconUrl: '/assets/file-icons/default.png', label: 'Arquivo' };
}

function extractUrls(text?: string | null): string[] {
    if (!text) return [];
    return Array.from(text.matchAll(/(https?:\/\/[^\s]+)/gi)).map(m => m[0]);
}

function HighlightLinks({ text }: { text: string }) {
    const parts = text.split(/(https?:\/\/[^\s]+)/gi);
    return (
        <span className="text-sm break-words whitespace-pre-wrap">
            {parts.map((part, i) =>
                /^https?:\/\//i.test(part) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline break-all"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
}

export function ConversationMediaModal({ open, onOpenChange, conversationId, onJumpToMessage }: ConversationMediaModalProps) {
    const [images, setImages] = useState<any[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [links, setLinks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open && conversationId) {
            loadMedia();
        }
    }, [open, conversationId]);

    const loadMedia = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .eq("is_deleted", false)
                .in("message_type", ["image", "document", "text", "video"])
                .order("created_at", { ascending: false });

            if (error) throw error;

            const msgs = data || [];
            setImages(msgs.filter(m => m.message_type === 'image' && m.media_url));
            setDocuments(msgs.filter(m => m.message_type === 'document' && m.media_url));
            setLinks(msgs.filter(m => m.message_type === 'text' && extractUrls(m.body).length > 0));
        } catch (err) {
            console.error("Error loading media:", err);
            toast.error("Erro ao carregar mídia da conversa");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (url: string, filename: string) => {
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch {
            toast.error('Erro ao baixar arquivo');
        }
    };

    const handleJump = (messageId: string) => {
        onOpenChange(false);
        onJumpToMessage?.(messageId);
    };

    const renderEmpty = (icon: React.ReactNode, text: string) => (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <div className="opacity-20">{icon}</div>
            <p className="text-sm">{text}</p>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Files className="w-5 h-5 text-muted-foreground" />
                        Mídia da Conversa
                    </DialogTitle>
                    <DialogDescription>
                        Imagens, documentos e links compartilhados nesta conversa.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6 pt-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
                            Carregando...
                        </div>
                    ) : (
                        <Tabs defaultValue="images" className="flex flex-col flex-1 overflow-hidden">
                            <TabsList className="grid grid-cols-3 mb-3">
                                <TabsTrigger value="images" className="gap-1.5 text-xs">
                                    <Image className="w-3.5 h-3.5" />
                                    Imagens {images.length > 0 && <span className="text-muted-foreground">({images.length})</span>}
                                </TabsTrigger>
                                <TabsTrigger value="documents" className="gap-1.5 text-xs">
                                    <FileText className="w-3.5 h-3.5" />
                                    Documentos {documents.length > 0 && <span className="text-muted-foreground">({documents.length})</span>}
                                </TabsTrigger>
                                <TabsTrigger value="links" className="gap-1.5 text-xs">
                                    <Link2 className="w-3.5 h-3.5" />
                                    Links {links.length > 0 && <span className="text-muted-foreground">({links.length})</span>}
                                </TabsTrigger>
                            </TabsList>

                            {/* ── IMAGENS ── */}
                            <TabsContent value="images" className="flex-1 overflow-hidden mt-0">
                                {images.length === 0 ? (
                                    renderEmpty(<Image className="w-10 h-10" />, "Nenhuma imagem encontrada")
                                ) : (
                                    <ScrollArea className="h-full pr-2">
                                        <div className="flex flex-col gap-3 pb-2">
                                            {images.map((msg) => {
                                                const caption = msg.caption || (msg.body && msg.message_type === 'image' ? msg.body : null);
                                                const filename = msg.media_filename || msg.body || 'imagem';
                                                return (
                                                    <div key={msg.id} className="bg-muted/50 rounded-lg p-3 border flex gap-3 items-start cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleJump(msg.id)} title="Ir para a mensagem">
                                                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                                            <img
                                                                src={msg.media_url}
                                                                alt={filename}
                                                                className="w-14 h-14 object-cover rounded-md border"
                                                                onError={(e) => {
                                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        </a>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium truncate text-foreground">{filename}</p>
                                                            {caption && (
                                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{caption}</p>
                                                            )}
                                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                                {msg.created_at ? format(new Date(msg.created_at), "dd MMM HH:mm", { locale: ptBR }) : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                )}
                            </TabsContent>

                            {/* ── DOCUMENTOS ── */}
                            <TabsContent value="documents" className="flex-1 overflow-hidden mt-0">
                                {documents.length === 0 ? (
                                    renderEmpty(<FileText className="w-10 h-10" />, "Nenhum documento encontrado")
                                ) : (
                                    <ScrollArea className="h-full pr-2">
                                        <div className="flex flex-col gap-3 pb-2">
                                            {documents.map((msg) => {
                                                const filename = msg.media_filename || msg.body || 'documento';
                                                const caption = msg.caption;
                                                const config = getFileConfig(filename, msg.media_mimetype);
                                                return (
                                                    <div key={msg.id} className="bg-muted/50 rounded-lg p-3 border flex gap-3 items-start cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleJump(msg.id)} title="Ir para a mensagem">
                                                        <div className="shrink-0 w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded-md border">
                                                            <img
                                                                src={config.iconUrl}
                                                                alt={config.label}
                                                                className="w-8 h-8 object-contain"
                                                                onError={(e) => {
                                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium truncate text-foreground">{filename}</p>
                                                            {caption && (
                                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{caption}</p>
                                                            )}
                                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                                {msg.created_at ? format(new Date(msg.created_at), "dd MMM HH:mm", { locale: ptBR }) : ''}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="shrink-0 w-7 h-7 text-muted-foreground hover:text-foreground"
                                                            onClick={() => handleDownload(msg.media_url, filename)}
                                                            title="Baixar arquivo"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                )}
                            </TabsContent>

                            {/* ── LINKS ── */}
                            <TabsContent value="links" className="flex-1 overflow-hidden mt-0">
                                {links.length === 0 ? (
                                    renderEmpty(<Link2 className="w-10 h-10" />, "Nenhum link encontrado")
                                ) : (
                                    <ScrollArea className="h-full pr-2">
                                        <div className="flex flex-col gap-3 pb-2">
                                            {links.map((msg) => (
                                                <div key={msg.id} className="bg-muted/50 rounded-lg p-3 border text-sm cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleJump(msg.id)} title="Ir para a mensagem">
                                                    <div className="flex justify-between items-start mb-1.5 gap-4">
                                                        <span className="font-medium text-xs text-muted-foreground">
                                                            {msg.sender_name || (msg.direction === 'outbound' ? 'Você' : 'Contato')}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                                            {msg.created_at ? format(new Date(msg.created_at), "dd MMM HH:mm", { locale: ptBR }) : ''}
                                                        </span>
                                                    </div>
                                                    <HighlightLinks text={msg.body || ''} />
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
