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
import { Building2, Ban, Target, HelpCircle, Settings, Plus, Trash2, Loader2 } from "lucide-react";

interface IAConfigData {
    id?: string;
    user_id?: string;
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

const defaultConfig: IAConfigData = {
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
    const [showCreateFunnelModal, setShowCreateFunnelModal] = useState(false); // Modal de criação do funil IA
    const [creatingFunnel, setCreatingFunnel] = useState(false); // Loading da criação do funil

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
        }
    }, [existingConfig, productsServices]);

    // Parser simples para campos de produto/texto
    // Formato esperado: "1. - NomeProduto:\nconteúdo\n\n2. - OutroProduto:\nconteúdo"
    const parseProductText = (text: string): QualifyItem[] => {
        const items: QualifyItem[] = [];
        if (!text || !text.trim()) return items;

        // Split por dupla quebra de linha para separar blocos
        const blocks = text.split("\n\n");

        for (const block of blocks) {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            // Procurar primeira linha que contém o nome do produto
            const lines = trimmedBlock.split("\n");
            const firstLine = lines[0] || "";

            // Extrair nome do produto: pode ser "1. - NomeProduto:" ou "- NomeProduto:"
            let productName = "";

            // Tentar formato numerado: "1. - NomeProduto:"
            if (firstLine.match(/^\d+\.\s*-\s*.+:$/)) {
                productName = firstLine.replace(/^\d+\.\s*-\s*/, "").replace(/:$/, "").trim();
            }
            // Tentar formato sem número: "- NomeProduto:"
            else if (firstLine.match(/^-\s*.+:$/)) {
                productName = firstLine.replace(/^-\s*/, "").replace(/:$/, "").trim();
            }

            if (productName) {
                // Conteúdo é tudo depois da primeira linha
                const content = lines.slice(1).join("\n").trim();
                const product = productsServices?.find((p) => p.name === productName);

                items.push({
                    productId: product?.id || "",
                    productName,
                    text: content,
                });
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

    // Salvar configuração
    const saveMutation = useMutation({
        mutationFn: async (data: Partial<IAConfigData>) => {
            const payload = {
                ...data,
                user_id: ownerId,
                restrictions: formatRestrictions(),
                qualify: formatProductItems(qualifyItems),
                frequent_questions: formatProductItems(faqItems, companyFaq),
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

    // Handler do switch CRM Auto - verifica se precisa criar funil IA
    const handleCrmAutoChange = async (checked: boolean) => {
        if (checked) {
            // Verificar se já existe funil "IA" para este usuário
            const { data: existingFunnel } = await supabase
                .from("crm_funnels" as any)
                .select("id")
                .eq("user_id", ownerId)
                .ilike("name", "IA")
                .maybeSingle();

            if (!existingFunnel) {
                // Não tem funil IA, mostrar modal de confirmação
                setShowCreateFunnelModal(true);
                return; // Não muda o switch ainda
            }
        }

        // Se já tem funil ou está desativando, atualiza normalmente
        setConfig({ ...config, crm_auto: checked });
    };

    // Criar funil IA com etapas padrão
    const createIAFunnel = async () => {
        setCreatingFunnel(true);
        try {
            // Criar o funil
            const { data: funnel, error: funnelError } = await supabase
                .from("crm_funnels" as any)
                .insert({
                    user_id: ownerId,
                    name: "IA",
                    description: "Funil dedicado ao atendimento da IA"
                })
                .select()
                .single();

            if (funnelError) throw funnelError;

            // Criar as etapas do funil IA
            const stages = [
                { name: "Cliente Novo (IA)", position: 0, color: "#3b82f6", is_system: false },
                { name: "Qualificado (IA)", position: 1, color: "#22c55e", is_system: false },
                { name: "Agendado (IA)", position: 2, color: "#a855f7", is_system: false },
                { name: "Atendimento Humano (IA)", position: 3, color: "#f97316", is_system: false },
                { name: "Follow Up (IA)", position: 4, color: "#eab308", is_system: false },
                { name: "Sem Contato (IA)", position: 997, color: "#6b7280", is_system: true },
                { name: "Sem Interesse (IA)", position: 998, color: "#ef4444", is_system: true },
            ];

            const { error: stagesError } = await supabase
                .from("crm_stages" as any)
                .insert(
                    stages.map(s => ({
                        ...s,
                        funnel_id: funnel.id,
                        user_id: ownerId
                    }))
                );

            if (stagesError) throw stagesError;

            // Atualiza o config e fecha o modal
            setConfig({ ...config, crm_auto: true });
            setShowCreateFunnelModal(false);
            toast.success("Funil IA criado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
        } catch (error) {
            console.error("Erro ao criar funil IA:", error);
            toast.error("Erro ao criar funil IA");
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
        <div className="container mx-auto py-10 max-w-4xl animate-in fade-in duration-500">
            <h1 className="text-3xl font-bold mb-8 text-foreground">Definições de IA</h1>

            <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-5 mb-8">
                    <TabsTrigger value="company" className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Empresa</span>
                    </TabsTrigger>
                    <TabsTrigger value="restrictions" className="flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        <span className="hidden sm:inline">Restrições</span>
                    </TabsTrigger>
                    <TabsTrigger value="qualify" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span className="hidden sm:inline">Qualificação</span>
                    </TabsTrigger>
                    <TabsTrigger value="faq" className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">F.A.Q</span>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        <span className="hidden sm:inline">Configurações</span>
                    </TabsTrigger>
                </TabsList>

                {/* Aba: Sobre a Empresa */}
                <TabsContent value="company">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sobre a Empresa</CardTitle>
                            <CardDescription>
                                Dados fundamentais sobre sua empresa para que a IA tenha o contexto de onde ela trabalha.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome da empresa</Label>
                                    <Input
                                        id="name"
                                        value={config.name}
                                        onChange={(e) => setConfig({ ...config, name: e.target.value })}
                                        placeholder="Nome da sua empresa"
                                    />
                                </div>
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
                        <CardHeader>
                            <CardTitle>Restrições</CardTitle>
                            <CardDescription>
                                Adicione apenas restrições do que a IA NÃO deve fazer. Procure sempre começar cada frase com uma negativa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                        <CardHeader>
                            <CardTitle>Qualificação</CardTitle>
                            <CardDescription>
                                Adicione perguntas de qualificação específicas baseadas em produtos ou serviços oferecidos.
                                Quando a IA finalizar essas perguntas, ela classificará entre 'Qualificado' e 'Desqualificado'.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
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
                        <CardHeader>
                            <CardTitle>F.A.Q (Perguntas e Respostas)</CardTitle>
                            <CardDescription>
                                Adicione as principais dúvidas que seus clientes possam ter a respeito de itens específicos,
                                para que a IA tenha respostas alinhadas com as da empresa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
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

                {/* Aba: Configurações */}
                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configurações</CardTitle>
                            <CardDescription>
                                Configure o comportamento e ativação da IA.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Ligar IA */}
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium">Ligar IA</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Ao ativar esse botão, a IA passará a responder todos os clientes que entrarem em contato.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.ia_on}
                                    onCheckedChange={(checked) => setConfig({ ...config, ia_on: checked })}
                                />
                            </div>

                            {/* Delay de Resposta */}
                            <div className="space-y-2 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium">Delay de Resposta</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Defina o tempo (em segundos) que a IA irá esperar antes de responder.
                                            Isso evita que a IA interrompa mensagens fragmentadas.
                                        </p>
                                    </div>
                                </div>
                                <Input
                                    type="number"
                                    min={15}
                                    max={120}
                                    value={config.delay}
                                    onChange={(e) => setConfig({ ...config, delay: parseInt(e.target.value) || 15 })}
                                    className="w-32"
                                />
                            </div>

                            {/* Follow Up */}
                            <div className="space-y-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium">Follow Up</h4>
                                        <p className="text-sm text-muted-foreground">
                                            O Follow Up serve para sua IA chamar o cliente depois de um tempo definido para retomar o contato.
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
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium">Cadastrar clientes automaticamente no CRM</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Ao ativar, um funil "IA" será criado e todos os clientes serão cadastrados automaticamente.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.crm_auto}
                                    onCheckedChange={handleCrmAutoChange}
                                />
                            </div>

                            {/* Agendamento */}
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium">Ativar agendamento</h4>
                                    <p className="text-sm text-muted-foreground">
                                        A IA vai automaticamente priorizar o agendamento de horários, buscando profissionais e horários disponíveis.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.scheduling_on}
                                    onCheckedChange={(checked) => setConfig({ ...config, scheduling_on: checked })}
                                />
                            </div>

                            {/* Follow Up horário comercial */}
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                    <h4 className="font-medium">Follow Up apenas em horário comercial</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Ao ativar, a IA só fará follow up entre 7:00h e 18:00h.
                                    </p>
                                </div>
                                <Switch
                                    checked={config.followup_business_hours}
                                    onCheckedChange={(checked) => setConfig({ ...config, followup_business_hours: checked })}
                                />
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
