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
    XCircle, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Pencil, Bot, Image as ImageIcon
} from "lucide-react";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTemplateKind, TEMPLATE_KINDS, TEMPLATE_KIND_LABELS, type TemplateKind } from "@/lib/templateKind";
import {
    fileToBase64, uploadHeaderMediaToBucket, validateHeaderMedia, withTemplateParams,
    HEADER_MEDIA_RULES, type HeaderMediaFormat,
} from "@/lib/templateComponents";
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

// ── Botões ──────────────────────────────────────────────────────────────────
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

type TemplateButton = {
    type: ButtonType;
    text: string;
    url?: string;
    phone_number?: string;
    /** Código fixo do botão "Copiar código" (a Meta chama de example). */
    example?: string;
};

const BUTTON_TYPE_LABELS: Record<ButtonType, string> = {
    QUICK_REPLY: "Resposta rápida",
    URL: "Abrir link",
    PHONE_NUMBER: "Ligar",
    COPY_CODE: "Copiar código",
};

/**
 * Botões → componente BUTTONS da Meta, aplicando os limites dela.
 * Devolve também o código do cupom, que precisa ser reenviado em todo disparo
 * (a Meta exige o parâmetro coupon_code mesmo com o código fixo).
 */
function buildButtonsComponent(buttons: TemplateButton[]): { component: any | null; couponCode: string | null } {
    const list = buttons.filter((b) => (b.type === "COPY_CODE" ? !!b.example?.trim() : !!b.text.trim()));
    if (list.length === 0) return { component: null, couponCode: null };
    if (list.length > 10) throw new Error("Um template aceita no máximo 10 botões.");

    const count = (t: ButtonType) => list.filter((b) => b.type === t).length;
    if (count("URL") > 2) throw new Error("A Meta aceita no máximo 2 botões de link.");
    if (count("PHONE_NUMBER") > 1) throw new Error("A Meta aceita no máximo 1 botão de ligação.");
    if (count("COPY_CODE") > 1) throw new Error("A Meta aceita no máximo 1 botão de copiar código.");

    const labels = list.filter((b) => b.type !== "COPY_CODE").map((b) => b.text.trim());
    if (labels.some((t) => t.length > 25)) throw new Error("Cada botão pode ter no máximo 25 caracteres.");
    if (new Set(labels.map((t) => t.toLowerCase())).size !== labels.length) {
        throw new Error("Os textos dos botões devem ser diferentes entre si.");
    }

    // A Meta exige que as respostas rápidas fiquem agrupadas — mandamos por último.
    const ordered = [...list].sort(
        (a, b) => (a.type === "QUICK_REPLY" ? 1 : 0) - (b.type === "QUICK_REPLY" ? 1 : 0),
    );

    const metaButtons = ordered.map((b) => {
        const text = b.text.trim();
        if (b.type === "URL") {
            const url = (b.url || "").trim();
            if (!/^https?:\/\/\S+$/.test(url)) {
                throw new Error(`Informe um link começando com http:// ou https:// no botão "${text}".`);
            }
            return { type: "URL", text, url };
        }
        if (b.type === "PHONE_NUMBER") {
            const digits = (b.phone_number || "").replace(/\D/g, "");
            if (digits.length < 10) {
                throw new Error(`Informe o telefone com DDI e DDD no botão "${text}".`);
            }
            return { type: "PHONE_NUMBER", text, phone_number: `+${digits}` };
        }
        if (b.type === "COPY_CODE") {
            const code = (b.example || "").trim();
            if (code.length > 15) throw new Error("O código do cupom pode ter no máximo 15 caracteres.");
            return { type: "COPY_CODE", example: code };
        }
        return { type: "QUICK_REPLY", text };
    });

    return {
        component: { type: "BUTTONS", buttons: metaButtons },
        couponCode: ordered.find((b) => b.type === "COPY_CODE")?.example?.trim() || null,
    };
}

// ── Cabeçalho ───────────────────────────────────────────────────────────────
type HeaderType = "none" | "text" | "image" | "video" | "document" | "location";

const HEADER_TYPE_FORMAT: Record<HeaderType, string | null> = {
    none: null, text: "TEXT", image: "IMAGE", video: "VIDEO", document: "DOCUMENT", location: "LOCATION",
};

type HeaderState = {
    type: HeaderType;
    text: string;
    /** Arquivo novo escolhido agora (null = mantém o que já está salvo). */
    file: File | null;
    /** Mídia já salva (edição). */
    fileUrl: string;
    fileName: string;
    latitude: string;
    longitude: string;
    locName: string;
    locAddress: string;
};

/** Selo mostrado na lista para cabeçalhos que não são texto. */
const HEADER_BADGE: Record<string, string> = {
    IMAGE: "Com imagem", VIDEO: "Com video", DOCUMENT: "Com documento", LOCATION: "Com localizacao",
};

const EMPTY_HEADER: HeaderState = {
    type: "none", text: "", file: null, fileUrl: "", fileName: "",
    latitude: "", longitude: "", locName: "", locAddress: "",
};

/** Campos do cabeçalho — compartilhado pelos diálogos de criar e editar. */
function TemplateHeaderFields({
    value, onChange,
}: { value: HeaderState; onChange: (v: HeaderState) => void }) {
    const patch = (p: Partial<HeaderState>) => onChange({ ...value, ...p });
    const format = HEADER_TYPE_FORMAT[value.type];
    const mediaRule = format && format !== "TEXT" && format !== "LOCATION"
        ? HEADER_MEDIA_RULES[format as HeaderMediaFormat]
        : null;

    return (
        <div className="space-y-2">
            <Label>Cabecalho (opcional)</Label>
            <Select value={value.type} onValueChange={(v) => patch({ type: v as HeaderType, file: null })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Sem cabecalho</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Documento (PDF)</SelectItem>
                    <SelectItem value="location">Localizacao</SelectItem>
                </SelectContent>
            </Select>

            {value.type === "text" && (
                <Input
                    placeholder="Titulo do template"
                    value={value.text}
                    onChange={(e) => patch({ text: e.target.value })}
                />
            )}

            {mediaRule && (
                <div className="space-y-2">
                    {!value.file && value.fileUrl && (
                        value.type === "image" ? (
                            <img src={value.fileUrl} alt="Cabecalho atual" className="max-h-32 rounded border object-contain" />
                        ) : value.type === "video" ? (
                            <video src={value.fileUrl} controls className="max-h-32 rounded border" />
                        ) : (
                            <a href={value.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                                {value.fileName || "Documento atual"}
                            </a>
                        )
                    )}
                    <Input
                        type="file"
                        accept={mediaRule.accept}
                        onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            patch({ file, fileName: file?.name || value.fileName });
                        }}
                    />
                    {value.file && value.type === "image" && (
                        <img src={URL.createObjectURL(value.file)} alt="Previa do cabecalho" className="max-h-32 rounded border object-contain" />
                    )}
                    {value.file && value.type === "video" && (
                        <video src={URL.createObjectURL(value.file)} controls className="max-h-32 rounded border" />
                    )}
                    <p className="text-[11px] text-muted-foreground">
                        {mediaRule.label}. Este mesmo arquivo sera enviado em todos os disparos deste template.
                        {value.fileUrl ? " Deixe em branco para manter o arquivo atual." : ""}
                    </p>
                </div>
            )}

            {value.type === "location" && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            placeholder="Latitude (ex: -23.5617)"
                            value={value.latitude}
                            onChange={(e) => patch({ latitude: e.target.value })}
                        />
                        <Input
                            placeholder="Longitude (ex: -46.6560)"
                            value={value.longitude}
                            onChange={(e) => patch({ longitude: e.target.value })}
                        />
                    </div>
                    <Input
                        placeholder="Nome do local (ex: Clinica Central)"
                        value={value.locName}
                        onChange={(e) => patch({ locName: e.target.value })}
                    />
                    <Input
                        placeholder="Endereco completo"
                        value={value.locAddress}
                        onChange={(e) => patch({ locAddress: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        O mapa e fixo: todos os disparos deste template mostram este endereco.
                    </p>
                </div>
            )}
        </div>
    );
}

/** Lista de botões — compartilhada pelos diálogos de criar e editar. */
function TemplateButtonsEditor({
    value, onChange,
}: { value: TemplateButton[]; onChange: (v: TemplateButton[]) => void }) {
    const patch = (idx: number, p: Partial<TemplateButton>) =>
        onChange(value.map((b, i) => (i === idx ? { ...b, ...p } : b)));

    return (
        <div className="space-y-2">
            <Label>Botoes (opcional)</Label>
            {value.map((btn, idx) => (
                <div key={idx} className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <Select value={btn.type} onValueChange={(v) => patch(idx, { type: v as ButtonType })}>
                            <SelectTrigger className="h-8 w-[170px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(BUTTON_TYPE_LABELS).map(([k, label]) => (
                                    <SelectItem key={k} value={k}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {btn.type !== "COPY_CODE" && (
                            <Input
                                placeholder={`Texto do botao ${idx + 1}`}
                                value={btn.text}
                                maxLength={25}
                                onChange={(e) => patch(idx, { text: e.target.value })}
                            />
                        )}
                        {btn.type === "COPY_CODE" && (
                            <Input
                                placeholder="Codigo a copiar (ex: PROMO10)"
                                value={btn.example || ""}
                                maxLength={15}
                                onChange={(e) => patch(idx, { example: e.target.value })}
                            />
                        )}
                        <Button
                            type="button" size="sm" variant="ghost"
                            className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => onChange(value.filter((_, i) => i !== idx))}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    {btn.type === "URL" && (
                        <Input
                            placeholder="https://sua-clinica.com.br/agendar"
                            value={btn.url || ""}
                            onChange={(e) => patch(idx, { url: e.target.value })}
                        />
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                        <Input
                            placeholder="+55 11 99999-9999"
                            value={btn.phone_number || ""}
                            onChange={(e) => patch(idx, { phone_number: e.target.value })}
                        />
                    )}
                </div>
            ))}
            {value.length < 10 && (
                <Button
                    type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => onChange([...value, { type: "QUICK_REPLY", text: "" }])}
                >
                    <Plus className="h-3 w-3 mr-1" /> Adicionar botao
                </Button>
            )}
            <p className="text-xs text-muted-foreground">
                Max. 25 caracteres por botao. Limites da Meta: ate 2 links, 1 ligacao e 1 copiar codigo;
                com mais de 3 botoes, o WhatsApp exibe "Ver todas as opcoes".
            </p>
        </div>
    );
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
    const [editHeader, setEditHeader] = useState<HeaderState>(EMPTY_HEADER);
    const [editFooterText, setEditFooterText] = useState("");
    const [editButtons, setEditButtons] = useState<TemplateButton[]>([]);
    const editBodyRef = useRef<HTMLTextAreaElement>(null);

    // Form state
    const [newName, setNewName] = useState("");
    const [newCategory, setNewCategory] = useState("UTILITY");
    const [newLanguage, setNewLanguage] = useState("pt_BR");
    const [newBodyText, setNewBodyText] = useState("");
    const [newHeader, setNewHeader] = useState<HeaderState>(EMPTY_HEADER);
    const [newFooterText, setNewFooterText] = useState("");
    const [newButtons, setNewButtons] = useState<TemplateButton[]>([]);

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

    /**
     * Monta o componente HEADER para a Meta e devolve o que precisa ser gravado
     * em coluna própria (a action `sync` sobrescreve `components`).
     * `media_url`/`media_name` ficam `undefined` quando o arquivo não mudou, para
     * a edge function não apagar o que já está salvo.
     */
    const resolveHeader = async (header: HeaderState) => {
        const format = HEADER_TYPE_FORMAT[header.type];
        const empty = { component: null as any, media_url: null as any, media_name: null as any, location: null as any };
        if (!format) return empty;

        if (format === "TEXT") {
            if (!header.text.trim()) throw new Error("Escreva o texto do cabecalho.");
            return { ...empty, component: { type: "HEADER", format: "TEXT", text: header.text.trim() } };
        }

        if (format === "LOCATION") {
            const lat = Number(header.latitude.replace(",", "."));
            const lng = Number(header.longitude.replace(",", "."));
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                throw new Error("Informe latitude e longitude do cabecalho de localizacao.");
            }
            if (!header.locName.trim() || !header.locAddress.trim()) {
                throw new Error("Informe o nome e o endereco do local.");
            }
            return {
                ...empty,
                component: { type: "HEADER", format: "LOCATION" },
                location: { latitude: lat, longitude: lng, name: header.locName.trim(), address: header.locAddress.trim() },
            };
        }

        // Mídia: a URL pública é o que vai em TODO envio; o handle só aprova.
        let file = header.file;
        let mediaUrl: string | null | undefined;
        let mediaName: string | null | undefined;
        if (!file) {
            if (!header.fileUrl) throw new Error("Escolha o arquivo do cabecalho.");
            // A Meta exige um handle novo a cada edição: reenvia o arquivo salvo.
            const blob = await (await fetch(header.fileUrl)).blob();
            file = new File([blob], header.fileName || "header", { type: blob.type });
        } else {
            const invalid = validateHeaderMedia(file, format as HeaderMediaFormat);
            if (invalid) throw new Error(invalid);
            if (!ownerId) throw new Error("Sem usuario");
            mediaUrl = await uploadHeaderMediaToBucket(file, ownerId);
            mediaName = format === "DOCUMENT" ? file.name : null;
        }
        const { handle } = await callTemplateApi({
            action: 'upload_header_handle',
            user_id: user!.id,
            instance_id: activeInstance!.id,
            file_base64: await fileToBase64(file),
            file_name: file.name,
            file_type: file.type,
        });
        return {
            component: { type: "HEADER", format, example: { header_handle: [handle] } },
            media_url: mediaUrl,
            media_name: mediaName,
            location: null,
        };
    };

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
            const header = await resolveHeader(newHeader);
            if (header.component) components.push(header.component);
            components.push({ type: "BODY", text: bodyText });
            if (newFooterText.trim()) {
                components.push({ type: "FOOTER", text: newFooterText.trim() });
            }
            const { component: buttonsComponent, couponCode } = buildButtonsComponent(newButtons);
            if (buttonsComponent) components.push(buttonsComponent);
            return await callTemplateApi({
                action: 'create',
                user_id: user.id,
                instance_id: activeInstance.id,
                name: newName.trim(),
                category: newCategory,
                language: newLanguage,
                components,
                header_media_url: header.media_url ?? null,
                header_media_name: header.media_name ?? null,
                header_location: header.location,
                button_coupon_code: couponCode,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            toast({ title: "Template criado!", description: "Aguardando aprovacao da Meta." });
            setCreateDialogOpen(false);
            setNewName(""); setNewCategory("UTILITY"); setNewLanguage("pt_BR");
            setNewBodyText(""); setNewFooterText("");
            setNewHeader(EMPTY_HEADER);
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
            const header = sysMeta
                ? null
                : await resolveHeader(editHeader);
            if (header?.component) components.push(header.component);
            components.push({ type: "BODY", text: bodyText });
            if (!sysMeta && editFooterText.trim()) {
                components.push({ type: "FOOTER", text: editFooterText.trim() });
            }
            let couponCode: string | null | undefined;
            if (!sysMeta) {
                const built = buildButtonsComponent(editButtons);
                if (built.component) components.push(built.component);
                couponCode = built.couponCode;
            }
            components.push(...otherComponents);

            return await callTemplateApi({
                action: 'edit',
                user_id: user.id,
                instance_id: activeInstance.id,
                name: editTemplate.name,
                components,
                variable_map: variableMap,
                header_media_url: header?.media_url,
                header_media_name: header?.media_name,
                header_location: header ? header.location : undefined,
                button_coupon_code: couponCode,
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
        const headerComp = tpl.components?.find((c: any) => c.type === 'HEADER');
        const headerFmt = String(tpl.header_format || headerComp?.format || "").toUpperCase();
        const headerType = (Object.entries(HEADER_TYPE_FORMAT)
            .find(([, fmt]) => fmt === headerFmt)?.[0] as HeaderType) || (headerComp ? "text" : "none");
        const loc = tpl.header_location || {};
        setEditHeader({
            type: headerType,
            text: headerComp?.text || "",
            file: null,
            fileUrl: tpl.header_media_url || "",
            fileName: tpl.header_media_name || "",
            latitude: loc.latitude !== undefined && loc.latitude !== null ? String(loc.latitude) : "",
            longitude: loc.longitude !== undefined && loc.longitude !== null ? String(loc.longitude) : "",
            locName: loc.name || "",
            locAddress: loc.address || "",
        });
        setEditFooterText(tpl.components?.find((c: any) => c.type === 'FOOTER')?.text || "");
        const buttonsComponent = tpl.components?.find((c: any) => c.type === 'BUTTONS');
        setEditButtons(
            (buttonsComponent?.buttons || []).map((b: any) => {
                const type = String(b.type || "").toUpperCase();
                const isKnown = ["URL", "PHONE_NUMBER", "COPY_CODE"].includes(type);
                return {
                    type: (isKnown ? type : "QUICK_REPLY") as ButtonType,
                    text: b.text || "",
                    url: b.url || "",
                    phone_number: b.phone_number || "",
                    // A Meta devolve example ora como string, ora como array.
                    example: type === "COPY_CODE"
                        ? tpl.button_coupon_code || (Array.isArray(b.example) ? b.example[0] : b.example) || ""
                        : "",
                };
            })
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
            // Cabeçalho de mídia/localização e botão de cupom são fixos no template,
            // mas a Meta exige os parâmetros em TODO disparo.
            templateComponents = withTemplateParams(selectedTemplate, templateComponents);

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
                                    <TemplateHeaderFields value={newHeader} onChange={setNewHeader} />
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
                                    <TemplateButtonsEditor value={newButtons} onChange={setNewButtons} />
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
                                                            {HEADER_BADGE[String(tpl.header_format || "").toUpperCase()] && (
                                                                <Badge variant="outline" className="text-[10px]">
                                                                    <ImageIcon className="h-3 w-3 mr-1" />
                                                                    {HEADER_BADGE[String(tpl.header_format).toUpperCase()]}
                                                                </Badge>
                                                            )}
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
                                                            {(() => {
                                                                const fmt = String(tpl.header_format || headerComponent.format || "TEXT").toUpperCase();
                                                                if (fmt === "TEXT") return <p>{headerComponent.text}</p>;
                                                                if (fmt === "LOCATION") {
                                                                    const loc = tpl.header_location;
                                                                    return loc?.address ? (
                                                                        <p className="text-xs">{loc.name} — {loc.address}</p>
                                                                    ) : (
                                                                        <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                                                                            <AlertTriangle className="h-3 w-3" />
                                                                            Cabecalho de localizacao sem endereco salvo — edite o template e informe o local.
                                                                        </p>
                                                                    );
                                                                }
                                                                if (!tpl.header_media_url) {
                                                                    return (
                                                                        <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                                                                            <AlertTriangle className="h-3 w-3" />
                                                                            Cabecalho de midia sem arquivo salvo — edite o template e escolha o arquivo.
                                                                        </p>
                                                                    );
                                                                }
                                                                if (fmt === "IMAGE") {
                                                                    return <img src={tpl.header_media_url} alt="Cabecalho do template" className="max-h-32 rounded border object-contain mt-1" />;
                                                                }
                                                                if (fmt === "VIDEO") {
                                                                    return <video src={tpl.header_media_url} controls className="max-h-32 rounded border mt-1" />;
                                                                }
                                                                return (
                                                                    <a href={tpl.header_media_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline block mt-1">
                                                                        {tpl.header_media_name || "Documento do cabecalho"}
                                                                    </a>
                                                                );
                                                            })()}
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
                                                                        {b.text || "Copiar codigo"}
                                                                        {b.type && b.type !== "QUICK_REPLY" && (
                                                                            <span className="text-muted-foreground ml-1">
                                                                                ({BUTTON_TYPE_LABELS[b.type as ButtonType] || b.type})
                                                                            </span>
                                                                        )}
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
                            <TemplateHeaderFields value={editHeader} onChange={setEditHeader} />
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
                            <TemplateButtonsEditor value={editButtons} onChange={setEditButtons} />
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
