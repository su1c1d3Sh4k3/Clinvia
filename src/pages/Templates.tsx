import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
    Loader2, Plus, Trash2, RefreshCw, FileText, CheckCircle2,
    XCircle, Clock, AlertTriangle, Send, ChevronDown, ChevronUp
} from "lucide-react";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

const Templates = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

    // Form state
    const [newName, setNewName] = useState("");
    const [newCategory, setNewCategory] = useState("UTILITY");
    const [newLanguage, setNewLanguage] = useState("pt_BR");
    const [newBodyText, setNewBodyText] = useState("");
    const [newHeaderText, setNewHeaderText] = useState("");
    const [newFooterText, setNewFooterText] = useState("");

    // Send state
    const [sendTo, setSendTo] = useState("");
    const [sendParams, setSendParams] = useState<string[]>([]);

    // Get Meta instances
    const { data: metaInstances } = useQuery({
        queryKey: ["meta-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            // Filter in JS since 'provider' column isn't in generated types
            return (data as any[]).filter((i: any) => (i.provider === "meta" || (i.instance_name || '').startsWith("meta-")) && i.status === "connected");
        },
    });

    const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");

    // Auto-select first instance
    const activeInstance = selectedInstanceId
        ? metaInstances?.find((i: any) => i.id === selectedInstanceId)
        : metaInstances?.[0];

    // Templates query
    const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
        queryKey: ["meta-templates", activeInstance?.id],
        queryFn: async () => {
            if (!activeInstance || !user?.id) return [];

            const { data, error } = await supabase.functions.invoke('meta-template-manage', {
                body: {
                    action: 'list',
                    user_id: user.id,
                    instance_id: activeInstance.id,
                },
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Falha ao listar templates');
            return data.templates || [];
        },
        enabled: !!activeInstance && !!user?.id,
    });

    // Sync mutation
    const syncMutation = useMutation({
        mutationFn: async () => {
            if (!activeInstance || !user?.id) throw new Error("Sem instancia ativa");
            const { data, error } = await supabase.functions.invoke('meta-template-manage', {
                body: { action: 'sync', user_id: user.id, instance_id: activeInstance.id },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error);
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Templates sincronizados", description: `${data.count} templates encontrados.` });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
        },
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!activeInstance || !user?.id) throw new Error("Sem instancia ativa");

            const components: any[] = [];

            if (newHeaderText.trim()) {
                components.push({ type: "HEADER", format: "TEXT", text: newHeaderText.trim() });
            }

            components.push({
                type: "BODY",
                text: newBodyText.trim(),
            });

            if (newFooterText.trim()) {
                components.push({ type: "FOOTER", text: newFooterText.trim() });
            }

            const { data, error } = await supabase.functions.invoke('meta-template-manage', {
                body: {
                    action: 'create',
                    user_id: user.id,
                    instance_id: activeInstance.id,
                    name: newName.trim(),
                    category: newCategory,
                    language: newLanguage,
                    components,
                },
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Template criado!", description: "Aguardando aprovacao da Meta." });
            setCreateDialogOpen(false);
            resetForm();
        },
        onError: (err: any) => {
            toast({ title: "Erro ao criar template", description: err.message, variant: "destructive" });
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (templateName: string) => {
            if (!activeInstance || !user?.id) throw new Error("Sem instancia ativa");
            const { data, error } = await supabase.functions.invoke('meta-template-manage', {
                body: {
                    action: 'delete',
                    user_id: user.id,
                    instance_id: activeInstance.id,
                    name: templateName,
                },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Template deletado" });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao deletar", description: err.message, variant: "destructive" });
        },
    });

    // Send template mutation
    const sendMutation = useMutation({
        mutationFn: async () => {
            if (!activeInstance || !user?.id || !selectedTemplate) throw new Error("Dados incompletos");

            const number = sendTo.replace(/\D/g, "");
            if (!number) throw new Error("Numero invalido");

            // Build template components (body parameters)
            let templateComponents: any[] | undefined;
            if (sendParams.length > 0 && sendParams.some(p => p.trim())) {
                templateComponents = [{
                    type: "body",
                    parameters: sendParams.filter(p => p.trim()).map(p => ({ type: "text", text: p })),
                }];
            }

            const payload = {
                action: 'send',
                user_id: user.id,
                instance_id: activeInstance.id,
                to: number,
                template_name: selectedTemplate.name,
                template_language: selectedTemplate.language,
                template_components: templateComponents,
            };
            console.log('[Templates] Sending template:', JSON.stringify(payload));

            const response = await fetch(
                `https://swfshqvvbohnahdyndch.supabase.co/functions/v1/meta-template-manage`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                    },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();
            console.log('[Templates] Response:', response.status, JSON.stringify(data));

            if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
            if (!data?.success) throw new Error(data?.error || 'Falha ao enviar');
            return data;
        },
        onSuccess: () => {
            toast({ title: "Template enviado!" });
            setSendDialogOpen(false);
            setSendTo("");
            setSendParams([]);
        },
        onError: (err: any) => {
            toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
        },
    });

    const resetForm = () => {
        setNewName("");
        setNewCategory("UTILITY");
        setNewLanguage("pt_BR");
        setNewBodyText("");
        setNewHeaderText("");
        setNewFooterText("");
    };

    const getStatusBadge = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'APPROVED':
                return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 border"><CheckCircle2 className="h-3 w-3 mr-1" /> Aprovado</Badge>;
            case 'REJECTED':
                return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 border"><XCircle className="h-3 w-3 mr-1" /> Rejeitado</Badge>;
            case 'PENDING':
                return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 border"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
            case 'PAUSED':
                return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 border"><AlertTriangle className="h-3 w-3 mr-1" /> Pausado</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    // Extract variable count from template body (e.g. {{1}}, {{2}})
    const getVariableCount = (tpl: any): number => {
        const bodyComponent = tpl.components?.find((c: any) => c.type === 'BODY');
        if (!bodyComponent?.text) return 0;
        const matches = bodyComponent.text.match(/\{\{\s*\d+\s*\}\}/g);
        return matches ? matches.length : 0;
    };

    const openSendDialog = (tpl: any) => {
        setSelectedTemplate(tpl);
        const varCount = getVariableCount(tpl);
        setSendParams(new Array(varCount).fill(""));
        setSendDialogOpen(true);
    };

    if (!metaInstances || metaInstances.length === 0) {
        return (
            <div className="p-4 md:p-8">
                <div className="max-w-4xl mx-auto">
                    <Card>
                        <CardContent className="p-8 text-center">
                            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h2 className="text-lg font-semibold mb-2">Nenhuma instancia Meta conectada</h2>
                            <p className="text-muted-foreground text-sm mb-4">
                                Conecte seu WhatsApp Oficial na pagina de Conexoes para gerenciar templates.
                            </p>
                            <Button onClick={() => window.location.href = '/connections'}>
                                Ir para Conexoes
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold">Templates</h1>
                        <p className="text-muted-foreground text-sm md:text-base">
                            Gerencie templates de mensagem do WhatsApp Business
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {metaInstances.length > 1 && (
                            <Select
                                value={selectedInstanceId || metaInstances[0]?.id}
                                onValueChange={setSelectedInstanceId}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Instancia" />
                                </SelectTrigger>
                                <SelectContent>
                                    {metaInstances.map((inst: any) => (
                                        <SelectItem key={inst.id} value={inst.id}>
                                            {inst.name || inst.meta_phone_number_id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncMutation.mutate()}
                            disabled={syncMutation.isPending}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                            Sincronizar
                        </Button>
                        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Novo Template
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Criar Template</DialogTitle>
                                    <DialogDescription>
                                        Templates precisam ser aprovados pela Meta antes do envio.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="tpl-name">Nome (apenas letras minusculas, numeros e _)</Label>
                                        <Input
                                            id="tpl-name"
                                            placeholder="confirmacao_agendamento"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Categoria</Label>
                                            <Select value={newCategory} onValueChange={setNewCategory}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                                                    <SelectItem value="MARKETING">Marketing</SelectItem>
                                                    <SelectItem value="AUTHENTICATION">Autenticacao</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Idioma</Label>
                                            <Select value={newLanguage} onValueChange={setNewLanguage}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="pt_BR">Portugues (BR)</SelectItem>
                                                    <SelectItem value="en_US">Ingles (US)</SelectItem>
                                                    <SelectItem value="es">Espanhol</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Cabecalho (opcional)</Label>
                                        <Input
                                            placeholder="Titulo do template"
                                            value={newHeaderText}
                                            onChange={(e) => setNewHeaderText(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Corpo da mensagem</Label>
                                        <Textarea
                                            placeholder={"Ola {{1}}, seu agendamento para {{2}} esta confirmado."}
                                            value={newBodyText}
                                            onChange={(e) => setNewBodyText(e.target.value)}
                                            rows={4}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Use {"{{1}}"}, {"{{2}}"}, etc. para variaveis dinamicas.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rodape (opcional)</Label>
                                        <Input
                                            placeholder="Clinvia - Gestao Inteligente"
                                            value={newFooterText}
                                            onChange={(e) => setNewFooterText(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={() => createMutation.mutate()}
                                        disabled={createMutation.isPending || !newName || !newBodyText}
                                    >
                                        {createMutation.isPending ? (
                                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...</>
                                        ) : (
                                            "Criar Template"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Templates List */}
                <Card>
                    <CardHeader className="p-4 md:p-6">
                        <CardTitle className="text-base md:text-lg">
                            Templates ({templates?.length || 0})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                        {loadingTemplates ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : templates && templates.length > 0 ? (
                            <div className="space-y-3">
                                {templates.map((tpl: any) => {
                                    const bodyComponent = tpl.components?.find((c: any) => c.type === 'BODY');
                                    const headerComponent = tpl.components?.find((c: any) => c.type === 'HEADER');
                                    const footerComponent = tpl.components?.find((c: any) => c.type === 'FOOTER');
                                    const isExpanded = expandedTemplate === tpl.id;

                                    return (
                                        <div key={tpl.id} className="border rounded-lg">
                                            <div
                                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 md:p-4 gap-2 cursor-pointer hover:bg-muted/30 transition-colors"
                                                onClick={() => setExpandedTemplate(isExpanded ? null : tpl.id)}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium text-sm truncate">{tpl.name}</span>
                                                            {getStatusBadge(tpl.status)}
                                                            <Badge variant="outline" className="text-[10px]">{tpl.category}</Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                            {bodyComponent?.text?.substring(0, 80) || 'Sem corpo'}
                                                            {(bodyComponent?.text?.length || 0) > 80 ? '...' : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {tpl.status?.toUpperCase() === 'APPROVED' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openSendDialog(tpl);
                                                            }}
                                                        >
                                                            <Send className="h-3 w-3 mr-1" /> Enviar
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteMutation.mutate(tpl.name);
                                                        }}
                                                        disabled={deleteMutation.isPending}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="border-t p-4 bg-muted/20 space-y-2 text-sm">
                                                    {headerComponent && (
                                                        <div>
                                                            <span className="font-medium text-xs text-muted-foreground">CABECALHO:</span>
                                                            <p>{headerComponent.text}</p>
                                                        </div>
                                                    )}
                                                    {bodyComponent && (
                                                        <div>
                                                            <span className="font-medium text-xs text-muted-foreground">CORPO:</span>
                                                            <p className="whitespace-pre-wrap">{bodyComponent.text}</p>
                                                        </div>
                                                    )}
                                                    {footerComponent && (
                                                        <div>
                                                            <span className="font-medium text-xs text-muted-foreground">RODAPE:</span>
                                                            <p className="text-muted-foreground">{footerComponent.text}</p>
                                                        </div>
                                                    )}
                                                    {tpl.rejection_reason && (
                                                        <div className="p-2 bg-red-500/10 rounded text-red-700 dark:text-red-400 text-xs">
                                                            Motivo da rejeicao: {tpl.rejection_reason}
                                                        </div>
                                                    )}
                                                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                                                        <span>Idioma: {tpl.language}</span>
                                                        <span>ID Meta: {tpl.meta_template_id || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground mb-2">Nenhum template encontrado.</p>
                                <p className="text-xs text-muted-foreground">
                                    Clique em "Sincronizar" para buscar templates existentes ou crie um novo.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Send Template Dialog */}
            <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Enviar Template</DialogTitle>
                        <DialogDescription>
                            Envie o template "{selectedTemplate?.name}" para um numero
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Numero de destino (com DDI)</Label>
                            <Input
                                placeholder="5511999999999"
                                value={sendTo}
                                onChange={(e) => setSendTo(e.target.value.replace(/\D/g, ''))}
                            />
                        </div>
                        {sendParams.length > 0 && (
                            <div className="space-y-2">
                                <Label>Variaveis</Label>
                                {sendParams.map((param, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground w-12">{`{{${idx + 1}}}`}</span>
                                        <Input
                                            placeholder={`Valor para {{${idx + 1}}}`}
                                            value={param}
                                            onChange={(e) => {
                                                const newParams = [...sendParams];
                                                newParams[idx] = e.target.value;
                                                setSendParams(newParams);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => sendMutation.mutate()}
                            disabled={sendMutation.isPending || !sendTo}
                        >
                            {sendMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
                            ) : (
                                <><Send className="h-4 w-4 mr-2" /> Enviar</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Templates;
