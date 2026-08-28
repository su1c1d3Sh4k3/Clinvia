/** Página pública que fecha o ciclo de confirmação do cadastro.
 *
 *  O link do e-mail traz ?token=... — a página chama a edge fn signup-confirm
 *  e mostra o resultado. Não exige login (o cadastro ainda nem virou usuário). */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

type Estado =
    | { fase: "carregando" }
    | { fase: "ok"; nome?: string }
    | { fase: "erro"; mensagem: string };

export default function ConfirmEmail() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

    useEffect(() => {
        const token = params.get("token");
        if (!token) {
            setEstado({ fase: "erro", mensagem: "Link inválido: o código de confirmação não veio na URL." });
            return;
        }

        supabase.functions
            .invoke("signup-confirm", { body: { action: "confirm", token } })
            .then(({ data, error }) => {
                if (error) throw error;
                if (!data?.success) {
                    setEstado({ fase: "erro", mensagem: data?.error || "Não foi possível confirmar o seu e-mail." });
                    return;
                }
                setEstado({ fase: "ok", nome: data.full_name });
            })
            .catch(() => {
                setEstado({
                    fase: "erro",
                    mensagem: "Não conseguimos falar com o servidor agora. Tente novamente em alguns minutos.",
                });
            });
    }, [params]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary via-secondary/90 to-tertiary p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-tertiary/30 blur-[100px]" />
            </div>

            <Card className="w-full max-w-md border-white/10 bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl relative z-10">
                <CardContent className="pt-8 pb-8 text-center">
                    <img
                        src="/clinvia-logo-full.png"
                        alt="Clinbia"
                        className="h-9 w-auto object-contain mx-auto mb-8"
                    />

                    {estado.fase === "carregando" && (
                        <>
                            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                            <p className="text-white/70">Confirmando seu e-mail...</p>
                        </>
                    )}

                    {estado.fase === "ok" && (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-white mb-3">E-mail confirmado!</h1>
                            <p className="text-white/70 mb-6">
                                Seu cadastro foi validado e logo nosso time de implementação entrará em
                                contato para liberar seu acesso.
                            </p>
                            <Button
                                onClick={() => navigate("/auth")}
                                variant="outline"
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                Ir para o login
                            </Button>
                        </div>
                    )}

                    {estado.fase === "erro" && (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-white mb-3">Não foi possível confirmar</h1>
                            <p className="text-white/70 mb-6">{estado.mensagem}</p>
                            <Button
                                onClick={() => navigate("/auth")}
                                variant="outline"
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                Voltar ao cadastro
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
