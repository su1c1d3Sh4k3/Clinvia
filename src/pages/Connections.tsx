import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ConnectInstanceDialog } from "@/components/ConnectInstanceDialog";
import { InstanceRow } from "@/components/InstanceRow";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { FaWhatsapp, FaInstagram, FaFacebook } from "react-icons/fa";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Trash2, Shield, ExternalLink } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";

const META_APP_ID = import.meta.env.VITE_META_APP_ID || '1328505766119863';
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || '1804825927169026';

// Confirme se esse ID está correto. Às vezes o .env sobrescreve com um valor antigo de dev.
const INSTAGRAM_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID || '746674508461826';

const Connections = () => {
    const { user } = useAuth();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // WhatsApp State
    const [name, setName] = useState("");
    const [connectDialogOpen, setConnectDialogOpen] = useState(false);
    const [currentPairCode, setCurrentPairCode] = useState<string | null>(null);
    const [currentInstanceName, setCurrentInstanceName] = useState("");
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [pollingInstanceId, setPollingInstanceId] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    // Instagram OAuth State
    const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);

    // Meta Embedded Signup State
    const [isConnectingMeta, setIsConnectingMeta] = useState(false);

    // All Instances Query — filter by provider in JS (provider column not in generated types)
    const { data: allInstances, isLoading: loadingInstances } = useQuery({
        queryKey: ["instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    const instances = allInstances?.filter((i: any) => i.provider !== "meta") || [];
    const metaInstances = allInstances?.filter((i: any) => i.provider === "meta") || [];
    const loadingWhatsApp = loadingInstances;
    const loadingMeta = loadingInstances;

    // Poll for connection status changes
    useEffect(() => {
        if (pollingInstanceId && instances) {
            const instance = instances.find(i => i.id === pollingInstanceId);
            if (instance && instance.status === 'connected') {
                setConnectDialogOpen(false);
                setPollingInstanceId(null);
                setCurrentPairCode(null);
                toast({
                    title: "WhatsApp conectado!",
                    description: "Sua instância está pronta para uso.",
                });
                queryClient.invalidateQueries({ queryKey: ["instances"] });
            }
        }
    }, [instances, pollingInstanceId]);

    // Instagram Instances Query
    const { data: instagramInstances, isLoading: loadingInstagram } = useQuery({
        queryKey: ["instagram-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instagram_instances" as any)
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as any[];
        },
    });

    // Queues Query — usado pelos selects de fila default (WhatsApp e Instagram)
    const { data: queues } = useQuery({
        queryKey: ["queues"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("*")
                .eq("is_active", true);
            if (error) throw error;
            return data;
        },
    });

    // Handle Instagram OAuth callback
    useEffect(() => {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const returnedState = searchParams.get('state');

        // Debug: Log all URL parameters to trace OAuth callback
        console.log('[Instagram OAuth - Connections] Current URL:', window.location.href);
        console.log('[Instagram OAuth - Connections] searchParams entries:', [...searchParams.entries()]);
        console.log('[Instagram OAuth - Connections] code:', code);
        console.log('[Instagram OAuth - Connections] returnedState:', returnedState);
        console.log('[Instagram OAuth - Connections] storedState in localStorage:', localStorage.getItem('instagram_oauth_state'));

        if (error) {
            toast({
                title: "Erro na autorização",
                description: searchParams.get('error_description') || "O usuário cancelou a autorização.",
                variant: "destructive"
            });
            // Clean URL and state
            localStorage.removeItem('instagram_oauth_state');
            navigate('/connections', { replace: true });
            return;
        }

        if (code && user?.id && !isConnectingInstagram) {
            // SECURITY: Validate state parameter to prevent cross-user credential leakage
            const storedState = localStorage.getItem('instagram_oauth_state');

            console.log('[Instagram OAuth - Connections] Validating state...');
            console.log('[Instagram OAuth - Connections] storedState:', storedState);
            console.log('[Instagram OAuth - Connections] returnedState:', returnedState);

            if (!storedState || !returnedState) {
                console.error('[Instagram OAuth] SECURITY WARNING: Missing state parameter');
                console.error('[Instagram OAuth] storedState exists:', !!storedState);
                console.error('[Instagram OAuth] returnedState exists:', !!returnedState);
                toast({
                    title: "Erro de segurança",
                    description: "Parâmetro de estado ausente. Por favor, tente conectar novamente.",
                    variant: "destructive"
                });
                localStorage.removeItem('instagram_oauth_state');
                navigate('/connections', { replace: true });
                return;
            }

            if (storedState !== returnedState) {
                console.error('[Instagram OAuth] SECURITY WARNING: State mismatch! Possible cross-user attack.');
                console.error('[Instagram OAuth] Stored state:', storedState);
                console.error('[Instagram OAuth] Returned state:', returnedState);
                toast({
                    title: "Erro de segurança",
                    description: "Falha na validação de estado. Sessão pode ter sido comprometida. Tente novamente.",
                    variant: "destructive"
                });
                localStorage.removeItem('instagram_oauth_state');
                navigate('/connections', { replace: true });
                return;
            }

            // Validate that the state contains the current user's ID
            try {
                const stateData = JSON.parse(atob(storedState));
                if (stateData.user_id !== user.id) {
                    console.error('[Instagram OAuth] SECURITY WARNING: User ID mismatch in state!');
                    console.error('[Instagram OAuth] State user_id:', stateData.user_id);
                    console.error('[Instagram OAuth] Current user_id:', user.id);
                    toast({
                        title: "Erro de segurança",
                        description: "A sessão do Instagram não corresponde ao usuário atual. Faça login novamente e tente conectar.",
                        variant: "destructive"
                    });
                    localStorage.removeItem('instagram_oauth_state');
                    navigate('/connections', { replace: true });
                    return;
                }
            } catch (e) {
                console.error('[Instagram OAuth] Failed to parse state:', e);
                toast({
                    title: "Erro de segurança",
                    description: "Estado de autenticação inválido. Tente conectar novamente.",
                    variant: "destructive"
                });
                localStorage.removeItem('instagram_oauth_state');
                navigate('/connections', { replace: true });
                return;
            }

            // State validated successfully, proceed with callback
            localStorage.removeItem('instagram_oauth_state');
            handleInstagramOAuthCallback(code);
        }
    }, [searchParams, user?.id]);

    const handleInstagramOAuthCallback = async (code: string) => {
        setIsConnectingInstagram(true);
        toast({
            title: "Conectando Instagram...",
            description: "Aguarde enquanto conectamos sua conta.",
        });

        try {
            // IMPORTANT: redirect_uri must EXACTLY match Meta Dashboard
            // Meta Dashboard is configured for /connections
            const redirectUri = 'https://app.clinbia.ai/connections';

            // Clean the code - remove #_ suffix and any whitespace
            const cleanCode = code.replace(/#_$/, '').trim();

            console.log('[Instagram OAuth] Exchanging code for token...');
            console.log('[Instagram OAuth] Using redirect_uri:', redirectUri);
            console.log('[Instagram OAuth] Raw code:', code);
            console.log('[Instagram OAuth] Clean code:', cleanCode);
            console.log('[Instagram OAuth] Code length:', cleanCode.length);

            const { data, error } = await supabase.functions.invoke('instagram-oauth-callback', {
                body: {
                    code: cleanCode,
                    redirect_uri: redirectUri,
                    user_id: user?.id
                }
            });

            if (error) throw error;

            if (data.success) {
                toast({
                    title: "Instagram conectado!",
                    description: `Conta @${data.account_name} conectada com sucesso.`,
                });
                queryClient.invalidateQueries({ queryKey: ["instagram-instances"] });
            } else {
                throw new Error(data.error || 'Falha na conexão');
            }
        } catch (error: any) {
            console.error('[Instagram OAuth] Error:', error);
            toast({
                title: "Erro ao conectar Instagram",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsConnectingInstagram(false);
            // Clean URL
            navigate('/connections', { replace: true });
        }
    };

    // ── Meta Embedded Signup ──

    // Handle redirect back from Meta signup (edge function redirects here)
    useEffect(() => {
        const metaSignup = searchParams.get('meta_signup');
        if (!metaSignup) return;

        if (metaSignup === 'success') {
            const phone = searchParams.get('phone') || '';
            const name = searchParams.get('name') || '';
            toast({
                title: "WhatsApp Oficial conectado!",
                description: `${name || 'Numero'} ${phone} registrado com sucesso.`,
            });
            queryClient.invalidateQueries({ queryKey: ["meta-instances"] });
        } else if (metaSignup === 'error') {
            const message = searchParams.get('message') || 'Erro desconhecido';
            toast({ title: "Erro na conexão Meta", description: message, variant: "destructive" });
        }

        // Clean URL
        navigate('/connections', { replace: true });
    }, [searchParams]);

    const handleMetaEmbeddedSignup = () => {
        if (!user?.id) {
            toast({ title: "Erro", description: "Você precisa estar logado.", variant: "destructive" });
            return;
        }

        // Open the Meta Embedded Signup onboarding page directly.
        // redirect_uri points to our edge function (meta-embedded-signup)
        // which handles the OAuth token exchange server-side.
        const redirectUri = 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/meta-embedded-signup';
        const extras = JSON.stringify({
            version: 'v4',
            sessionInfoVersion: '3',
            featureType: 'whatsapp_business_app_onboarding',
        });
        const signupUrl = `https://www.facebook.com/v22.0/dialog/oauth` +
            `?client_id=${META_APP_ID}` +
            `&config_id=${META_CONFIG_ID}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&override_default_response_type=true` +
            `&extras=${encodeURIComponent(extras)}`;

        window.open(signupUrl, '_blank', 'width=800,height=700');
        toast({ title: "Signup aberto", description: "Complete o cadastro na janela que foi aberta." });
    };

    const deleteMetaInstanceMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("instances" as any)
                .delete()
                .eq("id", id)
                .eq("provider", "meta");
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meta-instances"] });
            toast({ title: "Instância Meta removida" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
        },
    });

    const handleConnectInstagram = () => {
        if (!user?.id) {
            toast({
                title: "Erro",
                description: "Você precisa estar logado para conectar o Instagram",
                variant: "destructive"
            });
            return;
        }

        // IMPORTANT: redirect_uri must EXACTLY match Meta Dashboard
        const redirectUri = 'https://app.clinbia.ai/connections';

        // Instagram Business Login permissions (only approved ones)
        // IMPORTANT: Use hyphen (-) as separator, NOT comma!
        const scopes = 'instagram_business_basic-instagram_business_manage_messages';

        // Generate state parameter with user_id for security
        const stateData = {
            user_id: user.id,
            timestamp: Date.now(),
            nonce: Math.random().toString(36).substring(7)
        };
        const state = btoa(JSON.stringify(stateData));

        // Store state in localStorage for validation on callback
        localStorage.setItem('instagram_oauth_state', state);

        // Generate logger_id (UUID format like Dealism uses)
        const loggerId = crypto.randomUUID();

        console.log('[Instagram OAuth] Starting Instagram Business Login');
        console.log('[Instagram OAuth] User ID:', user.id);
        console.log('[Instagram OAuth] Scopes:', scopes);

        // =====================================================
        // USING SAME FORMAT AS DEALISM.AI (REVERSE ENGINEERED)
        // URL: instagram.com/consent/?flow=ig_biz_login_oauth
        // Format: params_json with all required fields
        // =====================================================
        const paramsJson = {
            client_id: INSTAGRAM_APP_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            state: state,
            scope: scopes,
            logger_id: loggerId,
            app_id: INSTAGRAM_APP_ID,
            platform_app_id: INSTAGRAM_APP_ID
        };

        const authUrl = `https://www.instagram.com/consent/?flow=ig_biz_login_oauth&params_json=${encodeURIComponent(JSON.stringify(paramsJson))}&source=oauth_permissions_page_www`;

        console.log('[Instagram OAuth] Redirecting to:', authUrl);

        window.location.href = authUrl;
    };

    // WhatsApp Mutations
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!user?.id) throw new Error("User not authenticated");

            const { data, error } = await supabase.functions.invoke(
                "uzapi-create-instance",
                {
                    body: { instanceName: name, userId: user.id },
                }
            );

            if (error) throw error;
            if (!data.success) throw new Error(data.error || "Failed to create instance");

            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
            setName("");
            setCurrentInstanceName(data.instanceName);
            setSelectedInstanceId(data.id);
            setConnectDialogOpen(true);

            toast({
                title: "Instância criada!",
                description: "Agora conecte seu WhatsApp.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao criar instância",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const connectMutation = useMutation({
        mutationFn: async ({ id, phone }: { id: string, phone: string }) => {
            const { data, error } = await supabase.functions.invoke("uzapi-connect-instance", {
                body: { instanceId: id, phoneNumber: phone },
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error || "Failed to generate pair code");
            return data;
        },
        onSuccess: (data) => {
            setCurrentPairCode(data.pairCode);
            setPollingInstanceId(selectedInstanceId);
            toast({
                title: "Código gerado!",
                description: "Verifique seu WhatsApp.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao conectar",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    const checkConnectionMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.functions.invoke("uzapi-manager", {
                body: { action: 'check_connection', instanceId: id },
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
        },
    });

    // Instagram Mutations
    const deleteInstagramMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("instagram_instances" as any)
                .delete()
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instagram-instances"] });
            toast({
                title: "Conta removida",
                description: "A conta do Instagram foi desconectada.",
            });
        },
        onError: () => {
            toast({
                title: "Erro",
                description: "Não foi possível remover a conta.",
                variant: "destructive",
            });
        }
    });

    const refreshInstagramTokenMutation = useMutation({
        mutationFn: async (instanceId: string) => {
            const { data, error } = await supabase.functions.invoke('instagram-refresh-token', {
                body: { instance_id: instanceId }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["instagram-instances"] });
            toast({
                title: "Token atualizado",
                description: `Token renovado! Expira em ${data.expires_in_days} dias.`,
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar token",
                description: error.message || "Não foi possível atualizar o token.",
                variant: "destructive",
            });
        }
    });

    // Atualiza a fila default da instância Instagram (paridade com InstanceRow do WhatsApp)
    const updateInstagramQueueMutation = useMutation({
        mutationFn: async ({ instanceId, queueId }: { instanceId: string, queueId: string | null }) => {
            const { error } = await supabase
                .from("instagram_instances" as any)
                .update({ default_queue_id: queueId === "none" ? null : queueId })
                .eq("id", instanceId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instagram-instances"] });
            toast({
                title: "Fila padrão atualizada",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar fila",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    useEffect(() => {
        if (!pollingInstanceId) return;

        const interval = setInterval(() => {
            checkConnectionMutation.mutate(pollingInstanceId);
        }, 5000);

        return () => clearInterval(interval);
    }, [pollingInstanceId]);

    const handleConnect = (instance: any) => {
        setCurrentInstanceName(instance.name);
        setSelectedInstanceId(instance.id);
        setCurrentPairCode(null);
        setConnectDialogOpen(true);
        setPollingInstanceId(null);
    };

    const handleConfirmConnection = async () => {
        if (selectedInstanceId) {
            setIsConfirming(true);
            try {
                toast({
                    title: "Verificando...",
                    description: "Consultando status da conexão.",
                });

                const data = await checkConnectionMutation.mutateAsync(selectedInstanceId);

                if (data.status === 'connected') {
                    toast({
                        title: "Configurando...",
                        description: "Configurando webhook da instância.",
                    });

                    try {
                        console.log('[WhatsApp] Configuring global webhook via Edge Function...');

                        const { data: webhookResult, error: webhookError } = await supabase.functions.invoke(
                            'uzapi-manager',
                            { body: { action: 'configure_webhook', instanceId: selectedInstanceId } }
                        );

                        if (webhookError) {
                            console.error('[WhatsApp] Webhook configuration error:', webhookError);
                            toast({
                                title: "Aviso",
                                description: "Webhook não configurado automaticamente. Configure manualmente se necessário.",
                                variant: "destructive"
                            });
                        } else {
                            console.log('[WhatsApp] Webhook configured successfully:', webhookResult);
                        }
                    } catch (webhookError) {
                        console.error('[WhatsApp] Error configuring webhook:', webhookError);
                    }

                    setConnectDialogOpen(false);
                    setPollingInstanceId(null);
                    setCurrentPairCode(null);
                    toast({
                        title: "Conectado com sucesso!",
                        description: "A instância está pronta para uso.",
                        variant: "default"
                    });
                    queryClient.invalidateQueries({ queryKey: ["instances"] });
                } else {
                    toast({
                        title: "Ainda não conectado",
                        description: `O status atual é: ${data.status}. Certifique-se de ter digitado o código no WhatsApp.`,
                        variant: "destructive"
                    });
                }
            } catch (error) {
                toast({
                    title: "Erro na verificação",
                    description: "Não foi possível verificar o status.",
                    variant: "destructive"
                });
            } finally {
                setIsConfirming(false);
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'connected':
                return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</Badge>;
            case 'expired':
                return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Token Expirado</Badge>;
            default:
                return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> Desconectado</Badge>;
        }
    };

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Conexões</h1>
                    <p className="text-muted-foreground text-sm md:text-base">
                        Gerencie suas conexões do WhatsApp e Instagram
                    </p>
                </div>

                <Tabs defaultValue="whatsapp" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                            <FaWhatsapp className="h-4 w-4 text-green-500" />
                            <span className="hidden sm:inline">WhatsApp</span>
                            <span className="sm:hidden">WA</span>
                        </TabsTrigger>
                        <TabsTrigger value="meta" className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-500" />
                            <span className="hidden sm:inline">WA Oficial</span>
                            <span className="sm:hidden">Oficial</span>
                        </TabsTrigger>
                        <TabsTrigger value="instagram" className="flex items-center gap-2">
                            <FaInstagram className="h-4 w-4 text-pink-500" />
                            Instagram
                        </TabsTrigger>
                    </TabsList>

                    {/* WhatsApp Tab */}
                    <TabsContent value="whatsapp" className="space-y-4 mt-4">
                        {canCreate('connections') && (
                            <Card>
                                <CardHeader className="p-4 md:p-6">
                                    <CardTitle className="text-base md:text-lg">Nova Instância WhatsApp</CardTitle>
                                    <CardDescription className="text-xs md:text-sm">
                                        Adicione uma nova conexão com a Evolution API
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nome da Instância</Label>
                                            <Input
                                                id="name"
                                                placeholder="Meu WhatsApp"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <Button type="submit" disabled={createMutation.isPending}>
                                            {createMutation.isPending ? "Criando..." : "Criar Instância"}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="p-4 md:p-6">
                                <CardTitle className="text-base md:text-lg">Instâncias WhatsApp</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                {loadingWhatsApp ? (
                                    <p className="text-muted-foreground">Carregando...</p>
                                ) : instances && instances.length > 0 ? (
                                    <div className="space-y-4">
                                        {instances.map((instance) => (
                                            <InstanceRow
                                                key={instance.id}
                                                instance={instance}
                                                onConnect={handleConnect}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">
                                        Nenhuma instância configurada ainda.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Meta WhatsApp Oficial Tab */}
                    <TabsContent value="meta" className="space-y-4 mt-4">
                        <Card>
                            <CardHeader className="p-4 md:p-6">
                                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-blue-500" />
                                    WhatsApp Oficial (Cloud API)
                                </CardTitle>
                                <CardDescription className="text-xs md:text-sm">
                                    Conexão oficial via Meta Cloud API - sem intermediários, com suporte a templates aprovados
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                {loadingMeta ? (
                                    <p className="text-muted-foreground">Carregando...</p>
                                ) : metaInstances && metaInstances.length > 0 ? (
                                    <div className="space-y-4">
                                        {metaInstances.map((instance: any) => (
                                            <div
                                                key={instance.id}
                                                className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border rounded-lg bg-card gap-3 md:gap-4"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="p-2 bg-blue-500/10 rounded-full shrink-0">
                                                        <FaWhatsapp className="h-5 w-5 text-green-500" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-medium truncate">{instance.name || instance.user_name || 'WhatsApp Oficial'}</h4>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            WABA: {instance.meta_waba_id}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            Phone ID: {instance.meta_phone_number_id}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 md:gap-3">
                                                    <Badge
                                                        className={`text-[10px] md:text-xs border ${
                                                            instance.status === "connected"
                                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                                                : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                                                        }`}
                                                    >
                                                        {instance.status === "connected" ? (
                                                            <><CheckCircle2 className="w-3 h-3 mr-1" /> Conectado</>
                                                        ) : (
                                                            <><AlertCircle className="w-3 h-3 mr-1" /> Desconectado</>
                                                        )}
                                                    </Badge>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => navigate('/templates')}
                                                        className="h-7 md:h-8 text-xs md:text-sm"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                                        Templates
                                                    </Button>
                                                    {canDelete('connections') && (
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => deleteMetaInstanceMutation.mutate(instance.id)}
                                                            disabled={deleteMetaInstanceMutation.isPending}
                                                            className="h-7 md:h-8 w-7 md:w-8 p-0"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6">
                                        <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground mb-2">
                                            Nenhuma conexão oficial configurada.
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Conecte seu WhatsApp Business via Meta Cloud API para usar templates aprovados.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {canCreate('connections') && (
                            <Card>
                                <CardHeader className="p-4 md:p-6">
                                    <CardTitle className="text-base md:text-lg">Conectar WhatsApp Oficial</CardTitle>
                                    <CardDescription className="text-xs md:text-sm">
                                        Use o Meta Embedded Signup para conectar sua conta Business
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-muted/50 rounded-lg">
                                            <h4 className="font-medium text-sm mb-2">Requisitos</h4>
                                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                                <li>Conta Meta Business (Facebook Business Manager)</li>
                                                <li>Numero de telefone nao vinculado a outro WhatsApp Business</li>
                                                <li>Acesso de administrador ao Meta Business Suite</li>
                                            </ul>
                                        </div>
                                        <Button
                                            onClick={handleMetaEmbeddedSignup}
                                            disabled={isConnectingMeta}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            {isConnectingMeta ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Conectando...
                                                </>
                                            ) : (
                                                <>
                                                    <FaFacebook className="h-4 w-4 mr-2" />
                                                    Conectar com Meta Business
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* Instagram Tab */}
                    <TabsContent value="instagram" className="space-y-4 mt-4">
                        <Card>
                            <CardHeader className="p-4 md:p-6">
                                <CardTitle className="text-base md:text-lg">Contas do Instagram</CardTitle>
                                <CardDescription className="text-xs md:text-sm">
                                    Gerencie suas contas do Instagram Business conectadas
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                {loadingInstagram ? (
                                    <p className="text-muted-foreground">Carregando...</p>
                                ) : instagramInstances && instagramInstances.length > 0 ? (
                                    <div className="space-y-4">
                                        {instagramInstances.map((instance: any) => (
                                            <div
                                                key={instance.id}
                                                className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border rounded-lg bg-card gap-3 md:gap-4"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="p-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full shrink-0">
                                                        <FaInstagram className="h-5 w-5 text-white" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-medium truncate">{instance.account_name}</h4>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            ID: {instance.instagram_account_id}
                                                        </p>
                                                        {instance.token_expires_at && (
                                                            <p className="text-xs text-muted-foreground">
                                                                Token expira: {new Date(instance.token_expires_at).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4">
                                                    {canEdit('connections') && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Fila:</span>
                                                            <Select
                                                                value={instance.default_queue_id || "none"}
                                                                onValueChange={(value) => updateInstagramQueueMutation.mutate({ instanceId: instance.id, queueId: value })}
                                                            >
                                                                <SelectTrigger className="w-full sm:w-[140px] md:w-[180px] h-8 md:h-9 text-xs md:text-sm">
                                                                    <SelectValue placeholder="Selecione" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">Nenhuma</SelectItem>
                                                                    {queues?.map((queue) => (
                                                                        <SelectItem key={queue.id} value={queue.id}>
                                                                            {queue.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        {getStatusBadge(instance.status)}
                                                        {(canEdit('connections') || canDelete('connections')) && (
                                                            <>
                                                                {canEdit('connections') && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => refreshInstagramTokenMutation.mutate(instance.id)}
                                                                        disabled={refreshInstagramTokenMutation.isPending}
                                                                        title="Atualizar token"
                                                                    >
                                                                        <RefreshCw className={`h-4 w-4 text-green-500 ${refreshInstagramTokenMutation.isPending ? 'animate-spin' : ''}`} />
                                                                    </Button>
                                                                )}
                                                                {canDelete('connections') && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => deleteInstagramMutation.mutate(instance.id)}
                                                                        disabled={deleteInstagramMutation.isPending}
                                                                        title="Remover conta"
                                                                    >
                                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <FaInstagram className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground mb-4">
                                            Nenhuma conta do Instagram conectada ainda.
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Para conectar, acesse o Facebook Developers e configure o webhook.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Instagram Connect Card */}
                        {canCreate('connections') && (
                            <Card>
                                <CardHeader className="p-4 md:p-6">
                                    <CardTitle className="text-base md:text-lg">Conectar nova conta</CardTitle>
                                    <CardDescription className="text-xs md:text-sm">
                                        Conecte sua conta do Instagram Business ou Creator
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-muted/50 rounded-lg">
                                            <h4 className="font-medium text-sm mb-2">Requisitos</h4>
                                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                                <li>Conta do Instagram Business ou Creator</li>
                                                <li>Página do Facebook vinculada à conta</li>
                                                <li>Permissão para gerenciar mensagens</li>
                                            </ul>
                                        </div>
                                        <Button
                                            onClick={handleConnectInstagram}
                                            disabled={isConnectingInstagram}
                                            className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-700 hover:via-pink-700 hover:to-orange-600"
                                        >
                                            {isConnectingInstagram ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Conectando...
                                                </>
                                            ) : (
                                                <>
                                                    <FaInstagram className="h-4 w-4 mr-2" />
                                                    Conectar Instagram
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            <ConnectInstanceDialog
                open={connectDialogOpen}
                onOpenChange={(open) => {
                    if (!isConfirming) {
                        setConnectDialogOpen(open);
                        if (!open) {
                            setPollingInstanceId(null);
                            setCurrentPairCode(null);
                        }
                    }
                }}
                instanceName={currentInstanceName}
                onConnect={async (phone) => {
                    if (selectedInstanceId) {
                        await connectMutation.mutateAsync({ id: selectedInstanceId, phone });
                    }
                }}
                pairCode={currentPairCode}
                isLoading={connectMutation.isPending || isConfirming}
                onConfirm={handleConfirmConnection}
            />
        </div>
    );
};

export default Connections;
