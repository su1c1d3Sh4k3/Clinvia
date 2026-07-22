import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOwnerId } from "@/hooks/useOwnerId";
import { checkActiveConversation } from "@/hooks/useActiveConversation";
import { ContactPicker } from "@/components/ui/contact-picker";
import { formatPhoneNumber, unformatPhoneNumber } from "@/utils/formatters";
import { User, Search, FileText, Loader2, Send, LayoutTemplate } from "lucide-react";
import { CRM_STAGES, STAGE_QUEUE_MAP, TERMINAL_STAGES, CrmStage } from "@/types/crm-client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(`Invalid response: ${text.substring(0, 200)}`); }
    if (!resp.ok || !data.success) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
}

interface PrefilledContact {
    id: string;
    push_name?: string | null;
    number?: string | null;
    phone?: string | null;
}

interface NewMessageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prefilledPhone?: string;
    prefilledContact?: PrefilledContact | null;
}

export const NewMessageModal = ({ open, onOpenChange, prefilledPhone, prefilledContact }: NewMessageModalProps) => {
    const [selectedInstance, setSelectedInstance] = useState("");
    const [number, setNumber] = useState(prefilledPhone || "55");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);
    const [selectedCrmStage, setSelectedCrmStage] = useState("");
    const [selectedQueueId, setSelectedQueueId] = useState("");
    // Meta template state
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [sendParams, setSendParams] = useState<string[]>([]);
    const [templateSearch, setTemplateSearch] = useState("");
    const { toast } = useToast();
    const { data: ownerId } = useOwnerId();
    const { user } = useAuth();

    // Pre-populate from prefilledContact whenever modal opens or contact changes
    useEffect(() => {
        if (open && prefilledContact) {
            setSelectedContact(prefilledContact.id);
            const phone = prefilledContact.number?.split('@')[0] || prefilledContact.phone || "55";
            setNumber(phone);
        } else if (!open) {
            setSelectedContact(null);
            setNumber("55");
            setMessage("");
            setSelectedInstance("");
            setSelectedCrmStage("");
            setSelectedQueueId("");
            setSelectedTemplate(null);
            setSendParams([]);
            setTemplateSearch("");
        }
    }, [open, prefilledContact]);

    // Fetch contacts


    // Fetch connected instances
    const { data: instances } = useQuery({
        queryKey: ["connected-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .eq("status", "connected");

            if (error) throw error;
            return data;
        },
    });

    // Fetch queues for manual queue selection
    const { data: queues } = useQuery({
        queryKey: ["queues-list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("id, name")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    // Non-auto-routed stages need manual queue selection
    const stageHasAutoQueue = selectedCrmStage && STAGE_QUEUE_MAP[selectedCrmStage as CrmStage];
    const needsManualQueue = selectedCrmStage && !stageHasAutoQueue && !TERMINAL_STAGES.includes(selectedCrmStage as CrmStage);

    // Detect if selected instance is Meta
    const selectedInstanceObj = instances?.find((i: any) => i.name === selectedInstance);
    const isMetaSelected = (selectedInstanceObj as any)?.provider === "meta";

    // Fetch templates for Meta instance
    const { data: metaTemplates, isLoading: loadingTemplates } = useQuery({
        queryKey: ["meta-templates-newmsg", selectedInstanceObj?.id],
        queryFn: async () => {
            if (!selectedInstanceObj?.id || !user?.id) return [];
            const data = await callTemplateApi({ action: "list", user_id: user.id, instance_id: selectedInstanceObj.id });
            return (data.templates || []).filter((t: any) => t.status?.toUpperCase() === "APPROVED");
        },
        enabled: open && isMetaSelected && !!selectedInstanceObj?.id && !!user?.id,
    });

    const filteredTemplates = (metaTemplates || []).filter((t: any) => {
        if (!templateSearch.trim()) return true;
        const q = templateSearch.toLowerCase();
        return t.name?.toLowerCase().includes(q) || t.components?.find((c: any) => c.type === "BODY")?.text?.toLowerCase().includes(q);
    });

    const getBodyText = (tpl: any): string => tpl?.components?.find((c: any) => c.type === "BODY")?.text || "";
    const getHeaderText = (tpl: any): string => tpl?.components?.find((c: any) => c.type === "HEADER")?.text || "";
    const getFooterText = (tpl: any): string => tpl?.components?.find((c: any) => c.type === "FOOTER")?.text || "";
    const getVariableCount = (tpl: any): number => {
        const matches = getBodyText(tpl).match(/\{\{\s*\d+\s*\}\}/g);
        return matches ? matches.length : 0;
    };
    const getPreviewText = (tpl: any): string => {
        let text = getBodyText(tpl);
        sendParams.forEach((val, i) => {
            if (val.trim()) text = text.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, "g"), val);
        });
        return text;
    };

    const handleSelectTemplate = (tpl: any) => {
        setSelectedTemplate(tpl);
        setSendParams(new Array(getVariableCount(tpl)).fill(""));
    };

    const handleSend = async () => {
        if (!selectedInstance || !number) {
            toast({ title: "Campos obrigatórios", description: "Selecione instância e número.", variant: "destructive" });
            return;
        }
        if (isMetaSelected && !selectedTemplate) {
            toast({ title: "Template obrigatório", description: "Selecione um template para enviar via API oficial.", variant: "destructive" });
            return;
        }
        if (!isMetaSelected && !message) {
            toast({ title: "Campos obrigatórios", description: "Digite uma mensagem.", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        const instance = instances?.find(i => i.name === selectedInstance);

        if (!instance) {
            toast({ title: "Erro", description: "Instância não encontrada", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            let apiData: any = {};

            if (isMetaSelected) {
                // Send via Meta template API
                let templateComponents: any[] | undefined;
                if (sendParams.length > 0 && sendParams.some(p => p.trim())) {
                    templateComponents = [{ type: "body", parameters: sendParams.filter(p => p.trim()).map(p => ({ type: "text", text: p })) }];
                }
                const result = await callTemplateApi({
                    action: "send",
                    user_id: user?.id,
                    instance_id: instance.id,
                    to: number.replace(/\D/g, ""),
                    template_name: selectedTemplate.name,
                    template_language: selectedTemplate.language,
                    template_components: templateComponents,
                });
                apiData = { key: { id: result.message_id } };
            } else {
                // Send via UZAPI API
                const response = await fetch(`https://clinvia.uazapi.com/send/text`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "token": instance.apikey || "",
                    },
                    body: JSON.stringify({ number, text: message }),
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    if (response.status === 400) throw new Error("Número inválido ou não registrado no WhatsApp.");
                    throw new Error(`Falha ao enviar: ${errorData}`);
                }
                apiData = await response.json();
            }

            // 2. Handle Database Updates
            const remoteJid = `${number}@s.whatsapp.net`;

            // Use ownerId from hook for multi-tenancy
            if (!ownerId) {
                throw new Error("Usuário não autenticado");
            }

            // 2.1 Find or Create Contact
            let { data: contact } = await supabase
                .from("contacts")
                .select("*")
                .eq("number", remoteJid)
                .eq("user_id", ownerId)
                .single();

            if (!contact) {
                const { data: newContact, error: contactError } = await supabase
                    .from("contacts")
                    .insert({
                        number: remoteJid,
                        push_name: number, // Use number as initial name
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (contactError) throw contactError;
                contact = newContact;
            }

            if (!contact) throw new Error("Falha ao criar contato");

            // 2.2 Check for existing active conversation (BLOCKING)
            const activeConv = await checkActiveConversation(contact.id);

            if (activeConv) {
                // Use existing conversation - don't create new one
                // If assigned to another agent, just inform (but still use the conversation)
                if (activeConv.agent_name) {
                    toast({
                        title: "Cliente já em atendimento",
                        description: `Este cliente já está sendo atendido por ${activeConv.agent_name}.`,
                    });
                }
                // Use the existing conversation
                var conversation = { id: activeConv.id } as any;
            } else {
                // No active conversation - create new one as OPEN + assigned to current agent
                // Get current authenticated user
                const { data: { user: currentUser } } = await supabase.auth.getUser();

                if (!currentUser) {
                    throw new Error("Usuário não autenticado");
                }

                // Get team_member to use correct ID
                const { data: teamMember } = await supabase
                    .from("team_members")
                    .select("id")
                    .eq("auth_user_id", currentUser.id)
                    .single();

                if (!teamMember) {
                    throw new Error("Team member não encontrado");
                }

                const { data: newConversation, error: conversationError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contact.id,
                        status: "open", // Agent-initiated = open
                        assigned_agent_id: teamMember.id, // Assign to current agent
                        unread_count: 0,
                        last_message_at: new Date().toISOString(),
                        user_id: ownerId,
                        instance_id: instance.id,
                    })
                    .select()
                    .single();

                if (conversationError) throw conversationError;
                console.log("Created new conversation as 'open':", newConversation.id, "- Assigned to:", teamMember.id);
                var conversation = newConversation as any;
            }

            if (!conversation) throw new Error("Falha ao criar conversa");

            // 2.2b Handle CRM stage + queue assignment
            if (selectedCrmStage && contact?.id) {
                try {
                    // Determine queue_id
                    let queueId: string | null = null;
                    const autoQueue = STAGE_QUEUE_MAP[selectedCrmStage as CrmStage];
                    if (autoQueue && queues) {
                        const q = queues.find((q: any) => q.name === autoQueue);
                        if (q) queueId = q.id;
                    } else if (needsManualQueue && selectedQueueId) {
                        queueId = selectedQueueId;
                    }

                    // Update conversation queue if determined
                    if (queueId) {
                        await supabase.from("conversations").update({ queue_id: queueId }).eq("id", conversation.id);
                    }

                    // Create or update crm_client
                    const { data: existingDeal } = await supabase
                        .from("crm_client" as any)
                        .select("id")
                        .eq("contact_id", contact.id)
                        .eq("is_active", true)
                        .maybeSingle();

                    if (existingDeal) {
                        await supabase.from("crm_client" as any)
                            .update({ stage: selectedCrmStage })
                            .eq("id", (existingDeal as any).id);
                    } else {
                        await supabase.from("crm_client" as any).insert({
                            user_id: ownerId,
                            contact_id: contact.id,
                            stage: selectedCrmStage,
                        });
                    }
                } catch (crmErr) {
                    console.warn("CRM assignment skipped:", crmErr);
                }
            }

            // 2.3 Insert Message
            const msgBody = isMetaSelected
                ? `*Template enviado: ${selectedTemplate?.name}*\n${getPreviewText(selectedTemplate)}`
                : message;
            const { error: messageError } = await supabase
                .from("messages")
                .insert({
                    conversation_id: conversation.id,
                    body: msgBody,
                    direction: "outbound",
                    message_type: "text",
                    evolution_id: apiData?.key?.id || null,
                    user_id: ownerId,
                });

            if (messageError) throw messageError;

            toast({ title: isMetaSelected ? "Template enviado com sucesso!" : "Mensagem enviada com sucesso!" });
            onOpenChange(false);
            setSelectedInstance("");
            setSelectedContact(null);
            setNumber("55");
            setMessage("");
            setSelectedTemplate(null);
            setSendParams([]);
            setTemplateSearch("");
        } catch (error: any) {
            console.error("Erro ao enviar mensagem:", error);
            toast({
                title: "Erro ao enviar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Nova Mensagem</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Instância</Label>
                        <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma instância" />
                            </SelectTrigger>
                            <SelectContent>
                                {instances?.map((instance) => (
                                    <SelectItem key={instance.id} value={instance.name}>
                                        {instance.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 flex flex-col">
                        <Label>Selecionar contato</Label>
                        {prefilledContact ? (
                            // Contact locked — show read-only display
                            <div className="flex items-center gap-2 h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium truncate">
                                    {prefilledContact.push_name || prefilledContact.phone || prefilledContact.number?.split('@')[0] || "Contato"}
                                </span>
                            </div>
                        ) : (
                            <ContactPicker
                                value={selectedContact || ""}
                                onChange={(val, contact) => {
                                    setSelectedContact(val || null);
                                    if (contact?.number) {
                                        setNumber(contact.number.split('@')[0]);
                                    } else if (!val) {
                                        setNumber("");
                                    }
                                }}
                                placeholder="Buscar contato..."
                                className="w-full"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input
                            value={formatPhoneNumber(number)}
                            onChange={(e) => {
                                const value = unformatPhoneNumber(e.target.value);
                                setNumber(value.slice(0, 13));
                            }}
                            placeholder="+55 (37) 9 9999-9999"
                            type="tel"
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            Formato: +55 (DDD) 9 XXXX-XXXX
                        </p>
                    </div>

                    {isMetaSelected ? (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <LayoutTemplate className="w-4 h-4" />
                                Template (obrigatório na API oficial)
                            </Label>
                            <div className="border rounded-lg overflow-hidden">
                                {/* Search */}
                                <div className="p-2 border-b">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar template..."
                                            value={templateSearch}
                                            onChange={(e) => setTemplateSearch(e.target.value)}
                                            className="pl-8 h-8 text-sm"
                                        />
                                    </div>
                                </div>
                                {/* Template List */}
                                <ScrollArea className="max-h-[150px]">
                                    {loadingTemplates ? (
                                        <div className="flex items-center justify-center py-4">
                                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredTemplates.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum template aprovado</p>
                                    ) : (
                                        filteredTemplates.map((tpl: any) => (
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleSelectTemplate(tpl)}
                                                className={`w-full text-left p-2 border-b text-sm hover:bg-muted/50 transition-colors ${selectedTemplate?.id === tpl.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                                            >
                                                <p className="font-medium text-xs truncate">{tpl.name}</p>
                                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{getBodyText(tpl)}</p>
                                            </button>
                                        ))
                                    )}
                                </ScrollArea>
                                {/* Preview + Variables */}
                                {selectedTemplate && (
                                    <div className="border-t p-3 space-y-2 bg-muted/20">
                                        <div className="bg-[#e7fed6] dark:bg-[#025c4c] rounded-lg p-2.5 text-sm max-w-[280px] shadow-sm">
                                            {getHeaderText(selectedTemplate) && <p className="font-bold text-xs mb-1">{getHeaderText(selectedTemplate)}</p>}
                                            <p className="text-xs whitespace-pre-wrap">{getPreviewText(selectedTemplate)}</p>
                                            {getFooterText(selectedTemplate) && <p className="text-[10px] text-muted-foreground mt-1">{getFooterText(selectedTemplate)}</p>}
                                        </div>
                                        {getVariableCount(selectedTemplate) > 0 && (
                                            <div className="space-y-1.5">
                                                {sendParams.map((val, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <Label className="text-[10px] text-muted-foreground w-10 shrink-0">{`{{${i + 1}}}`}</Label>
                                                        <Input
                                                            placeholder={`Valor para {{${i + 1}}}`}
                                                            value={val}
                                                            onChange={(e) => { const next = [...sendParams]; next[i] = e.target.value; setSendParams(next); }}
                                                            className="h-7 text-xs"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label>Mensagem</Label>
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Digite sua mensagem..."
                                rows={4}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Etapa do CRM</Label>
                        <Select value={selectedCrmStage} onValueChange={(v) => { setSelectedCrmStage(v); setSelectedQueueId(""); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione a etapa (opcional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {CRM_STAGES.filter((s) => !TERMINAL_STAGES.includes(s)).map((stage) => (
                                    <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {needsManualQueue && (
                        <div className="space-y-2">
                            <Label>Fila de atendimento</Label>
                            <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a fila" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(queues || []).map((q: any) => (
                                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSend} disabled={isLoading}>
                        {isLoading ? "Enviando..." : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
