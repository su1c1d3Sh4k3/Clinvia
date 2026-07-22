import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import { Search, Send, FileText, Loader2 } from "lucide-react";

const SUPABASE_URL = "https://swfshqvvbohnahdyndch.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY";

async function callTemplateApi(body: any): Promise<any> {
    let token = SUPABASE_ANON_KEY;
    try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.access_token) token = session.access_token;
    } catch {}

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/meta-template-manage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Invalid response: ${text.substring(0, 200)}`);
    }
    if (!resp.ok || !data.success) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
}

interface TemplatePickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    instanceId: string;
    contactNumber: string;
    conversationId?: string;
}

export function TemplatePickerModal({ open, onOpenChange, instanceId, contactNumber, conversationId }: TemplatePickerModalProps) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const [search, setSearch] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [sendParams, setSendParams] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);

    const { data: templates, isLoading } = useQuery({
        queryKey: ["meta-templates-picker", instanceId],
        queryFn: async () => {
            if (!instanceId || !user?.id) return [];
            const data = await callTemplateApi({
                action: "list",
                user_id: user.id,
                instance_id: instanceId,
            });
            return (data.templates || []).filter((t: any) => t.status?.toUpperCase() === "APPROVED");
        },
        enabled: open && !!instanceId && !!user?.id,
    });

    const filtered = useMemo(() => {
        if (!templates) return [];
        if (!search.trim()) return templates;
        const q = search.toLowerCase();
        return templates.filter((t: any) =>
            t.name?.toLowerCase().includes(q) ||
            t.components?.find((c: any) => c.type === "BODY")?.text?.toLowerCase().includes(q)
        );
    }, [templates, search]);

    const getBodyText = (tpl: any): string => {
        return tpl?.components?.find((c: any) => c.type === "BODY")?.text || "";
    };

    const getHeaderText = (tpl: any): string => {
        return tpl?.components?.find((c: any) => c.type === "HEADER")?.text || "";
    };

    const getFooterText = (tpl: any): string => {
        return tpl?.components?.find((c: any) => c.type === "FOOTER")?.text || "";
    };

    const getVariableCount = (tpl: any): number => {
        const body = getBodyText(tpl);
        const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
        return matches ? matches.length : 0;
    };

    const getPreviewText = (tpl: any): string => {
        let text = getBodyText(tpl);
        sendParams.forEach((val, i) => {
            if (val.trim()) {
                text = text.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, "g"), val);
            }
        });
        return text;
    };

    const handleSelect = (tpl: any) => {
        setSelectedTemplate(tpl);
        const count = getVariableCount(tpl);
        setSendParams(new Array(count).fill(""));
    };

    const handleSend = async () => {
        if (!selectedTemplate || !user?.id || !instanceId) {
            toast.error("Dados incompletos para envio");
            return;
        }

        const number = contactNumber.replace(/@.*$/, "").replace(/\D/g, "");
        if (!number) {
            toast.error("Numero do contato invalido");
            return;
        }

        // Validate all variables are filled
        const varCount = getVariableCount(selectedTemplate);
        if (varCount > 0 && sendParams.some((p) => !p.trim())) {
            toast.error(`Preencha todas as ${varCount} variáveis`);
            return;
        }

        setIsSending(true);
        try {
            let templateComponents: any[] | undefined;
            if (sendParams.length > 0) {
                templateComponents = [
                    {
                        type: "body",
                        parameters: sendParams.map((p) => ({ type: "text", text: p })),
                    },
                ];
            }

            const result = await callTemplateApi({
                action: "send",
                user_id: user.id,
                instance_id: instanceId,
                to: number,
                template_name: selectedTemplate.name,
                template_language: selectedTemplate.language,
                template_components: templateComponents,
            });

            // Save template message to messages table so it appears in the chat
            if (conversationId) {
                const bodyText = getPreviewText(selectedTemplate);
                const fullBody = `*Template enviado: ${selectedTemplate.name}*\n${bodyText}`;

                const { error: msgError } = await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    body: fullBody,
                    direction: "outbound",
                    message_type: "text",
                    status: "sent",
                    evolution_id: result.message_id || null,
                    user_id: ownerId,
                });
                if (msgError) console.error("[TemplatePickerModal] Error saving message:", msgError);

                queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            }

            toast.success("Template enviado com sucesso!");
            onOpenChange(false);
            setSelectedTemplate(null);
            setSendParams([]);
            setSearch("");
        } catch (err: any) {
            toast.error(err.message || "Erro ao enviar template");
        } finally {
            setIsSending(false);
        }
    };

    const handleOpenChange = (v: boolean) => {
        if (!v) {
            setSelectedTemplate(null);
            setSendParams([]);
            setSearch("");
        }
        onOpenChange(v);
    };

    const varCount = selectedTemplate ? getVariableCount(selectedTemplate) : 0;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-4 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Enviar Template
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 border-t" style={{ height: "65vh" }}>
                    {/* Left - Template List */}
                    <div className="w-[280px] border-r flex flex-col">
                        <div className="p-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar template..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8 h-9"
                                />
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8 px-3">
                                    {search ? "Nenhum template encontrado" : "Nenhum template aprovado"}
                                </p>
                            ) : (
                                <div className="flex flex-col">
                                    {filtered.map((tpl: any) => {
                                        const isSelected = selectedTemplate?.id === tpl.id;
                                        return (
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleSelect(tpl)}
                                                className={`text-left p-3 border-b transition-colors hover:bg-muted/50 ${
                                                    isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
                                                }`}
                                            >
                                                <p className="text-sm font-medium truncate">{tpl.name}</p>
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {getBodyText(tpl)}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                        {tpl.category}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                        {tpl.language}
                                                    </Badge>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Right - Preview & Variables */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {selectedTemplate ? (
                            <>
                                {/* Preview */}
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                            Preview
                                        </h3>
                                        <div className="bg-[#e7fed6] dark:bg-[#025c4c] rounded-lg p-3 max-w-[320px] shadow-sm">
                                            {getHeaderText(selectedTemplate) && (
                                                <p className="text-sm font-bold mb-1">
                                                    {getHeaderText(selectedTemplate)}
                                                </p>
                                            )}
                                            <p className="text-sm whitespace-pre-wrap">
                                                {getPreviewText(selectedTemplate)}
                                            </p>
                                            {getFooterText(selectedTemplate) && (
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    {getFooterText(selectedTemplate)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>

                                {/* Variables & Send */}
                                <div className="border-t p-4 space-y-3">
                                    {varCount > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                Variáveis ({varCount})
                                            </h4>
                                            <div className="grid gap-2">
                                                {sendParams.map((val, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <Label className="text-xs text-muted-foreground w-12 shrink-0">
                                                            {`{{${i + 1}}}`}
                                                        </Label>
                                                        <Input
                                                            placeholder={`Valor para {{${i + 1}}}`}
                                                            value={val}
                                                            onChange={(e) => {
                                                                const next = [...sendParams];
                                                                next[i] = e.target.value;
                                                                setSendParams(next);
                                                            }}
                                                            className="h-8 text-sm"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleSend}
                                        disabled={isSending}
                                        className="w-full gap-2"
                                    >
                                        {isSending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                        Enviar Template
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center space-y-2">
                                    <FileText className="w-10 h-10 mx-auto opacity-30" />
                                    <p className="text-sm">Selecione um template</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
