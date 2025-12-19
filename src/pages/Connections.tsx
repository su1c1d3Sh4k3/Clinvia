import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ConnectInstanceDialog } from "@/components/ConnectInstanceDialog";
import { InstanceRow } from "@/components/InstanceRow";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { FaWhatsapp, FaInstagram } from "react-icons/fa";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";

// Instagram App ID from Meta App Dashboard (Instagram Login)
const INSTAGRAM_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID || '746674508461826';

const Connections = () => {
    const { user } = useAuth();
    const { data: userRole } = useUserRole();
    const isAgent = userRole === 'agent';
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

    // WhatsApp Instances Query
    const { data: instances, isLoading: loadingWhatsApp } = useQuery({
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

    // Handle Instagram OAuth callback
    useEffect(() => {
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            toast({
                title: "Erro na autorização",
                description: searchParams.get('error_description') || "O usuário cancelou a autorização.",
                variant: "destructive"
            });
            // Clean URL
            navigate('/connections', { replace: true });
            return;
        }

        if (code && user?.id && !isConnectingInstagram) {
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
            // IMPORTANT: redirect_uri must EXACTLY match what was used in the auth URL
            // Try WITHOUT trailing slash
            const redirectUri = 'https://app.clinvia.ai';

            console.log('[Instagram OAuth] Exchanging code for token...');
            console.log('[Instagram OAuth] Using redirect_uri:', redirectUri);
            console.log('[Instagram OAuth] Code (first 30 chars):', code.substring(0, 30));

            const { data, error } = await supabase.functions.invoke('instagram-oauth-callback', {
                body: {
                    code: code.replace('#_', ''), // Remove the #_ that Instagram appends
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

    const handleConnectInstagram = () => {
        // IMPORTANT: redirect_uri must EXACTLY match what's in Meta Dashboard
        // Try WITHOUT trailing slash
        const redirectUri = 'https://app.clinvia.ai';

        // Instagram Business Login permissions
        const scopes = [
            'instagram_business_basic',
            'instagram_business_manage_messages',
            'instagram_business_manage_comments',
            'instagram_business_content_publish'
        ].join(',');

        // Instagram OAuth endpoint - DO NOT use encodeURIComponent on redirect_uri
        const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}`;

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
            const { data, error } = await supabase.functions.invoke("uzapi-check-connection", {
                body: { instanceId: id },
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
                            'uzapi-configure-webhook',
                            { body: { instanceId: selectedInstanceId } }
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
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                            <FaWhatsapp className="h-4 w-4 text-green-500" />
                            WhatsApp
                        </TabsTrigger>
                        <TabsTrigger value="instagram" className="flex items-center gap-2">
                            <FaInstagram className="h-4 w-4 text-pink-500" />
                            Instagram
                        </TabsTrigger>
                    </TabsList>

                    {/* WhatsApp Tab */}
                    <TabsContent value="whatsapp" className="space-y-4 mt-4">
                        {!isAgent && (
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
                                                className="flex items-center justify-between p-4 border rounded-lg bg-card"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full">
                                                        <FaInstagram className="h-5 w-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium">{instance.account_name}</h4>
                                                        <p className="text-xs text-muted-foreground">
                                                            ID: {instance.instagram_account_id}
                                                        </p>
                                                        {instance.token_expires_at && (
                                                            <p className="text-xs text-muted-foreground">
                                                                Token expira: {new Date(instance.token_expires_at).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {getStatusBadge(instance.status)}
                                                    {!isAgent && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => deleteInstagramMutation.mutate(instance.id)}
                                                            disabled={deleteInstagramMutation.isPending}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    )}
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
                        {!isAgent && (
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
