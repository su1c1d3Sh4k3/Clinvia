import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import {
    Loader2, Plus, Trash2, RefreshCw, FileText, CheckCircle2,
    XCircle, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Pencil, Bot
} from "lucide-react";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTemplateKind, TEMPLATE_KINDS, TEMPLATE_KIND_LABELS, type TemplateKind } from "@/lib/templateKind";
import { RecurrenceDefaultTemplateCard } from "@/components/templates/RecurrenceDefaultTemplateCard";

const SUPABASE_URL = "https://swfshqvvbohnahdyndch.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY";

// ── Templates automáticos de sistema (agendamento) ──────────────────────────
// Metadados para o editor: intervalo de envio + variáveis disponíveis por template.
const SYS_TEMPLATE_META: Record<string, { interval: string; vars: { key: string; label: string }[] }> = {
    sys_confirm_24h_v1: {
        interval: "Este template é enviado automaticamente ~24 horas antes do agendamento (no dia anterior), quando o cliente tem 1 agendamento no dia.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "horario", label: "Horário" },
            { key: "clinica", label: "Nome da clínica" },
            { key: "servico", label: "Serviço" },
            { key: "profissional", label: "Profissional" },
        ],
    },
    sys_confirm_multi_v1: {
        interval: "Este template é enviado automaticamente ~24 horas antes, quando o cliente tem 2 ou mais agendamentos no mesmo dia.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "clinica", label: "Nome da clínica" },
            { key: "agendamentos", label: "Lista de agendamentos" },
        ],
    },
    sys_reminder_2h_v1: {
        interval: "Este template é enviado automaticamente 2 horas antes do agendamento.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "horarios", label: "Horário(s)" },
            { key: "clinica", label: "Nome da clínica" },
        ],
    },
    sys_feedback_24h_v1: {
        interval: "Este template é enviado automaticamente ~24 horas após o atendimento (pesquisa de satisfação).",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "clinica", label: "Nome da clínica" },
        ],
    },
};

// Ordem default das variáveis dos bodies originais ({{1}}..{{n}})
const DEFAULT_SYS_VARIABLE_MAP: Record<string, string[]> = {
    sys_confirm_24h_v1: ["nome_cliente", "horario", "clinica", "servico", "profissional"],
    sys_confirm_multi_v1: ["nome_cliente", "clinica", "agendamentos"],
    sys_reminder_2h_v1: ["nome_cliente", "horarios"],
    sys_feedback_24h_v1: ["nome_cliente"],
};

// {{1}} → {{nome_cliente}} (para exibir no editor)
function numberedToNamed(body: string, map: string[]): string {
    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => {
        const key = map[parseInt(n, 10) - 1];
        return key ? `{{${key}}}` : m;
    });
}

// {{nome_cliente}} → {{1}} + variable_map na ordem de aparição
function namedToNumbered(body: string, validKeys: string[]): { text: string; map: string[] } {
    const map: string[] = [];
    const text = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) => {
        if (!validKeys.includes(key)) {
            throw new Error(`Variável desconhecida: {{${key}}}. Use os botões de variáveis.`);
        }
        map.push(key);
        return `{{${map.length}}}`;
    });
    return { text, map };
}

// Botões de resposta rápida → componente BUTTONS da Meta (ou null se vazio)
function buildButtonsComponent(buttons: string[]): any | null {
    const texts = buttons.map((b) => b.trim()).filter(Boolean);
    if (texts.length === 0) return null;
    if (texts.some((t) => t.length > 25)) {
        throw new Error("Cada botão pode ter no máximo 25 caracteres.");
    }
    const unique = new Set(texts.map((t) => t.toLowerCase()));
    if (unique.size !== texts.length) {
        throw new Error("Os textos dos botões devem ser diferentes entre si.");
    }
    return {
        type: "BUTTONS",
        buttons: texts.map((text) => ({ type: "QUICK_REPLY", text })),
    };
}

// Helper to call meta-template-manage edge function
async function callTemplateApi(body: any): Promise<any> {
    let token = SUPABASE_ANON_KEY;
    try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.access_token) token = session.access_token;
    } catch {}

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/meta-template-manage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(`Invalid response: ${text.substring(0, 200)}`); }
    if (!resp.ok || !data.success) {
        console.error('[Templates] API error:', resp.status, data);
        throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
}

const Templates = ({ embedded = false }: { embedded?: boolean }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: ownerId } = useOwnerId();

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const [kindTab, setKindTab] = useState<TemplateKind>("custom");
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

    // Edit state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editTemplate, setEditTemplate] = useState<any>(null);
    const [editBodyText, setEditBodyText] = useState("");
    const [editHeaderText, setEditHeaderText] = useState("");
    const [editFooterText, setEditFooterText] = useState("");
    const [editButtons, setEditButtons] = useState<string[]>([]);
    const editBodyRef = useRef<HTMLTextAreaElement>(null);

    // Form state
    const [newName, setNewName] = useState("");
    const [newCategory, setNewCategory] = useState("UTILITY");
    const [newLanguage, setNewLanguage] = useState("pt_BR");
    const [newBodyText, setNewBodyText] = useState("");
    const [newHeaderText, setNewHeaderText] = useState("");
    const [newFooterText, setNewFooterText] = useState("");
    const [newButtons, setNewButtons] = useState<string[]>([]);

    // Send state
    const [sendTo, setSendTo] = useState("");
    const [sendParams, setSendParams] = useState<string[]>([]);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");

    // Get Meta instances via direct SQL-like RPC to avoid cache conflicts
    // Uses a SEPARATE query key so NavigationSidebar can't overwrite the data
    const { data: metaInstances, isLoading: loadingInstances } = useQuery({
        queryKey: ["templates-meta-instances"],
        queryFn: async () => {
            // Fetch ALL instances, then filter in JS
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                console.error('[Templates] Failed to fetch instances:', error);
                throw error;
            }

            console.log('[Templates] Raw instances:', data?.map((i: any) => ({
                id: i.id,
                name: i.instance_name,
                provider: i.provider,
                status: i.status,
            })));

            // Filter: meta provider OR instance_name starts with meta-
            const meta = (data || []).filter((i: any) =>
                (i.provider === "meta" || (i.instance_name || '').startsWith("meta-"))
                && i.status === "connected"
            );

            console.log('[Templates] Meta instances found:', meta.length);
            return meta as any[];
        },
        staleTime: 30_000,
    });

    // Auto-select first instance
    const activeInstance = selectedInstanceId
        ? metaInstances?.find((i: any) => i.id === selectedInstanceId)
        : metaInstances?.[0];

    // Log activeInstance for debugging
    useEffect(() => {
        console.log('[Templates] activeInstance:', activeInstance?.id, activeInstance?.instance_name);
    }, [activeInstance?.id]);

    // Templates query
    const { data: templates, isLoading: loadingTemplates } = useQuery({
        queryKey: ["meta-templates", activeInstance?.id],
        queryFn: async () => {
            if (!activeInstance || !user?.id) return [];
            console.log('[Templates] Fetching templates for instance:', activeInstance.id);
            const data = await callTemplateApi({
                action: 'list',
                user_id: user.id,
                instance_id: activeInstance.id,
            });
            console.log('[Templates] Templates loaded:', data.count);
            return data.templates || [];
        },
        enabled: !!activeInstance && !!user?.id,
    });

    // Switches liga/desliga dos templates automáticos (ausência de linha = ligado)
    const { data: automationSettings } = useQuery({
        queryKey: ["automation-template-settings", ownerId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("automation_template_settings")
                .select("template_name, enabled")
                .eq("user_id", ownerId);
            if (error) throw error;
            return (data || []) as { template_name: string; enabled: boolean }[];
        },
        enabled: !!ownerId,
    });

    const isAutomationEnabled = (name: string) =>
        automationSettings?.find((s) => s.template_name === name)?.enabled !== false;

    const toggleAutomationMutation = useMutation({
        mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
            if (!ownerId) throw new Error("Sem usuario");
            const { error } = await (supabase as any)
                .from("automation_template_settings")
                .upsert(
                    { user_id: ownerId, template_name: name, enabled, updated_at: new Date().toISOString() },
                    { onConflict: "user_id,template_name" }
                );
            if (error) throw error;
            return enabled;
        },
        onSuccess: (enabled) => {
            queryClient.invalidateQueries({ queryKey: ["automation-template-settings"] });
            toast({
                title: enabled ? "Envio automático ativado" : "Envio automático desativado",
            });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
        },
    });

    // Sync mutation
    const syncMutation = useMutation({
        mutationFn: async () => {
            if (!activeInstance || !user?.id) throw new Error("Sem instancia ativa");
            return await callTemplateApi({ action: 'sync', user_id: user.id, instance_id: activeInstance.id });
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
            const bodyText = newBodyText.trim();
            const vars = bodyText.match(/\{\{\s*\d+\s*\}\}/g);
            if (vars && vars.length > 0) {
                const textWithoutVars = bodyText.replace(/\{\{\s*\d+\s*\}\}/g, '').trim();
                if (textWithoutVars.length < 20) {
                    throw new Error("O corpo da mensagem precisa ter pelo menos 20 caracteres de texto alem das variaveis. A Meta exige texto suficiente ao redor das variaveis.");
                }
            }
            const components: any[] = [];
            if (newHeaderText.trim()) {
                components.push({ type: "HEADER", format: "TEXT", text: newHeaderText.trim() });
            }
            components.push({ type: "BODY", text: bodyText });
            if (newFooterText.trim()) {
                components.push({ type: "FOOTER", text: newFooterText.trim() });
            }
            const buttonsComponent = buildButtonsComponent(newButtons);
            if (buttonsComponent) components.push(buttonsComponent);
            return await callTemplateApi({
                action: 'create',
                user_id: user.id,
                instance_id: activeInstance.id,
                name: newName.trim(),
                category: newCategory,
                language: newLanguage,
                components,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Template criado!", description: "Aguardando aprovacao da Meta." });
            setCreateDialogOpen(false);
            setNewName(""); setNewCategory("UTILITY"); setNewLanguage("pt_BR");
            setNewBodyText(""); setNewHeaderText(""); setNewFooterText("");
            setNewButtons([]);
        },
        onError: (err: any) => {
            toast({ title: "Erro ao criar template", description: err.message, variant: "destructive" });
        },
    });

    // Edit mutation
    const editMutation = useMutation({
        mutationFn: async () => {
            if (!activeInstance || !user?.id || !editTemplate) throw new Error("Dados incompletos");
            const sysMeta = SYS_TEMPLATE_META[editTemplate.name];

            let bodyText = editBodyText.trim();
            let variableMap: string[] | undefined;
            if (sysMeta) {
                const converted = namedToNumbered(bodyText, sysMeta.vars.map((v) => v.key));
                bodyText = converted.text;
                variableMap = converted.map;
            }

            // Regras da Meta
            if (/^\{\{\s*\d+\s*\}\}/.test(bodyText) || /\{\{\s*\d+\s*\}\}$/.test(bodyText)) {
                throw new Error("O corpo não pode começar nem terminar com uma variável (regra da Meta).");
            }
            const textWithoutVars = bodyText.replace(/\{\{\s*\d+\s*\}\}/g, "").trim();
            if (textWithoutVars.length < 20) {
                throw new Error("O corpo da mensagem precisa ter pelo menos 20 caracteres de texto alem das variaveis.");
            }

            // Preserva componentes não editáveis (ex.: BUTTONS dos templates de sistema).
            // Em templates comuns, BUTTONS é editável pela UI e sai deste filtro.
            const otherComponents = (editTemplate.components || []).filter(
                (c: any) =>
                    !["BODY", "HEADER", "FOOTER"].includes(c.type) &&
                    (sysMeta || c.type !== "BUTTONS")
            );
            const components: any[] = [];
            if (!sysMeta && editHeaderText.trim()) {
                components.push({ type: "HEADER", format: "TEXT", text: editHeaderText.trim() });
            }
            components.push({ type: "BODY", text: bodyText });
            if (!sysMeta && editFooterText.trim()) {
                components.push({ type: "FOOTER", text: editFooterText.trim() });
            }
            if (!sysMeta) {
                const buttonsComponent = buildButtonsComponent(editButtons);
                if (buttonsComponent) components.push(buttonsComponent);
            }
            components.push(...otherComponents);

            return await callTemplateApi({
                action: 'edit',
                user_id: user.id,
                instance_id: activeInstance.id,
                name: editTemplate.name,
                components,
                variable_map: variableMap,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Template atualizado!", description: "Aguardando nova aprovacao da Meta." });
            setEditDialogOpen(false);
        },
        onError: (err: any) => {
            toast({ title: "Erro ao editar template", description: err.message, variant: "destructive" });
        },
    });

    const openEditDialog = (tpl: any) => {
        const sysMeta = SYS_TEMPLATE_META[tpl.name];
        const bodyComponent = tpl.components?.find((c: any) => c.type === 'BODY');
        let body = bodyComponent?.text || "";
        if (sysMeta) {
            const map = Array.isArray(tpl.variable_map) && tpl.variable_map.length > 0
                ? tpl.variable_map
                : DEFAULT_SYS_VARIABLE_MAP[tpl.name] || [];
            body = numberedToNamed(body, map);
        }
        setEditTemplate(tpl);
        setEditBodyText(body);
        setEditHeaderText(tpl.components?.find((c: any) => c.type === 'HEADER')?.text || "");
        setEditFooterText(tpl.components?.find((c: any) => c.type === 'FOOTER')?.text || "");
        const buttonsComponent = tpl.components?.find((c: any) => c.type === 'BUTTONS');
        setEditButtons(
            (buttonsComponent?.buttons || [])
                .filter((b: any) => b.type === 'QUICK_REPLY')
                .map((b: any) => b.text || "")
        );
        setEditDialogOpen(true);
    };

    const insertEditVariable = (key: string) => {
        const token = `{{${key}}}`;
        const el = editBodyRef.current;
        if (!el) {
            setEditBodyText((t) => t + token);
            return;
        }
        const start = el.selectionStart ?? editBodyText.length;
        const end = el.selectionEnd ?? start;
        setEditBodyText(editBodyText.slice(0, start) + token + editBodyText.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (templateName: string) => {
            if (!activeInstance || !user?.id) throw new Error("Sem instancia ativa");
            return await callTemplateApi({
                action: 'delete',
                user_id: user.id,
                instance_id: activeInstance.id,
                name: templateName,
            });
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

            let templateComponents: any[] | undefined;
            if (sendParams.length > 0 && sendParams.some(p => p.trim())) {
                templateComponents = [{
                    type: "body",
                    parameters: sendParams.filter(p => p.trim()).map(p => ({ type: "text", text: p })),
                }];
            }

            const result = await callTemplateApi({
                action: 'send',
                user_id: user.id,
                instance_id: activeInstance.id,
                to: number,
                template_name: selectedTemplate.name,
                template_language: selectedTemplate.language,
                template_components: templateComponents,
            });

            // Log de envio para o dashboard Satisfação
            if (ownerId) {
                await supabase.from("template_sends" as any).insert({
                    user_id: ownerId,
                    template_name: selectedTemplate.name,
                    sent_by: user.id,
                    sent_via: "manual",
                });
            }

            return result;
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

    // Show loading while instances are being fetched
    if (loadingInstances) {
        return (
            <div className={embedded ? "" : "p-4 md:p-8"}>
                <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!metaInstances || metaInstances.length === 0) {
        return (
            <div className={embedded ? "" : "p-4 md:p-8"}>
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
        <div className={embedded ? "" : "p-4 md:p-8"}>
            <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
                <div className={`flex flex-col sm:flex-row sm:items-center gap-4 ${embedded ? "sm:justify-end" : "sm:justify-between"}`}>
                    {!embedded && (
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold">Templates</h1>
                            <p className="text-muted-foreground text-sm md:text-base">
                                Gerencie templates de mensagem do WhatsApp Business
                            </p>
                        </div>
                    )}
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
                            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                                            <p className="text-[11px] text-muted-foreground">
                                                A Meta pode reclassificar automaticamente se o conteudo nao corresponder a categoria escolhida.
                                            </p>
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
                                            placeholder="Clinbia - Gestao Inteligente"
                                            value={newFooterText}
                                            onChange={(e) => setNewFooterText(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Botoes de resposta rapida (opcional)</Label>
                                        {newButtons.map((btn, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <Input
                                                    placeholder={`Botao ${idx + 1} (ex: Confirmar)`}
                                                    value={btn}
                                                    maxLength={25}
                                                    onChange={(e) => {
                                                        const arr = [...newButtons];
                                                        arr[idx] = e.target.value;
                                                        setNewButtons(arr);
                                                    }}
                                                />
                                                <Button
                                                    type="button" size="sm" variant="ghost"
                                                    className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
                                                    onClick={() => setNewButtons(newButtons.filter((_, i) => i !== idx))}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                        {newButtons.length < 10 && (
                                            <Button
                                                type="button" size="sm" variant="outline" className="h-7 text-xs"
                                                onClick={() => setNewButtons([...newButtons, ""])}
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> Adicionar botao
                                            </Button>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            O cliente responde tocando no botao. Max. 25 caracteres por botao; com mais de 3, o WhatsApp exibe "Ver todas as opcoes".
                                        </p>
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

                {/* Template padrão da conta (recorrência) — acima da lista na aba Recorrência */}
                {kindTab === "recurrence" && <RecurrenceDefaultTemplateCard />}

                <Card>
                    <CardHeader className="p-4 md:p-6 space-y-3">
                        <CardTitle className="text-base md:text-lg">
                            Templates ({templates?.length || 0})
                        </CardTitle>
                        {/* Abas por tipo: Personalizados (cliente) | Automáticos (sys_*) | Recorrência (rec_*) */}
                        <Tabs value={kindTab} onValueChange={(v) => setKindTab(v as TemplateKind)}>
                            <TabsList data-tour="templates-kinds" className="w-full sm:w-auto overflow-x-auto flex-nowrap justify-start">
                                {TEMPLATE_KINDS.map((kind) => (
                                    <TabsTrigger key={kind} value={kind} className="shrink-0 text-xs md:text-sm">
                                        {kind === "custom" ? "Templates Personalizados" : TEMPLATE_KIND_LABELS[kind]}
                                        {" "}({(templates || []).filter((t: any) => getTemplateKind(t.name) === kind).length})
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                        {loadingTemplates ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : templates && templates.filter((t: any) => getTemplateKind(t.name) === kindTab).length > 0 ? (
                            <div className="space-y-3">
                                {templates.filter((t: any) => getTemplateKind(t.name) === kindTab).map((tpl: any) => {
                                    const bodyComponent = tpl.components?.find((c: any) => c.type === 'BODY');
                                    const headerComponent = tpl.components?.find((c: any) => c.type === 'HEADER');
                                    const footerComponent = tpl.components?.find((c: any) => c.type === 'FOOTER');
                                    const buttonsComponent = tpl.components?.find((c: any) => c.type === 'BUTTONS');
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
                                                            {SYS_TEMPLATE_META[tpl.name] && (
                                                                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 border">
                                                                    <Bot className="h-3 w-3 mr-1" /> Template Automatizado
                                                                </Badge>
                                                            )}
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
                                                    {SYS_TEMPLATE_META[tpl.name] && (
                                                        <div
                                                            onClick={(e) => e.stopPropagation()}
                                                            title={isAutomationEnabled(tpl.name) ? "Envio automático ativado" : "Envio automático desativado"}
                                                        >
                                                            <Switch
                                                                checked={isAutomationEnabled(tpl.name)}
                                                                onCheckedChange={(v) => toggleAutomationMutation.mutate({ name: tpl.name, enabled: v })}
                                                                disabled={toggleAutomationMutation.isPending}
                                                                className="scale-90"
                                                            />
                                                        </div>
                                                    )}
                                                    {tpl.status?.toUpperCase() === 'APPROVED' && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                            onClick={(e) => { e.stopPropagation(); openSendDialog(tpl); }}>
                                                            <Send className="h-3 w-3 mr-1" /> Enviar
                                                        </Button>
                                                    )}
                                                    {['APPROVED', 'REJECTED', 'PAUSED'].includes(tpl.status?.toUpperCase()) && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                            onClick={(e) => { e.stopPropagation(); openEditDialog(tpl); }}>
                                                            <Pencil className="h-3 w-3 mr-1" /> Editar
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="ghost"
                                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(tpl.name); }}
                                                        disabled={deleteMutation.isPending}>
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
                                                    {buttonsComponent?.buttons?.length > 0 && (
                                                        <div>
                                                            <span className="font-medium text-xs text-muted-foreground">BOTOES:</span>
                                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                                {buttonsComponent.buttons.map((b: any, i: number) => (
                                                                    <Badge key={i} variant="outline" className="text-xs font-normal">
                                                                        {b.text}
                                                                    </Badge>
                                                                ))}
                                                            </div>
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
                                <p className="text-muted-foreground mb-2">
                                    {kindTab === "custom"
                                        ? "Nenhum template personalizado encontrado."
                                        : kindTab === "system"
                                            ? "Nenhum template automático encontrado."
                                            : "Nenhum template de recorrência encontrado."}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {kindTab === "custom"
                                        ? 'Clique em "Sincronizar" para buscar templates existentes ou crie um novo.'
                                        : kindTab === "system"
                                            ? "Os templates de confirmação/lembrete/pesquisa são criados automaticamente pelo sistema."
                                            : "O template padrão (rec_default) é enviado à Meta ao conectar a instância; templates por serviço são criados ao salvar mensagens personalizadas no serviço."}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
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

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar Template</DialogTitle>
                        <DialogDescription>
                            "{editTemplate?.name}" — nome e idioma nao podem ser alterados. Apos salvar, o template volta para revisao da Meta e so sera enviado quando aprovado novamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {editTemplate && SYS_TEMPLATE_META[editTemplate.name] && (
                            <div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-700 dark:text-blue-400 flex gap-2">
                                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{SYS_TEMPLATE_META[editTemplate.name].interval}</span>
                            </div>
                        )}
                        {editTemplate && !SYS_TEMPLATE_META[editTemplate.name] && (
                            <div className="space-y-2">
                                <Label>Cabecalho (opcional)</Label>
                                <Input
                                    placeholder="Titulo do template"
                                    value={editHeaderText}
                                    onChange={(e) => setEditHeaderText(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Corpo da mensagem</Label>
                            <Textarea
                                ref={editBodyRef}
                                value={editBodyText}
                                onChange={(e) => setEditBodyText(e.target.value)}
                                rows={6}
                            />
                            {editTemplate && !SYS_TEMPLATE_META[editTemplate.name] && (
                                <p className="text-xs text-muted-foreground">
                                    Use {"{{1}}"}, {"{{2}}"}, etc. para variaveis dinamicas.
                                </p>
                            )}
                        </div>
                        {editTemplate && SYS_TEMPLATE_META[editTemplate.name] && (
                            <div className="space-y-2">
                                <Label>Variaveis (clique para inserir no texto)</Label>
                                <div className="flex flex-wrap gap-2">
                                    {SYS_TEMPLATE_META[editTemplate.name].vars.map((v) => (
                                        <Button
                                            key={v.key}
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="h-7 text-xs"
                                            onClick={() => insertEditVariable(v.key)}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> {v.label}
                                        </Button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Os botoes de resposta rapida deste template sao fixos e serao mantidos automaticamente.
                                </p>
                            </div>
                        )}
                        {editTemplate && !SYS_TEMPLATE_META[editTemplate.name] && (
                            <div className="space-y-2">
                                <Label>Rodape (opcional)</Label>
                                <Input
                                    placeholder="Rodape do template"
                                    value={editFooterText}
                                    onChange={(e) => setEditFooterText(e.target.value)}
                                />
                            </div>
                        )}
                        {editTemplate && !SYS_TEMPLATE_META[editTemplate.name] && (
                            <div className="space-y-2">
                                <Label>Botoes de resposta rapida (opcional)</Label>
                                {editButtons.map((btn, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            placeholder={`Botao ${idx + 1} (ex: Confirmar)`}
                                            value={btn}
                                            maxLength={25}
                                            onChange={(e) => {
                                                const arr = [...editButtons];
                                                arr[idx] = e.target.value;
                                                setEditButtons(arr);
                                            }}
                                        />
                                        <Button
                                            type="button" size="sm" variant="ghost"
                                            className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
                                            onClick={() => setEditButtons(editButtons.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                                {editButtons.length < 10 && (
                                    <Button
                                        type="button" size="sm" variant="outline" className="h-7 text-xs"
                                        onClick={() => setEditButtons([...editButtons, ""])}
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Adicionar botao
                                    </Button>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Max. 25 caracteres por botao; com mais de 3, o WhatsApp exibe "Ver todas as opcoes".
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => editMutation.mutate()}
                            disabled={editMutation.isPending || !editBodyText.trim()}
                        >
                            {editMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                            ) : (
                                <><Pencil className="h-4 w-4 mr-2" /> Salvar alteracoes</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Templates;
