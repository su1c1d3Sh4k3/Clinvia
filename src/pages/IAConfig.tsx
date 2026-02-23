import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Ban, Target, HelpCircle, Settings, Plus, Trash2, Loader2, Play, Heart } from "lucide-react";

interface IAConfigData {
    id?: string;
    user_id?: string;
    agent_name: string;
    name: string;
    address: string;
    link_google: string;
    site: string;
    instagram: string;
    facebook: string;
    description: string;
    welcome: string;
    opening_hours: string;
    payment: string;
    restrictions: string;
    qualify: string;
    frequent_questions: string;
    ia_on: boolean;
    delay: number;
    followup: boolean;
    fup1: boolean;
    fup2: boolean;
    fup3: boolean;
    fup1_time: number;
    fup2_time: number;
    fup3_time: number;
    fup1_message: string;
    fup2_message: string;
    fup3_message: string;
    crm_auto: boolean;
    scheduling_on: boolean;
    followup_business_hours: boolean;
    voice: boolean;
    genre: string;
    convenio: string;
}

interface QualifyItem {
    productId: string;
    productName: string;
    text: string;
}

interface RestrictionItem {
    id: string;
    text: string;
}

interface ConvenioItem {
    id: string;
    nome: string;
    valorPrimeira: string;
    valorDemais: string;
    previsaoDias: number;
}

const defaultConfig: IAConfigData = {
    agent_name: "",
    name: "",
    address: "",
    link_google: "",
    site: "",
    instagram: "",
    facebook: "",
    description: "",
    welcome: "",
    opening_hours: "",
    payment: "",
    restrictions: "",
    qualify: "",
    frequent_questions: "",
    ia_on: false,
    delay: 15,
    followup: false,
    fup1: false,
    fup2: false,
    fup3: false,
    fup1_time: 60,
    fup2_time: 120,
    fup3_time: 180,
    fup1_message: "",
    fup2_message: "",
    fup3_message: "",
    crm_auto: false,
    scheduling_on: false,
    followup_business_hours: false,
    voice: false,
    genre: "female",
    convenio: "",
};

export default function IAConfig() {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const { data: userRole } = useUserRole();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<IAConfigData>(defaultConfig);

    // Redirecionar agentes para página principal
    useEffect(() => {
        if (userRole === 'agent') {
            navigate('/', { replace: true });
        }
    }, [userRole, navigate]);

    // Estados para campos dinâmicos
    const [restrictions, setRestrictions] = useState<RestrictionItem[]>([]);
    const [qualifyItems, setQualifyItems] = useState<QualifyItem[]>([]);
    const [faqItems, setFaqItems] = useState<QualifyItem[]>([]);
    const [companyFaq, setCompanyFaq] = useState<string>(""); // Dúvidas sobre a empresa
    const [convenioItems, setConvenioItems] = useState<ConvenioItem[]>([]); // Convênios
    const [showCreateFunnelModal, setShowCreateFunnelModal] = useState(false); // Modal de criação do funil IA
    const [creatingFunnel, setCreatingFunnel] = useState(false); // Loading da criação do funil
    const [playingVoice, setPlayingVoice] = useState(false); // Loading do preview de voz
    const [togglingIA, setTogglingIA] = useState(false); // Loading do toggle de IA

    // Buscar configuração existente
    const { data: existingConfig, isLoading: isLoadingConfig } = useQuery({
        queryKey: ["ia-config", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ia_config" as any)
                .select("*")
                .eq("user_id", ownerId)
                .single();

            if (error && error.code !== "PGRST116") throw error;
            return data as IAConfigData | null;
        },
        enabled: !!ownerId,
    });

    // Buscar instâncias WhatsApp conectadas
    const { data: whatsappInstances, refetch: refetchWhatsapp } = useQuery({
        queryKey: ["whatsapp-instances-ia", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("id, name, instance_name, status, ia_on_wpp, apikey, client_number")
                .eq("status", "connected")
                .order("name");

            if (error) throw error;
            return data as { id: string; name: string; instance_name: string | null; status: string; ia_on_wpp: boolean | null; apikey: string | null; client_number: string | null }[];
        },
        enabled: !!ownerId,
    });

    // Buscar instâncias Instagram conectadas
    const { data: instagramInstances, refetch: refetchInstagram } = useQuery({
        queryKey: ["instagram-instances-ia", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instagram_instances" as any)
                .select("id, account_name, status, ia_on_insta")
                .eq("status", "connected")
                .order("account_name");

            if (error) throw error;
            return data as { id: string; account_name: string; status: string; ia_on_insta: boolean | null }[];
        },
        enabled: !!ownerId,
    });

    // Buscar produtos/serviços para os selects
    const { data: productsServices } = useQuery({
        queryKey: ["products-services-select"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services" as any)
                .select("id, name, type")
                .order("name");

            if (error) throw error;
            return data as { id: string; name: string; type: string }[];
        },
        enabled: !!user?.id,
    });

    // Carregar dados existentes
    useEffect(() => {
        if (existingConfig) {
            setConfig(existingConfig);

            // Parse restrictions
            if (existingConfig.restrictions) {
                const items = existingConfig.restrictions
                    .split("\n")
                    .filter((line: string) => line.trim().startsWith("-"))
                    .map((line: string, index: number) => ({
                        id: `rest-${index}`,
                        text: line.replace(/^-\s*/, "").trim(),
                    }));
                setRestrictions(items);
            }

            // Parse qualify
            if (existingConfig.qualify) {
                const items = parseProductText(existingConfig.qualify);
                setQualifyItems(items);
            }

            // Parse FAQ
            if (existingConfig.frequent_questions) {
                const allItems = parseProductText(existingConfig.frequent_questions);
                // Separar dúvidas da empresa dos demais
                const companyItem = allItems.find(item => item.productName === "Dúvidas frequentes sobre a empresa");
                const productItems = allItems.filter(item => item.productName !== "Dúvidas frequentes sobre a empresa");

                if (companyItem) {
                    setCompanyFaq(companyItem.text);
                }
                setFaqItems(productItems);
            }

            // Parse convenios
            if (existingConfig.convenio) {
                const items = parseConvenioText(existingConfig.convenio);
                setConvenioItems(items);
            }
        }
    }, [existingConfig, productsServices]);

    // Parser simples para campos de produto/texto
    // Formato esperado: "1. - NomeProduto:\nconteúdo\n\n2. - OutroProduto:\nconteúdo"
    const parseProductText = (text: string): QualifyItem[] => {
        const items: QualifyItem[] = [];
        if (!text || !text.trim()) return items;

        // Split por dupla quebra de linha para separar blocos
        const blocks = text.split("\n\n");
        let currentItem: QualifyItem | null = null;

        for (const block of blocks) {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            // Procurar primeira linha que contém o nome do produto
            const lines = trimmedBlock.split("\n");
            const firstLine = lines[0] || "";

            // Extrair nome do produto
            let productName = "";
            let isNewItem = false;

            // Tentar formato numerado: "1. - NomeProduto:"
            if (firstLine.match(/^\d+\.\s*-\s*.+:$/)) {
                productName = firstLine.replace(/^\d+\.\s*-\s*/, "").replace(/:$/, "").trim();
                isNewItem = true;
            }
            // Tentar formato sem número: "- NomeProduto:"
            else if (firstLine.match(/^-\s*.+:$/)) {
                productName = firstLine.replace(/^-\s*/, "").replace(/:$/, "").trim();
                isNewItem = true;
            }

            if (isNewItem && productName) {
                // Conteúdo é tudo depois da primeira linha
                const content = lines.slice(1).join("\n").trim();
                const product = productsServices?.find((p) => p.name === productName);

                currentItem = {
                    productId: product?.id || "",
                    productName,
                    text: content,
                };
                items.push(currentItem);
            } else {
                // Se não é um novo item (não tem cabeçalho), considera continuação do item anterior
                // Isso resolve o problema de parágrafos separados por quebra de linha dupla
                if (currentItem) {
                    currentItem.text += "\n\n" + trimmedBlock;
                }
            }
        }

        return items;
    };

    // Formatar restrições para salvar
    const formatRestrictions = (): string => {
        return restrictions
            .filter((r) => r.text.trim())
            .map((r) => `- ${r.text}`)
            .join("\n");
    };

    // Formatar qualify/faq para salvar com numeração
    const formatProductItems = (items: QualifyItem[], companyFaqText?: string): string => {
        const allItems: string[] = [];
        let index = 1;

        // Adicionar dúvidas da empresa primeiro se existir
        if (companyFaqText && companyFaqText.trim()) {
            allItems.push(`${index}. - Dúvidas frequentes sobre a empresa:\n${companyFaqText.trim()}`);
            index++;
        }

        // Adicionar itens de produto/serviço
        items
            .filter((item) => item.productName && item.text.trim())
            .forEach((item) => {
                allItems.push(`${index}. - ${item.productName}:\n${item.text}`);
                index++;
            });

        return allItems.join("\n\n");
    };

    // Parser para convênios
    // Formato: "1. Nome\n- Valor da Primeira Consulta: R$ X\n- Valor das Demais Consultas: R$ X\n- Previsão de agendamento para X dias"
    const parseConvenioText = (text: string): ConvenioItem[] => {
        if (!text?.trim()) return [];

        const items: ConvenioItem[] = [];
        const blocks = text.split(/\n\n+/);

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 1) continue;

            // Primeira linha: "1. Nome do Convênio"
            const nomeMatch = lines[0].match(/^\d+\.\s*(.+)$/);
            if (!nomeMatch) continue;

            const nome = nomeMatch[1].trim();
            let valorPrimeira = "R$ 0,00";
            let valorDemais = "R$ 0,00";
            let previsaoDias = 0;

            for (const line of lines.slice(1)) {
                const valorPrimeiraMatch = line.match(/Valor da Primeira Consulta:\s*(R\$\s*[\d.,]+)/i);
                const valorDemaisMatch = line.match(/Valor das Demais Consultas:\s*(R\$\s*[\d.,]+)/i);
                const previsaoMatch = line.match(/Previsão de agendamento para\s*(\d+)\s*dias?/i);

                if (valorPrimeiraMatch) valorPrimeira = valorPrimeiraMatch[1];
                if (valorDemaisMatch) valorDemais = valorDemaisMatch[1];
                if (previsaoMatch) previsaoDias = parseInt(previsaoMatch[1]) || 0;
            }

            items.push({
                id: `convenio-${items.length}`,
                nome,
                valorPrimeira,
                valorDemais,
                previsaoDias,
            });
        }

        return items;
    };

    // Formatar convênios para salvar
    const formatConvenioItems = (): string => {
        return convenioItems
            .filter((c) => c.nome.trim())
            .map((c, index) => {
                return `${index + 1}. ${c.nome}\n- Valor da Primeira Consulta: ${c.valorPrimeira || "R$ 0,00"}\n- Valor das Demais Consultas: ${c.valorDemais || "R$ 0,00"}\n- Previsão de agendamento para ${c.previsaoDias || 0} dias`;
            })
            .join("\n\n");
    };

    // Salvar configuração
    const saveMutation = useMutation({
        mutationFn: async (data: Partial<IAConfigData>) => {
            const payload = {
                ...data,
                user_id: ownerId,
                restrictions: formatRestrictions(),
                qualify: formatProductItems(qualifyItems),
                frequent_questions: formatProductItems(faqItems, companyFaq),
                convenio: formatConvenioItems(),
            };

            const { data: result, error } = await supabase
                .from("ia_config" as any)
                .upsert(payload, { onConflict: "user_id" })
                .select()
                .single();

            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ia-config"] });
            toast.success("Configurações salvas com sucesso!");
        },
        onError: (error: any) => {
            console.error("Error saving config:", error);
            toast.error("Erro ao salvar configurações");
        },
    });

    const handleSave = () => {
        saveMutation.mutate(config);
    };

    // Handlers para Restrições
    const addRestriction = () => {
        setRestrictions([...restrictions, { id: `rest-${Date.now()}`, text: "" }]);
    };

    const updateRestriction = (id: string, text: string) => {
        setRestrictions(restrictions.map((r) => (r.id === id ? { ...r, text } : r)));
    };

    const removeRestriction = (id: string) => {
        setRestrictions(restrictions.filter((r) => r.id !== id));
    };

    // Handlers para Qualificação
    const addQualifyItem = () => {
        setQualifyItems([...qualifyItems, { productId: "", productName: "", text: "" }]);
    };

    const updateQualifyItem = (index: number, field: keyof QualifyItem, value: string) => {
        const updated = [...qualifyItems];
        updated[index] = { ...updated[index], [field]: value };

        // Se mudou o productId, atualizar o productName
        if (field === "productId") {
            const product = productsServices?.find((p) => p.id === value);
            updated[index].productName = product?.name || "";
        }

        setQualifyItems(updated);
    };

    const removeQualifyItem = (index: number) => {
        setQualifyItems(qualifyItems.filter((_, i) => i !== index));
    };

    // Handlers para FAQ
    const addFaqItem = () => {
        setFaqItems([...faqItems, { productId: "", productName: "", text: "" }]);
    };

    const updateFaqItem = (index: number, field: keyof QualifyItem, value: string) => {
        const updated = [...faqItems];
        updated[index] = { ...updated[index], [field]: value };

        if (field === "productId") {
            const product = productsServices?.find((p) => p.id === value);
            updated[index].productName = product?.name || "";
        }

        setFaqItems(updated);
    };

    const removeFaqItem = (index: number) => {
        setFaqItems(faqItems.filter((_, i) => i !== index));
    };

    // Handlers para Convênios
    const addConvenioItem = () => {
        setConvenioItems([...convenioItems, {
            id: `convenio-${Date.now()}`,
            nome: "",
            valorPrimeira: "R$ 0,00",
            valorDemais: "R$ 0,00",
            previsaoDias: 0
        }]);
    };

    const updateConvenioItem = (index: number, field: keyof ConvenioItem, value: string | number) => {
        const updated = [...convenioItems];
        updated[index] = { ...updated[index], [field]: value };
        setConvenioItems(updated);
    };

    const removeConvenioItem = (index: number) => {
        setConvenioItems(convenioItems.filter((_, i) => i !== index));
    };

    // Formatar valor como moeda brasileira
    const formatCurrency = (value: string): string => {
        // Remove tudo exceto números
        const numbers = value.replace(/\D/g, "");
        // Converte para centavos
        const cents = parseInt(numbers || "0", 10);
        // Formata como moeda
        const reais = (cents / 100).toFixed(2);
        return `R$ ${reais.replace(".", ",")}`;
    };

    const handleCurrencyChange = (index: number, field: "valorPrimeira" | "valorDemais", value: string) => {
        const formatted = formatCurrency(value);
        updateConvenioItem(index, field, formatted);
    };

    // Handler do switch "Ligar IA" - apenas abre a lista de instâncias (não dispara webhook)
    const handleIAToggle = async (checked: boolean) => {
        // Verificar se pode desligar (nenhuma instância deve estar ligada)
        if (!checked) {
            const hasActiveWhatsapp = whatsappInstances?.some(i => i.ia_on_wpp === true);
            const hasActiveInstagram = instagramInstances?.some((i: any) => i.ia_on_insta === true);

            if (hasActiveWhatsapp || hasActiveInstagram) {
                toast.error("Desative todas as instâncias antes de desligar a IA");
                return;
            }
        }

        // Apenas atualiza o estado local (não dispara webhook, não ativa instâncias)
        setConfig({ ...config, ia_on: checked });
        toast.success(checked ? "IA ativada! Agora ative as instâncias desejadas." : "IA desativada com sucesso!");
    };

    // Verificar se pode desligar a IA (nenhuma instância ativa)
    const hasAnyActiveInstance = () => {
        const hasActiveWhatsapp = whatsappInstances?.some(i => i.ia_on_wpp === true);
        const hasActiveInstagram = instagramInstances?.some((i: any) => i.ia_on_insta === true);
        return hasActiveWhatsapp || hasActiveInstagram;
    };

    // Handler para toggle individual de instância WhatsApp - DISPARA WEBHOOK
    const handleWhatsappInstanceToggle = async (instanceId: string, checked: boolean) => {
        const instance = whatsappInstances?.find(i => i.id === instanceId);
        if (!instance) {
            toast.error("Instância não encontrada");
            return;
        }

        setTogglingIA(true);
        try {
            const action = checked ? "create" : "delete";

            console.log(`[IAConfig] Calling ia-workflow-webhook for instance ${instance.name} with action: ${action}`);

            // Chamar webhook via Edge Function (best-effort — não bloqueia update do banco)
            const { data: webhookResult, error: webhookError } = await supabase.functions.invoke(
                "ia-workflow-webhook",
                {
                    body: {
                        action,
                        user_id: ownerId,
                        instance_id: instanceId,
                        instance_name: instance.instance_name || "",
                        phone: instance.client_number || "",
                        token: instance.apikey || "",
                    },
                }
            );

            if (webhookError) {
                // Erro de invocação da Edge Function (rede, auth) — apenas loga, não bloqueia
                console.warn(`[IAConfig] Webhook invoke error for ${instance.name}:`, webhookError.message);
            } else if (!webhookResult?.success) {
                // Webhook externo falhou — apenas loga, não bloqueia
                console.warn(`[IAConfig] External webhook warning for ${instance.name}:`, webhookResult?.error);
            } else {
                console.log(`[IAConfig] Webhook OK for ${instance.name}:`, webhookResult);
            }

            // Atualizar status no banco (sempre, independente do webhook)
            const { error } = await supabase
                .from("instances")
                .update({ ia_on_wpp: checked })
                .eq("id", instanceId);

            if (error) throw error;

            refetchWhatsapp();
            toast.success(checked ? `IA ativada para ${instance.name}` : `IA desativada para ${instance.name}`);
        } catch (error) {
            console.error("[IAConfig] Error toggling WhatsApp instance:", error);
            toast.error("Erro ao atualizar instância. Tente novamente.");
        } finally {
            setTogglingIA(false);
        }
    };

    // Handler para toggle individual de instância Instagram - DISPARA WEBHOOK
    const handleInstagramInstanceToggle = async (instanceId: string, checked: boolean) => {
        const instance = instagramInstances?.find((i: any) => i.id === instanceId);
        if (!instance) {
            toast.error("Instância não encontrada");
            return;
        }

        setTogglingIA(true);
        try {
            const action = checked ? "create" : "delete";

            console.log(`[IAConfig] Calling ia-workflow-webhook for Instagram ${instance.account_name} with action: ${action}`);

            // Chamar webhook via Edge Function (best-effort — não bloqueia update do banco)
            const { data: webhookResult, error: webhookError } = await supabase.functions.invoke(
                "ia-workflow-webhook",
                {
                    body: {
                        action,
                        user_id: ownerId,
                        instance_id: instanceId,
                        instance_name: instance.account_name || "",
                        phone: "", // Instagram não tem phone
                        token: "", // Instagram não tem token
                        platform: "instagram",
                    },
                }
            );

            if (webhookError) {
                // Erro de invocação da Edge Function — apenas loga, não bloqueia
                console.warn(`[IAConfig] Webhook invoke error for ${instance.account_name}:`, webhookError.message);
            } else if (!webhookResult?.success) {
                // Webhook externo falhou — apenas loga, não bloqueia
                console.warn(`[IAConfig] External webhook warning for ${instance.account_name}:`, webhookResult?.error);
            } else {
                console.log(`[IAConfig] Webhook OK for ${instance.account_name}:`, webhookResult);
            }

            // Atualizar status no banco (sempre, independente do webhook)
            const { error } = await supabase
                .from("instagram_instances" as any)
                .update({ ia_on_insta: checked })
                .eq("id", instanceId);

            if (error) throw error;

            refetchInstagram();
            toast.success(checked ? `IA ativada para ${instance.account_name}` : `IA desativada para ${instance.account_name}`);
        } catch (error) {
            console.error("[IAConfig] Error toggling Instagram instance:", error);
            toast.error("Erro ao atualizar instância. Tente novamente.");
        } finally {
            setTogglingIA(false);
        }
    };

    // Handler do switch CRM Auto - verifica se precisa criar funil IA
    const handleCrmAutoChange = async (checked: boolean) => {
        if (checked) {
            // Verificar se já existe funil "Atendimento IA" ou antigo "IA" para este usuário
            const { data: existingFunnel } = await supabase
                .from("crm_funnels" as any)
                .select("id")
                .eq("user_id", ownerId)
                .or('name.eq.Atendimento IA,name.eq.IA')
                .maybeSingle();

            if (!existingFunnel) {
                // Não tem funil IA (caso de gap no trigger), disparar a sinc manual
                setShowCreateFunnelModal(true);
                return; // Não muda o switch ainda
            }
        }

        // Se já tem funil ou está desativando, atualiza normalmente
        setConfig({ ...config, crm_auto: checked });
    };

    // Resgatar os fluxos inalteráveis do sistema batendo na Function do Banco de Dados
    const createIAFunnel = async () => {
        setCreatingFunnel(true);
        try {
            // Acionar Function para provisionar os default funnels garantindo is_system=true
            const { error: rpcError } = await supabase.rpc('create_default_crm_funnels', { p_user_id: ownerId });

            if (rpcError) throw rpcError;

            // Atualiza o config e fecha o modal
            setConfig({ ...config, crm_auto: true });
            setShowCreateFunnelModal(false);
            toast.success("Funis de inteligência artificial habilitados!");
            queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
        } catch (error) {
            console.error("Erro ao sincronizar funis:", error);
            toast.error("Erro ao configurar funis da IA");
        } finally {
            setCreatingFunnel(false);
        }
    };

    if (isLoadingConfig) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-4 md:py-10 px-3 md:px-6 max-w-4xl animate-in fade-in duration-500">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8 text-foreground">Definições de IA</h1>

            <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-6 mb-4 md:mb-8 h-auto">
                    <TabsTrigger value="company" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Building2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Empresa</span>
                    </TabsTrigger>
                    <TabsTrigger value="restrictions" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Ban className="h-4 w-4" />
                        <span className="hidden sm:inline">Restrições</span>
                    </TabsTrigger>
                    <TabsTrigger value="qualify" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Target className="h-4 w-4" />
                        <span className="hidden sm:inline">Qualificação</span>
                    </TabsTrigger>
                    <TabsTrigger value="faq" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <HelpCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">F.A.Q</span>
                    </TabsTrigger>
                    <TabsTrigger value="convenio" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Heart className="h-4 w-4" />
                        <span className="hidden sm:inline">Convênio</span>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Settings className="h-4 w-4" />
                        <span className="hidden sm:inline">Config</span>
                    </TabsTrigger>
                </TabsList>

                {/* Aba: Sobre a Empresa */}
                <TabsContent value="company">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Sobre a Empresa</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Dados para a IA ter contexto sobre sua empresa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
                            {/* Linha 1: Nome do agente IA | Nome da empresa */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="agent_name">Nome do agente IA</Label>
                                    <Input
                                        id="agent_name"
                                        value={config.agent_name}
                                        onChange={(e) => setConfig({ ...config, agent_name: e.target.value })}
                                        placeholder="Ex: Luna, Clara, Sofia..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome da empresa</Label>
                                    <Input
                                        id="name"
                                        value={config.name}
                                        onChange={(e) => setConfig({ ...config, name: e.target.value })}
                                        placeholder="Nome da sua empresa"
                                    />
                                </div>
                            </div>

                            {/* Linha 2: Link de localização do Google | Site */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="link_google">Link de localização do Google</Label>
                                    <Input
                                        id="link_google"
                                        value={config.link_google}
                                        onChange={(e) => setConfig({ ...config, link_google: e.target.value })}
                                        placeholder="https://maps.google.com/..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="site">Site</Label>
                                    <Input
                                        id="site"
                                        value={config.site}
                                        onChange={(e) => setConfig({ ...config, site: e.target.value })}
                                        placeholder="https://www.seusite.com.br"
                                    />
                                </div>
                            </div>

                            {/* Linha 3: Instagram | Facebook */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="instagram">Instagram</Label>
                                    <Input
                                        id="instagram"
                                        value={config.instagram}
                                        onChange={(e) => setConfig({ ...config, instagram: e.target.value })}
                                        placeholder="@seuinstagram"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="facebook">Facebook</Label>
                                    <Input
                                        id="facebook"
                                        value={config.facebook}
                                        onChange={(e) => setConfig({ ...config, facebook: e.target.value })}
                                        placeholder="facebook.com/suapagina"
                                    />
                                </div>
                            </div>

                            {/* Linha 4: Endereço (sozinho) */}
                            <div className="space-y-2">
                                <Label htmlFor="address">Endereço</Label>
                                <Input
                                    id="address"
                                    value={config.address}
                                    onChange={(e) => setConfig({ ...config, address: e.target.value })}
                                    placeholder="Endereço completo"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Descrição da empresa</Label>
                                <Textarea
                                    id="description"
                                    value={config.description}
                                    onChange={(e) => setConfig({ ...config, description: e.target.value })}
                                    placeholder="Descreva sua empresa, produtos, serviços e diferenciais..."
                                    rows={4}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="welcome">Frase de boas vindas</Label>
                                <Textarea
                                    id="welcome"
                                    value={config.welcome}
                                    onChange={(e) => setConfig({ ...config, welcome: e.target.value })}
                                    placeholder="Mensagem que a IA usará para cumprimentar os clientes..."
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="opening_hours">Horário de funcionamento</Label>
                                    <Input
                                        id="opening_hours"
                                        value={config.opening_hours}
                                        onChange={(e) => setConfig({ ...config, opening_hours: e.target.value })}
                                        placeholder="Segunda a Sexta: 8h às 18h"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="payment">Formas de pagamento</Label>
                                    <Input
                                        id="payment"
                                        value={config.payment}
                                        onChange={(e) => setConfig({ ...config, payment: e.target.value })}
                                        placeholder="PIX, Cartão, Boleto..."
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba: Restrições */}
                <TabsContent value="restrictions">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Restrições</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                O que a IA NÃO deve fazer.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
                            {restrictions.map((restriction) => (
                                <div key={restriction.id} className="flex items-center gap-2">
                                    <Input
                                        value={restriction.text}
                                        onChange={(e) => updateRestriction(restriction.id, e.target.value)}
                                        placeholder="Não deve informar preços sem consultar a tabela..."
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeRestriction(restriction.id)}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}

                            <Button variant="outline" onClick={addRestriction} className="w-full">
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar Restrição
                            </Button>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba: Qualificação */}
                <TabsContent value="qualify">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Qualificação</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Perguntas para classificar leads.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4 md:space-y-6">
                            {qualifyItems.map((item, index) => (
                                <div key={index} className="relative border rounded-lg p-4 space-y-4">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeQualifyItem(index)}
                                        className="absolute top-2 right-2 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>

                                    <div className="space-y-2 pr-10">
                                        <Label>Produto/Serviço</Label>
                                        <Select
                                            value={item.productId}
                                            onValueChange={(value) => updateQualifyItem(index, "productId", value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um produto ou serviço" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {productsServices?.map((ps) => (
                                                    <SelectItem key={ps.id} value={ps.id}>
                                                        {ps.name} ({ps.type === "product" ? "Produto" : "Serviço"})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {item.productId && (
                                        <div className="space-y-2">
                                            <Label>Fluxo de qualificação</Label>
                                            <Textarea
                                                value={item.text}
                                                onChange={(e) => updateQualifyItem(index, "text", e.target.value)}
                                                placeholder="Defina as perguntas e critérios de qualificação para este item..."
                                                rows={4}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}

                            <Button variant="outline" onClick={addQualifyItem} className="w-full">
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar outro fluxo
                            </Button>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba: F.A.Q */}
                <TabsContent value="faq">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">F.A.Q</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Dúvidas frequentes sobre seus produtos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4 md:space-y-6">
                            {/* Campo fixo: Dúvidas sobre a empresa */}
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-base font-semibold">Dúvidas frequentes sobre a empresa</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Elenque as principais dúvidas relacionadas a empresa
                                    </p>
                                    <Textarea
                                        value={companyFaq}
                                        onChange={(e) => setCompanyFaq(e.target.value)}
                                        placeholder="P: Qual o horário de funcionamento?&#10;R: Funcionamos de segunda a sexta, das 8h às 18h...&#10;&#10;P: Onde fica a empresa?&#10;R: Estamos localizados na..."
                                        rows={6}
                                    />
                                </div>
                            </div>

                            {/* Itens dinâmicos de produto/serviço */}
                            {faqItems.map((item, index) => (
                                <div key={index} className="relative border rounded-lg p-4 space-y-4">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeFaqItem(index)}
                                        className="absolute top-2 right-2 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>

                                    <div className="space-y-2 pr-10">
                                        <Label>Produto/Serviço</Label>
                                        <Select
                                            value={item.productId}
                                            onValueChange={(value) => updateFaqItem(index, "productId", value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um produto ou serviço" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {productsServices?.map((ps) => (
                                                    <SelectItem key={ps.id} value={ps.id}>
                                                        {ps.name} ({ps.type === "product" ? "Produto" : "Serviço"})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {item.productId && (
                                        <div className="space-y-2">
                                            <Label>Perguntas e respostas sobre esse item</Label>
                                            <Textarea
                                                value={item.text}
                                                onChange={(e) => updateFaqItem(index, "text", e.target.value)}
                                                placeholder="P: Qual o prazo de entrega?&#10;R: O prazo é de 3 a 5 dias úteis..."
                                                rows={6}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}

                            <Button variant="outline" onClick={addFaqItem} className="w-full">
                                <Plus className="mr-2 h-4 w-4" />
                                {faqItems.length === 0
                                    ? "Adicionar F.A.Q sobre um Produto/Serviço"
                                    : "Adicionar outro F.A.Q sobre um Produto/Serviço"}
                            </Button>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba: Convênio */}
                <TabsContent value="convenio">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Convênios</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Cadastre os convênios aceitos e seus valores.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4 md:space-y-6">
                            {convenioItems.map((item, index) => (
                                <div key={item.id} className="relative border rounded-lg p-4 space-y-4">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeConvenioItem(index)}
                                        className="absolute top-2 right-2 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>

                                    {/* Nome do Convênio */}
                                    <div className="space-y-2 pr-10">
                                        <Label>Nome do Convênio</Label>
                                        <Input
                                            value={item.nome}
                                            onChange={(e) => updateConvenioItem(index, "nome", e.target.value)}
                                            placeholder="Ex: Unimed, Bradesco Saúde..."
                                        />
                                    </div>

                                    {/* Valores */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Valor da Primeira Consulta</Label>
                                            <Input
                                                value={item.valorPrimeira}
                                                onChange={(e) => handleCurrencyChange(index, "valorPrimeira", e.target.value)}
                                                placeholder="R$ 0,00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Valor das Demais Consultas</Label>
                                            <Input
                                                value={item.valorDemais}
                                                onChange={(e) => handleCurrencyChange(index, "valorDemais", e.target.value)}
                                                placeholder="R$ 0,00"
                                            />
                                        </div>
                                    </div>

                                    {/* Previsão de Vaga */}
                                    <div className="space-y-2">
                                        <Label>Previsão de Vaga (em dias)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={item.previsaoDias || ""}
                                            onChange={(e) => updateConvenioItem(index, "previsaoDias", parseInt(e.target.value) || 0)}
                                            placeholder="Ex: 15"
                                            className="w-full md:w-32"
                                        />
                                    </div>
                                </div>
                            ))}

                            <Button variant="outline" onClick={addConvenioItem} className="w-full">
                                <Plus className="mr-2 h-4 w-4" />
                                {convenioItems.length === 0
                                    ? "Adicionar Convênio"
                                    : "Adicionar outro Convênio"}
                            </Button>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba: Configurações */}
                <TabsContent value="settings">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Configurações</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Comportamento e ativação da IA.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-3 md:space-y-6">
                            {/* Ligar IA */}
                            <div className="p-3 md:p-4 border rounded-lg space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Ligar IA</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            {config.ia_on && hasAnyActiveInstance()
                                                ? "Desative todas as instâncias antes de desligar"
                                                : "A IA responderá todos os clientes."}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={config.ia_on}
                                        onCheckedChange={handleIAToggle}
                                        disabled={togglingIA || (config.ia_on && hasAnyActiveInstance())}
                                    />
                                </div>

                                {/* Lista de instâncias quando IA está ligada */}
                                {config.ia_on && (
                                    <div className="space-y-3 pt-3 border-t">
                                        <p className="text-xs text-muted-foreground">
                                            Ative a IA para cada instância desejada:
                                        </p>

                                        {/* Instâncias WhatsApp */}
                                        {whatsappInstances && whatsappInstances.length > 0 && (
                                            <div className="space-y-2">
                                                {whatsappInstances.map((instance) => (
                                                    <div
                                                        key={instance.id}
                                                        className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                                            <span className="text-sm">{instance.name}</span>
                                                            <span className="text-xs text-muted-foreground">(WhatsApp)</span>
                                                        </div>
                                                        <Switch
                                                            checked={instance.ia_on_wpp !== false}
                                                            onCheckedChange={(checked) => handleWhatsappInstanceToggle(instance.id, checked)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Instâncias Instagram */}
                                        {instagramInstances && instagramInstances.length > 0 && (
                                            <div className="space-y-2">
                                                {instagramInstances.map((instance: any) => (
                                                    <div
                                                        key={instance.id}
                                                        className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-pink-500" />
                                                            <span className="text-sm">{instance.account_name}</span>
                                                            <span className="text-xs text-muted-foreground">(Instagram)</span>
                                                        </div>
                                                        <Switch
                                                            checked={instance.ia_on_insta !== false}
                                                            onCheckedChange={(checked) => handleInstagramInstanceToggle(instance.id, checked)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Mensagem se não houver instâncias */}
                                        {(!whatsappInstances || whatsappInstances.length === 0) &&
                                            (!instagramInstances || instagramInstances.length === 0) && (
                                                <p className="text-xs text-muted-foreground italic">
                                                    Nenhuma instância conectada.
                                                </p>
                                            )}
                                    </div>
                                )}
                            </div>

                            {/* Delay de Resposta */}
                            <div className="space-y-2 p-3 md:p-4 border rounded-lg">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Delay (segundos)</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Tempo antes de responder.
                                        </p>
                                    </div>
                                    <Input
                                        type="number"
                                        min={15}
                                        max={120}
                                        value={config.delay}
                                        onChange={(e) => setConfig({ ...config, delay: parseInt(e.target.value) || 15 })}
                                        className="w-full md:w-32"
                                    />
                                </div>
                            </div>

                            {/* Follow Up */}
                            <div className="space-y-3 md:space-y-4 p-3 md:p-4 border rounded-lg">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Follow Up</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Retomar contato após tempo definido.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={config.followup}
                                        onCheckedChange={(checked) => setConfig({ ...config, followup: checked })}
                                    />
                                </div>

                                {config.followup && (
                                    <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                                        {/* Follow Up 1 */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-4">
                                                <Switch
                                                    checked={config.fup1}
                                                    onCheckedChange={(checked) => setConfig({ ...config, fup1: checked })}
                                                />
                                                <span className="font-medium">Follow Up 1</span>
                                            </div>
                                            {config.fup1 && (
                                                <div className="space-y-2 pl-10">
                                                    <div className="flex items-center gap-2">
                                                        <Label>Minutos:</Label>
                                                        <Input
                                                            type="number"
                                                            min={10}
                                                            value={config.fup1_time}
                                                            onChange={(e) => setConfig({ ...config, fup1_time: parseInt(e.target.value) || 60 })}
                                                            className="w-24"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label>Mensagem:</Label>
                                                        <Textarea
                                                            value={config.fup1_message}
                                                            onChange={(e) => setConfig({ ...config, fup1_message: e.target.value })}
                                                            placeholder="Olá! Vi que você não respondeu ainda, posso ajudar?"
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Follow Up 2 */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-4">
                                                <Switch
                                                    checked={config.fup2}
                                                    onCheckedChange={(checked) => setConfig({ ...config, fup2: checked })}
                                                />
                                                <span className="font-medium">Follow Up 2</span>
                                            </div>
                                            {config.fup2 && (
                                                <div className="space-y-2 pl-10">
                                                    <div className="flex items-center gap-2">
                                                        <Label>Minutos:</Label>
                                                        <Input
                                                            type="number"
                                                            min={10}
                                                            value={config.fup2_time}
                                                            onChange={(e) => setConfig({ ...config, fup2_time: parseInt(e.target.value) || 120 })}
                                                            className="w-24"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label>Mensagem:</Label>
                                                        <Textarea
                                                            value={config.fup2_message}
                                                            onChange={(e) => setConfig({ ...config, fup2_message: e.target.value })}
                                                            placeholder="Oi! Ainda estou aqui caso precise de algo."
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Follow Up 3 */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-4">
                                                <Switch
                                                    checked={config.fup3}
                                                    onCheckedChange={(checked) => setConfig({ ...config, fup3: checked })}
                                                />
                                                <span className="font-medium">Follow Up 3</span>
                                            </div>
                                            {config.fup3 && (
                                                <div className="space-y-2 pl-10">
                                                    <div className="flex items-center gap-2">
                                                        <Label>Minutos:</Label>
                                                        <Input
                                                            type="number"
                                                            min={10}
                                                            value={config.fup3_time}
                                                            onChange={(e) => setConfig({ ...config, fup3_time: parseInt(e.target.value) || 180 })}
                                                            className="w-24"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label>Mensagem:</Label>
                                                        <Textarea
                                                            value={config.fup3_message}
                                                            onChange={(e) => setConfig({ ...config, fup3_message: e.target.value })}
                                                            placeholder="Última tentativa! Qualquer dúvida é só chamar."
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* CRM Auto */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg gap-3">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium text-sm md:text-base">CRM Automático</h4>
                                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                        Clientes cadastrados automaticamente.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.crm_auto}
                                    onCheckedChange={handleCrmAutoChange}
                                />
                            </div>

                            {/* Agendamento */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg gap-3">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium text-sm md:text-base">Agendamento</h4>
                                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                        IA prioriza agendar horários.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.scheduling_on}
                                    onCheckedChange={(checked) => setConfig({ ...config, scheduling_on: checked })}
                                />
                            </div>

                            {/* Follow Up horário comercial */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg gap-3">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium text-sm md:text-base">Follow Up comercial</h4>
                                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                        Só entre 7h e 18h.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.followup_business_hours}
                                    onCheckedChange={(checked) => setConfig({ ...config, followup_business_hours: checked })}
                                />
                            </div>

                            {/* Responder Áudios por IA */}
                            <div className="space-y-3 md:space-y-4 p-3 md:p-4 border rounded-lg">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Responder áudios utilizando IA</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            A IA responderá com áudio gerado.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={config.voice}
                                        onCheckedChange={(checked) => setConfig({ ...config, voice: checked })}
                                    />
                                </div>

                                {config.voice && (
                                    <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                                        <div className="space-y-2">
                                            <Label>Gênero da voz do seu agente de IA</Label>
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={config.genre}
                                                    onValueChange={(value) => setConfig({ ...config, genre: value })}
                                                >
                                                    <SelectTrigger className="w-full md:w-48">
                                                        <SelectValue placeholder="Selecione o gênero" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="female">Feminino</SelectItem>
                                                        <SelectItem value="male">Masculino</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <p className="text-xs text-muted-foreground">Selecione o gênero da voz para o seu agente de IA.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modal de confirmação para criar funil IA */}
            <Dialog open={showCreateFunnelModal} onOpenChange={setShowCreateFunnelModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Criar Funil de IA</DialogTitle>
                        <DialogDescription>
                            Deseja criar um funil no CRM dedicado ao atendimento feito pela IA?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowCreateFunnelModal(false)} disabled={creatingFunnel}>
                            Cancelar
                        </Button>
                        <Button onClick={createIAFunnel} disabled={creatingFunnel}>
                            {creatingFunnel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
