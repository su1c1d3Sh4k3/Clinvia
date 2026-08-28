/** Página pública de redefinição de senha.
 *
 *  O link do e-mail traz ?token=<token_hash> gerado pelo Supabase Auth. A
 *  página troca esse token por uma sessão (verifyOtp) e só então libera o
 *  formulário da nova senha. Fica fora do <Layout /> porque quem chega aqui
 *  ainda não está logado. */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { notifyPasswordChanged } from "@/lib/passwordChangedEmail";
import { toast } from "sonner";
import { CheckCircle, Loader2, Lock, XCircle } from "lucide-react";

type Fase = "validando" | "formulario" | "salvo" | "invalido";

export default function ResetPassword() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [fase, setFase] = useState<Fase>("validando");
    const [erro, setErro] = useState("");
    const [senha, setSenha] = useState("");
    const [confirmacao, setConfirmacao] = useState("");
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        const token = params.get("token");
        if (!token) {
            setErro("Link inválido: o código de redefinição não veio na URL.");
            setFase("invalido");
            return;
        }

        supabase.auth
            .verifyOtp({ type: "recovery", token_hash: token })
            .then(({ error }) => {
                if (error) {
                    setErro("Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".");
                    setFase("invalido");
                    return;
                }
                setFase("formulario");
            })
            .catch(() => {
                setErro("Não conseguimos validar o link agora. Tente novamente em alguns minutos.");
                setFase("invalido");
            });
    }, [params]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (senha.length < 6) {
            toast.error("A senha deve ter pelo menos 6 caracteres.");
            return;
        }
        if (senha !== confirmacao) {
            toast.error("As senhas não coincidem.");
            return;
        }

        setSalvando(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { error } = await supabase.auth.updateUser({ password: senha });
            if (error) throw error;

            // a senha nova já é definitiva: não force a troca no próximo login
            if (userData?.user?.id) {
                await supabase
                    .from("profiles")
                    .update({ must_change_password: false })
                    .eq("id", userData.user.id);
            }

            await notifyPasswordChanged();
            setFase("salvo");
        } catch (error: any) {
            console.error("Reset password error:", error);
            toast.error(error?.message || "Não foi possível salvar a nova senha.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary via-secondary/90 to-tertiary p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-tertiary/30 blur-[100px]" />
            </div>

            <Card className="w-full max-w-md border-white/10 bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl relative z-10">
                <CardContent className="pt-8 pb-8">
                    <img
                        src="/clinvia-logo-full.png"
                        alt="Clinbia"
                        className="h-9 w-auto object-contain mx-auto mb-8"
                    />

                    {fase === "validando" && (
                        <div className="text-center">
                            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                            <p className="text-white/70">Validando o seu link...</p>
                        </div>
                    )}

                    {fase === "invalido" && (
                        <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-white mb-3">Link inválido</h1>
                            <p className="text-white/70 mb-6">{erro}</p>
                            <Button
                                onClick={() => navigate("/auth")}
                                variant="outline"
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                Voltar ao login
                            </Button>
                        </div>
                    )}

                    {fase === "salvo" && (
                        <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-white mb-3">Senha alterada!</h1>
                            <p className="text-white/70 mb-6">
                                Sua nova senha já está valendo. Use-a para entrar na plataforma.
                            </p>
                            <Button
                                onClick={() => navigate("/")}
                                className="bg-primary hover:bg-primary/90 text-white"
                            >
                                Entrar na plataforma
                            </Button>
                        </div>
                    )}

                    {fase === "formulario" && (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            <h1 className="text-2xl font-bold text-white mb-2 text-center">Criar nova senha</h1>
                            <p className="text-white/70 text-sm mb-6 text-center">
                                Escolha uma senha com pelo menos 6 caracteres.
                            </p>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="nova-senha" className="text-white/90">Nova senha</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                                        <Input
                                            id="nova-senha"
                                            type="password"
                                            placeholder="Defina sua nova senha"
                                            value={senha}
                                            onChange={(e) => setSenha(e.target.value)}
                                            required
                                            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirma-senha" className="text-white/90">Confirme a nova senha</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                                        <Input
                                            id="confirma-senha"
                                            type="password"
                                            placeholder="Repita a nova senha"
                                            value={confirmacao}
                                            onChange={(e) => setConfirmacao(e.target.value)}
                                            required
                                            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full bg-primary hover:bg-primary/90 text-white"
                                    disabled={salvando}
                                >
                                    {salvando ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        "Salvar nova senha"
                                    )}
                                </Button>
                            </form>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
