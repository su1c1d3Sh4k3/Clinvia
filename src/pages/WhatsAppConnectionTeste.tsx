import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FaInstagram, FaFacebook } from "react-icons/fa";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";

// =============================================
// PÁGINA DE TESTE — INSTAGRAM via FACEBOOK LOGIN FOR BUSINESS
// =============================================
// Esta é uma versão BETA, isolada da página de conexões oficial.
// Não é exibida no menu lateral. Acesso só pela URL direta:
//   https://app.clinbia.ai/whatsapp-connection-teste
//
// Diferenças vs. fluxo de produção (`/connections`):
//   - OAuth via graph.facebook.com (não graph.instagram.com)
//   - Token recebido é Page Access Token (não Instagram User Token)
//   - Permite que o User Profile API funcione corretamente,
//     resolvendo o problema de novos contatos sem nome/foto.
//
// Pré-requisitos no Meta App Dashboard:
//   1. Produto "Facebook Login for Business" instalado no app
//   2. Permissões aprovadas: instagram_basic, instagram_manage_messages,
//      pages_manage_metadata, pages_show_list
//   3. URL de redirecionamento adicionada:
//      https://app.clinbia.ai/whatsapp-connection-teste
//   4. Webhook configurado para o objeto "Page" apontando para:
//      https://swfshqvvbohnahdyndch.supabase.co/functions/v1/instagram-fb-webhook
//      Subscrito aos campos: messages, messaging_postbacks,
//      messaging_reactions, messaging_seen, messaging_referrals
// =============================================

const FB_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID || "746674508461826";
const GRAPH_VERSION = "v25.0";

// Permissões EXATAS conforme docs Meta 2026 para Messenger Platform Instagram
const SCOPES = [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_manage_metadata",
    "pages_show_list",
].join(",");

interface FBInstance {
    id: string;
    facebook_page_id: string;
    facebook_page_name: string | null;
    instagram_business_account_id: string;
    instagram_username: string | null;
    status: string;
    webhook_subscribed: boolean;
    last_error: string | null;
    user_token_expires_at: string | null;
    created_at: string;
    updated_at: string;
}

const WhatsAppConnectionTeste = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isExchanging, setIsExchanging] = useState(false);

    // Construído dinamicamente para que funcione em dev/staging também
    const redirectUri = useMemo(
        () => `${window.location.origin}/whatsapp-connection-teste`,
        []
    );

    // Lista das instâncias BETA já conectadas para este user
    const { data: instances, isLoading } = useQuery({
        queryKey: ["instagram-fb-instances", user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from("instagram_fb_instances" as any)
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as FBInstance[];
        },
        enabled: !!user?.id,
    });

    // Handler do callback OAuth (chega ?code=... ou ?error=...)
    useEffect(() => {
        const code = searchParams.get("code");
        const errorParam = searchParams.get("error");
        const returnedState = searchParams.get("state");

        if (errorParam) {
            toast({
                title: "Erro na autorização",
                description:
                    searchParams.get("error_description") ||
                    "Login cancelado ou rejeitado.",
                variant: "destructive",
            });
            localStorage.removeItem("ig_fb_oauth_state");
            navigate("/whatsapp-connection-teste", { replace: true });
            return;
        }

        if (!code || !user?.id || isExchanging) return;

        // Validação CSRF do state
        const storedState = localStorage.getItem("ig_fb_oauth_state");
        if (!storedState || storedState !== returnedState) {
            toast({
                title: "Falha de segurança",
                description: "Parâmetro state inválido. Tente novamente.",
                variant: "destructive",
            });
            localStorage.removeItem("ig_fb_oauth_state");
            navigate("/whatsapp-connection-teste", { replace: true });
            return;
        }

        // Troca code → tokens via edge function
        (async () => {
            try {
                setIsExchanging(true);
                const { data, error } = await supabase.functions.invoke(
                    "instagram-fb-oauth-callback",
                    {
                        body: {
                            code,
                            redirect_uri: redirectUri,
                            user_id: user.id,
                        },
                    }
                );

                if (error || !data?.success) {
                    const detail = data?.error || error?.message || "Falha no callback";
                    throw new Error(detail);
                }

                toast({
                    title: "Conectado!",
                    description: data?.message || "Conexão BETA criada com sucesso.",
                });
                queryClient.invalidateQueries({ queryKey: ["instagram-fb-instances"] });
            } catch (err: any) {
                console.error("[IG-FB-OAUTH-CB] Erro:", err);
                toast({
                    title: "Erro ao trocar token",
                    description: err.message,
                    variant: "destructive",
                });
            } finally {
                setIsExchanging(false);
                localStorage.removeItem("ig_fb_oauth_state");
                navigate("/whatsapp-connection-teste", { replace: true });
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, user?.id]);

    const handleConnect = () => {
        if (!user?.id) {
            navigate("/auth");
            return;
        }

        // Gera state CSRF
        const state = btoa(
            JSON.stringify({
                user_id: user.id,
                ts: Date.now(),
                nonce: Math.random().toString(36).substring(2),
            })
        );
        localStorage.setItem("ig_fb_oauth_state", state);

        // OAuth dialog do Facebook (NÃO instagram.com)
        // https://developers.facebook.com/docs/facebook-login/guides/access-tokens/
        const authUrl =
            `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth` +
            `?client_id=${encodeURIComponent(FB_APP_ID)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&state=${encodeURIComponent(state)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(SCOPES)}`;

        console.log("[IG-FB-OAUTH] Redirecionando para:", authUrl);
        window.location.href = authUrl;
    };

    const handleDisconnect = async (instance: FBInstance) => {
        if (!confirm(`Desconectar @${instance.instagram_username || "conta"}?`)) return;

        const { error } = await supabase
            .from("instagram_fb_instances" as any)
            .delete()
            .eq("id", instance.id);

        if (error) {
            toast({ title: "Erro ao desconectar", description: error.message, variant: "destructive" });
            return;
        }
        toast({ title: "Conta desconectada" });
        queryClient.invalidateQueries({ queryKey: ["instagram-fb-instances"] });
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen p-6">
                <Card className="max-w-md">
                    <CardHeader>
                        <CardTitle>Login necessário</CardTitle>
                        <CardDescription>
                            Faça login na plataforma para acessar esta página de teste.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => navigate("/auth")}>Ir para login</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Banner BETA */}
                <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <CardContent className="p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-semibold text-amber-900 dark:text-amber-200">
                                Página BETA — Conexão Instagram via Facebook Login for Business
                            </p>
                            <p className="text-amber-800 dark:text-amber-300/80 mt-1">
                                Este fluxo é um teste isolado. As conexões aqui criadas vão para
                                uma tabela separada (<code>instagram_fb_instances</code>) e não
                                afetam a integração de produção. O objetivo é validar se o User
                                Profile API com Page Access Token resolve o problema de novos
                                contatos chegarem sem nome e foto.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                            <FaInstagram className="text-pink-600" />
                            <span>Instagram (BETA)</span>
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Conexão via Facebook Login for Business — fluxo recomendado pelo Meta em 2026.
                        </p>
                    </div>
                    <Button onClick={handleConnect} disabled={isExchanging} className="gap-2">
                        {isExchanging ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <FaFacebook className="w-4 h-4" />
                        )}
                        Conectar via Facebook
                    </Button>
                </div>

                {/* Loading state */}
                {(isLoading || isExchanging) && (
                    <Card>
                        <CardContent className="p-6 flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">
                                {isExchanging
                                    ? "Trocando código por token e listando suas Páginas…"
                                    : "Carregando contas conectadas…"}
                            </span>
                        </CardContent>
                    </Card>
                )}

                {/* Lista de instâncias BETA */}
                {!isLoading && instances && instances.length === 0 && !isExchanging && (
                    <Card>
                        <CardContent className="p-12 text-center text-muted-foreground">
                            <FaInstagram className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Nenhuma conta conectada (BETA)</p>
                            <p className="text-sm mt-1">
                                Clique em <strong>Conectar via Facebook</strong> para iniciar o fluxo.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {!isLoading &&
                    instances &&
                    instances.length > 0 &&
                    instances.map((inst) => (
                        <Card key={inst.id}>
                            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                                <div className="flex items-start gap-3">
                                    <FaInstagram className="w-8 h-8 text-pink-600 flex-shrink-0" />
                                    <div>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            @{inst.instagram_username || inst.instagram_business_account_id}
                                            {inst.status === "connected" && inst.webhook_subscribed ? (
                                                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-xs gap-1">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Conectado
                                                </Badge>
                                            ) : inst.status === "connected" && !inst.webhook_subscribed ? (
                                                <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                                                    Conectado, webhook não confirmado
                                                </Badge>
                                            ) : (
                                                <Badge variant="destructive" className="text-xs">
                                                    {inst.status}
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="text-xs mt-0.5">
                                            Página: <strong>{inst.facebook_page_name}</strong>
                                            {" · "}
                                            ID: <code className="text-[10px]">{inst.facebook_page_id}</code>
                                        </CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDisconnect(inst)}
                                    className="text-destructive hover:text-destructive"
                                    title="Desconectar"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </CardHeader>
                            {inst.last_error && (
                                <CardContent className="pt-0">
                                    <div className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded p-2 text-red-700 dark:text-red-300">
                                        <strong>Último erro:</strong> {inst.last_error}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                        queryClient.invalidateQueries({ queryKey: ["instagram-fb-instances"] })
                    }
                    className="gap-2"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Atualizar
                </Button>

                {/* Painel de diagnóstico simples */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Resumo técnico</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 font-mono">
                        <div>FB_APP_ID: <code>{FB_APP_ID}</code></div>
                        <div>Graph version: <code>{GRAPH_VERSION}</code></div>
                        <div>redirect_uri: <code>{redirectUri}</code></div>
                        <div>Scopes: <code>{SCOPES}</code></div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default WhatsAppConnectionTeste;
