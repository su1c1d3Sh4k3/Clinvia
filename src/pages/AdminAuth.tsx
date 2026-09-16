import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Lock, Mail, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { toast } from "sonner";
import TurnstileWidget, { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { getOrCreateSessionId, detectDeviceLabel } from "@/hooks/useSessionLock";

/** Tempo que o admin tem para digitar o código antes de voltar para o login. */
const CODE_WINDOW_SECONDS = 60;

/** A edge fn responde no contrato de erros das APIs (`_shared/api-errors.ts`):
 *  o texto humano vem em `message`, tanto no corpo 2xx quanto no corpo de erro
 *  — que o supabase-js embrulha em `error.context`. */
async function invokeAdmin2fa(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-2fa", { body });
    if (error) {
        let detail = "";
        try {
            const parsed = await (error as any).context?.json?.();
            detail = parsed?.message || parsed?.error || "";
        } catch {
            /* resposta sem corpo JSON */
        }
        throw new Error(detail || error.message || "Falha na verificação em duas etapas.");
    }
    if (data?.success === false) throw new Error(data.message || data.error);
    return data as { sent_to?: string[] };
}

const AdminAuth = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<"login" | "code">("login");
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [sentTo, setSentTo] = useState<string[]>([]);
    const [secondsLeft, setSecondsLeft] = useState(CODE_WINDOW_SECONDS);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRef = useRef<TurnstileWidgetHandle>(null);

    // Tokens do Turnstile são de uso único — sempre que uma tentativa falha
    // após a verificação, é preciso gerar um novo desafio
    const resetCaptcha = () => {
        setCaptchaToken(null);
        captchaRef.current?.reset();
    };

    /** Desfaz o login parcial: libera o slot de sessão ANTES do signOut, senão o
     *  próximo login bate em "conta em uso" até o heartbeat ficar stale (2min). */
    const abortLogin = useCallback(async (message: string) => {
        try {
            await (supabase.rpc as any)("release_session", { p_session_id: getOrCreateSessionId() });
        } catch (e) {
            console.warn("[AdminAuth] release_session failed:", e);
        }
        await supabase.auth.signOut();
        setStep("login");
        setCode("");
        setPassword("");
        setSentTo([]);
        setIsLoading(false);
        resetCaptcha();
        toast.error(message);
    }, []);

    // Contagem regressiva da tela do código. Zerou = volta para o login.
    useEffect(() => {
        if (step !== "code") return;
        const id = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(id);
                    abortLogin("Tempo esgotado para informar o código. Faça login novamente.");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [step, abortLogin]);

    // Sessão ainda válida no navegador: só pula o login se a verificação em
    // duas etapas daquela sessão também continuar valendo.
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();
            if (profile?.role !== "super-admin") return;

            const { data: verified } = await (supabase.rpc as any)("admin_2fa_is_verified", {
                p_session_id: getOrCreateSessionId(),
            });
            if (verified) navigate("/admin");
        };
        checkAuth();
    }, [navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            if (!captchaToken) {
                toast.error("Por favor, complete a verificação de segurança (Captcha)");
                setIsLoading(false);
                return;
            }

            // Verify Captcha (Skip on Dev)
            if (!import.meta.env.DEV) {
                const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-turnstile', {
                    body: { token: captchaToken }
                });

                if (verifyError || !verifyData?.success) {
                    toast.error("Falha na verificação de segurança");
                    setIsLoading(false);
                    resetCaptcha();
                    return;
                }
            }

            // Sign in
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                toast.error("Credenciais inválidas");
                setIsLoading(false);
                resetCaptcha();
                return;
            }

            // Acesso: super-admin (profiles) ou membro ativo da equipe do painel (admin_users)
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", authData.user.id)
                .maybeSingle();

            let hasAccess = profile?.role === "super-admin";

            if (!hasAccess) {
                const { data: adminUser } = await supabase
                    .from("admin_users" as any)
                    .select("id")
                    .eq("auth_user_id", authData.user.id)
                    .eq("is_active", true)
                    .maybeSingle();
                hasAccess = !!adminUser;
            }

            if (!hasAccess) {
                toast.error("Acesso negado. Você não faz parte da equipe do painel.");
                await supabase.auth.signOut();
                setIsLoading(false);
                resetCaptcha();
                return;
            }

            // Registra o slot de sessão. O heartbeat do single-session roda em
            // TODA a árvore (AuthCacheManager), inclusive no painel — sem esta
            // chamada não existe linha em active_sessions com este session_id,
            // o heartbeat devolve session_lost e o admin cai fora sozinho.
            const { data: lockData, error: lockErr } = await (supabase.rpc as any)("acquire_session", {
                p_session_id: getOrCreateSessionId(),
                p_device_label: detectDeviceLabel(),
                p_ip: null,
            });

            if (lockErr) {
                console.warn("[AdminAuth] acquire_session failed:", lockErr);
            } else if (lockData?.acquired === false) {
                await supabase.auth.signOut();
                toast.error(
                    `Esta conta já está em uso em ${lockData.device_label || "outro dispositivo"}. ` +
                    "Faça logout no outro dispositivo ou aguarde 2 minutos sem atividade."
                );
                setIsLoading(false);
                resetCaptcha();
                return;
            }

            // Segunda etapa: o código por e-mail é o que de fato libera o painel.
            // Se o e-mail não sai, o login inteiro é desfeito — ninguém entra sem código.
            const sent = await invokeAdmin2fa({
                action: "request",
                session_id: getOrCreateSessionId(),
            });

            setSentTo(sent?.sent_to ?? []);
            setCode("");
            setSecondsLeft(CODE_WINDOW_SECONDS);
            setStep("code");
            setIsLoading(false);
        } catch (error) {
            await abortLogin((error as Error)?.message || "Erro ao fazer login");
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.trim().length < 6) {
            toast.error("Digite os 6 caracteres do código.");
            return;
        }
        setIsLoading(true);
        try {
            await invokeAdmin2fa({
                action: "verify",
                session_id: getOrCreateSessionId(),
                code: code.trim(),
            });
            toast.success("Acesso liberado!");
            navigate("/admin");
        } catch (error) {
            const message = (error as Error)?.message || "Código inválido.";
            // Código queimado ou expirado não tem como ser corrigido nesta tela.
            if (/expirou|bloqueado|última vez/i.test(message)) {
                await abortLogin(message);
                return;
            }
            toast.error(message);
            setCode("");
            setIsLoading(false);
        }
    };

    const timer = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-red-500/10 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-orange-500/10 blur-[100px]" />
                <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-yellow-500/5 blur-[80px]" />
            </div>

            <Card className="w-full max-w-md border-red-500/20 bg-gray-900/80 backdrop-blur-xl shadow-2xl relative z-10">
                <CardHeader className="text-center space-y-2 pb-6">
                    <div className="mx-auto mb-2 flex items-center justify-center gap-2">
                        {step === "code"
                            ? <ShieldCheck className="w-10 h-10 text-red-500" />
                            : <ShieldAlert className="w-10 h-10 text-red-500" />}
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {step === "code" ? "Verificação em duas etapas" : "Painel Administrativo"}
                    </h1>
                    <CardDescription className="text-gray-400 text-base">
                        {step === "code"
                            ? sentTo.length > 0
                                ? `Enviamos um código de 6 caracteres para ${sentTo.join(" e ")}`
                                : "Enviamos um código de 6 caracteres para o e-mail cadastrado"
                            : "Acesso restrito para super-admin"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {step === "code" ? (
                        <form onSubmit={handleVerifyCode} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="admin-code" className="text-gray-300">Código de acesso</Label>
                                <Input
                                    id="admin-code"
                                    autoFocus
                                    autoComplete="one-time-code"
                                    inputMode="text"
                                    maxLength={6}
                                    placeholder="A1B2C3"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                                    className="text-center text-2xl font-mono tracking-[0.5em] h-14 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-600 placeholder:tracking-[0.5em] focus:border-red-500/50 focus:ring-red-500/50"
                                />
                            </div>

                            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                                <Timer className="h-4 w-4 text-red-400" />
                                <span>Esta tela expira em <strong className="text-gray-200">{timer}</strong></span>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02]"
                                disabled={isLoading || code.length < 6}
                            >
                                {isLoading ? "Verificando..." : "Confirmar acesso"}
                            </Button>

                            <button
                                type="button"
                                onClick={() => abortLogin("Login cancelado.")}
                                className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                Voltar para o login
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="admin-email" className="text-gray-300">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                    <Input
                                        id="admin-email"
                                        type="email"
                                        placeholder="admin@clinvia.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="pl-9 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/50"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin-password" className="text-gray-300">Senha</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                    <Input
                                        id="admin-password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="pl-9 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/50"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-center">
                                <TurnstileWidget ref={captchaRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
                            </div>
                            <Button
                                type="submit"
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02]"
                                disabled={isLoading}
                            >
                                {isLoading ? "Verificando..." : "Entrar como Admin"}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>

            <div className="absolute bottom-4 text-gray-600 text-xs">
                © 2024 Clinbia Admin Panel
            </div>
        </div>
    );
};

export default AdminAuth;
