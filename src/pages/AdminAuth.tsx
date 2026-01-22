import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Lock, Mail, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import TurnstileWidget from "@/components/TurnstileWidget";

const AdminAuth = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    // Check if already logged in as super-admin
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single();

                if (profile?.role === "super-admin") {
                    navigate("/admin");
                }
            }
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

            // Verify Captcha
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-turnstile', {
                body: { token: captchaToken }
            });

            if (verifyError || !verifyData?.success) {
                toast.error("Falha na verificação de segurança");
                setIsLoading(false);
                return;
            }

            // Sign in
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                toast.error("Credenciais inválidas");
                setIsLoading(false);
                return;
            }

            // Check if user is super-admin
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", authData.user.id)
                .single();

            if (profileError || profile?.role !== "super-admin") {
                toast.error("Acesso negado. Apenas super-admin pode acessar.");
                await supabase.auth.signOut();
                setIsLoading(false);
                return;
            }

            toast.success("Login realizado com sucesso!");
            navigate("/admin");
        } catch (error) {
            toast.error("Erro ao fazer login");
        } finally {
            setIsLoading(false);
        }
    };

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
                        <ShieldAlert className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
                    <CardDescription className="text-gray-400 text-base">
                        Acesso restrito para super-admin
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
                            <TurnstileWidget onVerify={setCaptchaToken} />
                        </div>
                        <Button
                            type="submit"
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02]"
                            disabled={isLoading}
                        >
                            {isLoading ? "Verificando..." : "Entrar como Admin"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="absolute bottom-4 text-gray-600 text-xs">
                © 2024 Clinvia Admin Panel
            </div>
        </div>
    );
};

export default AdminAuth;
