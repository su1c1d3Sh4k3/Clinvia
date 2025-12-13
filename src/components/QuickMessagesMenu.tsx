import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Edit2, Trash2, Zap, Image as ImageIcon, Mic, Video, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface QuickMessage {
    id: string;
    shortcut: string;
    message_type: 'text' | 'image' | 'audio' | 'video';
    content: string | null;
    media_url: string | null;
}

export function QuickMessagesMenu() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<QuickMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'list' | 'create' | 'edit'>('list');

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [shortcut, setShortcut] = useState("");
    const [messageType, setMessageType] = useState<'text' | 'image' | 'audio' | 'video'>('text');
    const [content, setContent] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && user) {
            fetchMessages();
        }
    }, [isOpen, user]);

    const fetchMessages = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('quick_messages')
            .select('*')
            .eq('user_id', user?.id)
            .order('shortcut', { ascending: true });

        if (error) {
            toast.error("Erro ao carregar mensagens rápidas");
            console.error(error);
        } else {
            setMessages(data || []);
        }
        setLoading(false);
    };

    const resetForm = () => {
        setShortcut("");
        setMessageType('text');
        setContent("");
        setMediaFile(null);
        setExistingMediaUrl(null);
        setEditingId(null);
        setView('list');
    };

    const handleSave = async () => {
        if (!shortcut) {
            toast.error("O atalho é obrigatório");
            return;
        }

        if (messageType === 'text' && !content) {
            toast.error("O conteúdo do texto é obrigatório");
            return;
        }

        if (messageType !== 'text' && !mediaFile && !existingMediaUrl) {
            toast.error("O arquivo de mídia é obrigatório");
            return;
        }

        setLoading(true);
        let mediaUrl = existingMediaUrl;

        try {
            if (mediaFile) {
                const fileExt = mediaFile.name.split('.').pop();
                const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('quick-messages')
                    .upload(fileName, mediaFile);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage
                    .from('quick-messages')
                    .getPublicUrl(fileName);

                mediaUrl = data.publicUrl;
            }

            const messageData = {
                user_id: user?.id,
                shortcut: shortcut.toLowerCase(),
                message_type: messageType,
                content: content,
                media_url: mediaUrl
            };

            if (editingId) {
                const { error } = await supabase
                    .from('quick_messages')
                    .update(messageData)
                    .eq('id', editingId);
                if (error) throw error;
                toast.success("Mensagem atualizada!");
            } else {
                const { error } = await supabase
                    .from('quick_messages')
                    .insert(messageData);
                if (error) throw error;
                toast.success("Mensagem criada!");
            }

            fetchMessages();
            resetForm();
        } catch (error: any) {
            toast.error("Erro ao salvar mensagem: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir esta mensagem?")) return;

        setLoading(true);
        const { error } = await supabase
            .from('quick_messages')
            .delete()
            .eq('id', id);

        if (error) {
            toast.error("Erro ao excluir mensagem");
        } else {
            toast.success("Mensagem excluída");
            fetchMessages();
        }
        setLoading(false);
    };

    const handleEdit = (msg: QuickMessage) => {
        setEditingId(msg.id);
        setShortcut(msg.shortcut);
        setMessageType(msg.message_type as any);
        setContent(msg.content || "");
        setExistingMediaUrl(msg.media_url);
        setView('edit');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-yellow-500 hover:text-yellow-600 hover:bg-yellow-100/10">
                    <Zap className="w-5 h-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>Mensagens Rápidas</span>
                        {view === 'list' && (
                            <Button size="sm" onClick={() => setView('create')}>
                                <Plus className="w-4 h-4 mr-2" />
                                Nova
                            </Button>
                        )}
                        {view !== 'list' && (
                            <Button variant="ghost" size="sm" onClick={resetForm}>
                                Voltar
                            </Button>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {view === 'list' ? (
                    <ScrollArea className="h-[400px] pr-4">
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhuma mensagem rápida encontrada.
                                <br />
                                Crie uma para começar!
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {messages.map((msg) => (
                                    <div key={msg.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-primary">/{msg.shortcut}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
                                                    {msg.message_type === 'text' && <FileText className="w-3 h-3" />}
                                                    {msg.message_type === 'image' && <ImageIcon className="w-3 h-3" />}
                                                    {msg.message_type === 'audio' && <Mic className="w-3 h-3" />}
                                                    {msg.message_type === 'video' && <Video className="w-3 h-3" />}
                                                    {msg.message_type === 'text' ? 'Texto' :
                                                        msg.message_type === 'image' ? 'Imagem' :
                                                            msg.message_type === 'audio' ? 'Áudio' : 'Vídeo'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground truncate">
                                                {msg.content || (msg.media_url ? "Mídia anexada" : "Sem conteúdo")}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(msg)}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(msg.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                ) : (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Atalho (digite /atalho no chat)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">/</span>
                                <Input
                                    value={shortcut}
                                    onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                                    className="pl-6"
                                    placeholder="exemplo"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Tipo de Mensagem</Label>
                            <RadioGroup value={messageType} onValueChange={(v: any) => setMessageType(v)} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="text" id="text" />
                                    <Label htmlFor="text">Texto</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="image" id="image" />
                                    <Label htmlFor="image">Imagem</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="audio" id="audio" />
                                    <Label htmlFor="audio">Áudio</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="video" id="video" />
                                    <Label htmlFor="video">Vídeo</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {messageType === 'text' && (
                            <div className="space-y-2">
                                <Label>Mensagem</Label>
                                <Textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Digite a mensagem..."
                                    rows={5}
                                />
                            </div>
                        )}

                        {messageType !== 'text' && (
                            <div className="space-y-2">
                                <Label>Arquivo de Mídia</Label>
                                <Input
                                    type="file"
                                    accept={
                                        messageType === 'image' ? "image/*" :
                                            messageType === 'audio' ? "audio/*" :
                                                "video/*"
                                    }
                                    onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                                />
                                {existingMediaUrl && !mediaFile && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Arquivo atual: <a href={existingMediaUrl} target="_blank" className="underline">Ver arquivo</a>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={resetForm} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={loading}>
                                {loading ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
