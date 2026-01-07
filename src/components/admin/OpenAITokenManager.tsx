import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Eye, EyeOff, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OpenAITokenManagerProps {
    profileId: string;
    currentToken: string | null;
    tokenInvalid: boolean;
    onTokenUpdated: () => void;
}

const OpenAITokenManager = ({
    profileId,
    currentToken,
    tokenInvalid,
    onTokenUpdated,
}: OpenAITokenManagerProps) => {
    const [token, setToken] = useState(currentToken || "");
    const [showToken, setShowToken] = useState(false);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleTestToken = async () => {
        if (!token.trim()) {
            toast.error("Digite um token para testar");
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            const { data, error } = await supabase.functions.invoke("test-openai-token", {
                body: { token, profileId },
            });

            if (error) {
                setTestResult({ success: false, message: error.message });
            } else if (data?.success) {
                setTestResult({ success: true, message: data.message });
            } else {
                setTestResult({ success: false, message: data?.error || "Token inválido" });
            }
        } catch (err: any) {
            setTestResult({ success: false, message: err.message });
        } finally {
            setTesting(false);
        }
    };

    const handleSaveToken = async () => {
        setSaving(true);
        try {
            const { data, error } = await supabase.functions.invoke("admin-update-profile", {
                body: {
                    profileId,
                    updates: {
                        openai_token: token.trim() || null,
                        openai_token_invalid: false,
                    }
                }
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || "Erro desconhecido");

            toast.success("Token salvo com sucesso!");
            onTokenUpdated();
        } catch (err: any) {
            toast.error("Erro ao salvar token: " + err.message);
        } finally {
            setSaving(false);
        }
    };


    const handleClearToken = async () => {
        setSaving(true);
        try {
            const { data, error } = await supabase.functions.invoke("admin-update-profile", {
                body: {
                    profileId,
                    updates: {
                        openai_token: null,
                        openai_token_invalid: false,
                    }
                }
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || "Erro desconhecido");

            setToken("");
            setTestResult(null);
            toast.success("Token removido com sucesso!");
            onTokenUpdated();
        } catch (err: any) {
            toast.error("Erro ao remover token: " + err.message);
        } finally {
            setSaving(false);
        }
    };


    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                    <Key className="w-5 h-5 text-yellow-500" />
                    Token OpenAI Customizado
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Token Invalid Alert */}
                {tokenInvalid && (
                    <Alert className="bg-red-900/50 border-red-700">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-red-300 ml-2">
                            Token não funciona, favor verificar. O sistema está usando o token padrão.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Token Input */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showToken ? "text" : "password"}
                            value={token}
                            onChange={(e) => {
                                setToken(e.target.value);
                                setTestResult(null);
                            }}
                            placeholder="sk-..."
                            className="bg-gray-800 border-gray-700 text-white pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div
                        className={`flex items-center gap-2 text-sm ${testResult.success ? "text-green-400" : "text-red-400"
                            }`}
                    >
                        {testResult.success ? (
                            <CheckCircle className="w-4 h-4" />
                        ) : (
                            <XCircle className="w-4 h-4" />
                        )}
                        {testResult.message}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-2">
                    <Button
                        onClick={handleTestToken}
                        disabled={testing || !token.trim()}
                        variant="outline"
                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                        {testing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Testando...
                            </>
                        ) : (
                            "Testar Token"
                        )}
                    </Button>
                    <Button
                        onClick={handleSaveToken}
                        disabled={saving || !token.trim()}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            "Salvar"
                        )}
                    </Button>
                    {currentToken && (
                        <Button
                            onClick={handleClearToken}
                            disabled={saving}
                            variant="destructive"
                        >
                            Remover
                        </Button>
                    )}
                </div>

                {/* Info */}
                <p className="text-xs text-gray-500">
                    Se configurado, este token será usado ao invés do token padrão da plataforma.
                    Se o token falhar, o sistema usará automaticamente o token padrão.
                </p>
            </CardContent>
        </Card>
    );
};

export default OpenAITokenManager;
